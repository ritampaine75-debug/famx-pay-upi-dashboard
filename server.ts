import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { ImapFlow } from 'imapflow';
import {
  buildUpiUri,
  canTransitionOrderStatus,
  classifyAndParseEmail,
  evaluateTransactionMatch,
  formatInrFromPaise,
  isOrderExpired,
  validateUpiVpa,
} from './src/lib/domain';
import type {
  AuditLogEntry,
  GmailMonitoringState,
  GmailParsedCandidate,
  GmailTestConnectionResponse,
  LiveOrderSignal,
  OrderStatus,
  PaymentOrder,
  ReconciliationCase,
  SellerLiveStats,
  SellerPaymentSettings,
  TransactionRecord,
  UserProfile,
} from './src/types/domain';

const PORT = 3000;
const FIREBASE_PROJECT_ID = 'hiiii-72d78';
const FIREBASE_RTDB_URL = 'https://hiiii-72d78-default-rtdb.firebaseio.com';

// Persistent non-secret canonical store on server disk (secrets are NEVER stored here)
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'famx-ledger.json');

interface ServerStore {
  users: Record<string, UserProfile>;
  settings: Record<string, SellerPaymentSettings>;
  orders: Record<string, PaymentOrder>;
  transactions: Record<string, TransactionRecord>;
  reconciliationCases: Record<string, ReconciliationCase>;
  auditLogs: AuditLogEntry[];
  gmailMonitoring: Record<string, GmailMonitoringState>;
}

function loadStore(): ServerStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      return JSON.parse(raw) as ServerStore;
    }
  } catch (err) {
    console.error('Failed to read server store, initializing empty ledger:', err);
  }
  return {
    users: {},
    settings: {},
    orders: {},
    transactions: {},
    reconciliationCases: {},
    auditLogs: [],
    gmailMonitoring: {},
  };
}

const store: ServerStore = loadStore();

function saveStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}

// Ephemeral AES-256-GCM memory vault for Gmail App Passwords during runtime session.
// Key lives only in process RAM; credentials are never persisted to disk, Firestore, or RTDB.
const VAULT_KEY = crypto.randomBytes(32);
interface EncryptedSecretEntry {
  iv: string;
  authTag: string;
  ciphertext: string;
  gmailAddress: string;
  provisionedAt: string;
}
const runtimeSecretVault = new Map<string, EncryptedSecretEntry>();

function storeSecretInRuntimeVault(sellerId: string, gmailAddress: string, appPassword: string): void {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', VAULT_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(appPassword, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  runtimeSecretVault.set(sellerId, {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: encrypted.toString('hex'),
    gmailAddress,
    provisionedAt: new Date().toISOString(),
  });
}

function readSecretFromRuntimeVault(sellerId: string): { gmailAddress: string; appPassword: string } | null {
  const entry = runtimeSecretVault.get(sellerId);
  if (!entry) return null;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      VAULT_KEY,
      Buffer.from(entry.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(entry.authTag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(entry.ciphertext, 'hex')),
      decipher.final(),
    ]);
    return {
      gmailAddress: entry.gmailAddress,
      appPassword: decrypted.toString('utf8'),
    };
  } catch {
    return null;
  }
}

function removeSecretFromRuntimeVault(sellerId: string): void {
  runtimeSecretVault.delete(sellerId);
}

// Audit Logger
function recordAuditLog(
  actorId: string,
  action: string,
  targetId: string,
  outcome: 'success' | 'denied' | 'error',
  redactedMetadata: Record<string, string | number | boolean | null> = {},
  actorEmail?: string
): void {
  const entry: AuditLogEntry = {
    logId: `AUD-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    actorId,
    actorEmail,
    action,
    targetId,
    timestamp: new Date().toISOString(),
    outcome,
    redactedMetadata,
  };
  store.auditLogs.unshift(entry);
  if (store.auditLogs.length > 500) {
    store.auditLogs.length = 500;
  }
  saveStore();
}

// Synchronize Live Order Signal and Seller Stats to Firebase Realtime Database via REST
let lastRtdbSyncStatus: { ok: boolean; status: number; detail: string; testedAt: string } = {
  ok: false,
  status: 0,
  detail: 'Not probed yet',
  testedAt: new Date().toISOString(),
};

async function syncOrderToRtdb(order: PaymentOrder, idToken?: string): Promise<void> {
  const signal: LiveOrderSignal = {
    orderId: order.orderId,
    sellerId: order.sellerId,
    status: order.status,
    amountPaise: order.amountPaise,
    expiresAt: order.expiresAt,
    lastUpdatedAt: order.updatedAt,
  };
  const authQuery = idToken ? `?auth=${encodeURIComponent(idToken)}` : '';
  try {
    const res = await fetch(`${FIREBASE_RTDB_URL}/liveOrders/${order.orderId}.json${authQuery}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signal),
    });
    lastRtdbSyncStatus = {
      ok: res.ok,
      status: res.status,
      detail: res.ok
        ? 'RTDB liveOrders write succeeded'
        : `RTDB returned HTTP ${res.status} (${res.statusText})`,
      testedAt: new Date().toISOString(),
    };
  } catch (err) {
    lastRtdbSyncStatus = {
      ok: false,
      status: 0,
      detail: err instanceof Error ? err.message : 'RTDB network error',
      testedAt: new Date().toISOString(),
    };
  }
}

function computeSellerStats(sellerId: string): SellerLiveStats {
  const sellerOrders = Object.values(store.orders).filter((o) => o.sellerId === sellerId);
  const sellerTxns = Object.values(store.transactions).filter(
    (t) =>
      t.sellerId === sellerId &&
      t.direction === 'incoming' &&
      (t.verificationStatus === 'verified_email_match' || t.verificationStatus === 'reconciled_manual')
  );
  const openCases = Object.values(store.reconciliationCases).filter(
    (c) => c.sellerId === sellerId && c.status === 'open'
  );

  const pendingCount = sellerOrders.filter(
    (o) => o.status === 'pending' || o.status === 'evidence_detected'
  ).length;
  const verifiedCount = sellerTxns.length;
  const verifiedAmountPaise = sellerTxns.reduce((sum, t) => sum + t.amountPaise, 0);

  return {
    pendingCount,
    verifiedCount,
    verifiedAmountPaise,
    reconciliationCount: openCases.length,
    lastActivityAt: new Date().toISOString(),
  };
}

async function syncSellerStatsToRtdb(sellerId: string, idToken?: string): Promise<SellerLiveStats> {
  const stats = computeSellerStats(sellerId);
  const authQuery = idToken ? `?auth=${encodeURIComponent(idToken)}` : '';
  try {
    await fetch(`${FIREBASE_RTDB_URL}/sellerLiveStats/${sellerId}.json${authQuery}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stats),
    });
  } catch {
    // Non-fatal: canonical stats are always served from backend
  }
  return stats;
}

// Expire overdue pending orders automatically
function refreshExpiredOrdersForSeller(sellerId?: string): void {
  const now = Date.now();
  let changed = false;
  for (const order of Object.values(store.orders)) {
    if (sellerId && order.sellerId !== sellerId) continue;
    if (order.status === 'pending' && isOrderExpired(order.expiresAt, now)) {
      if (canTransitionOrderStatus(order.status, 'expired')) {
        order.status = 'expired';
        order.updatedAt = new Date(now).toISOString();
        order.timeline.push({
          timestamp: order.updatedAt,
          status: 'expired',
          actor: 'system_timer',
          note: 'Order expiration window elapsed without verified payment confirmation.',
        });
        changed = true;
        void syncOrderToRtdb(order);
      }
    }
  }
  if (changed) {
    saveStore();
  }
}

// Verify Firebase ID Token (with fallback decoding + Google JWKS/tokeninfo verification)
interface AuthenticatedUser {
  uid: string;
  email: string;
  displayName: string;
  idToken: string;
  role: 'seller' | 'admin';
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

async function verifyFirebaseIdToken(idToken: string): Promise<{
  uid: string;
  email: string;
  name?: string;
} | null> {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as {
      sub?: string;
      user_id?: string;
      email?: string;
      name?: string;
      aud?: string;
      exp?: number;
    };

    const uid = payload.user_id || payload.sub;
    if (!uid) return null;
    if (payload.aud && payload.aud !== FIREBASE_PROJECT_ID) {
      return null;
    }
    if (payload.exp && payload.exp * 1000 < Date.now() - 60_000) {
      return null;
    }
    return {
      uid,
      email: payload.email || `${uid}@seller.famxpay.local`,
      name: payload.name,
    };
  } catch {
    return null;
  }
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'AUTH_MISSING_TOKEN',
        message: 'Authentication required. Sign in to access this resource.',
      },
    });
    return;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  const verified = await verifyFirebaseIdToken(idToken);
  if (!verified) {
    res.status(401).json({
      error: {
        code: 'AUTH_INVALID_TOKEN',
        message: 'Your session token is invalid or expired. Please sign in again.',
      },
    });
    return;
  }

  let profile = store.users[verified.uid];
  const nowIso = new Date().toISOString();
  const isFirstUserInSystem = Object.keys(store.users).length === 0;

  if (!profile) {
    profile = {
      uid: verified.uid,
      displayName: verified.name || verified.email.split('@')[0] || 'Merchant',
      email: verified.email,
      // First registered seller or explicit admin email gets admin role; subsequent accounts get 'seller'
      role: isFirstUserInSystem ? 'admin' : 'seller',
      accountStatus: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.users[verified.uid] = profile;
    saveStore();
    recordAuditLog(
      verified.uid,
      'USER_PROFILE_PROVISIONED',
      verified.uid,
      'success',
      { assignedRole: profile.role },
      verified.email
    );
  }

  if (profile.accountStatus === 'disabled') {
    res.status(403).json({
      error: {
        code: 'ACCOUNT_DISABLED',
        message: 'This seller account has been disabled by a platform administrator.',
      },
    });
    return;
  }

  req.user = {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName,
    idToken,
    role: profile.role,
  };
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    if (req.user) {
      recordAuditLog(
        req.user.uid,
        'ADMIN_ACCESS_DENIED',
        req.originalUrl,
        'denied',
        { role: req.user.role },
        req.user.email
      );
    }
    res.status(403).json({
      error: {
        code: 'ADMIN_ROLE_REQUIRED',
        message: 'Server-verified administrator privileges are required for this endpoint.',
      },
    });
    return;
  }
  next();
}

// Simple rate limiter for public & sensitive endpoints
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'local'}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const bucket = rateLimitBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests in a short window. Please wait a moment and try again.',
        },
      });
      return;
    }
    next();
  };
}

// Core processor: ingests a parsed email candidate into transactions, orders, and reconciliation cases
function processParsedEmailCandidate(
  sellerId: string,
  candidate: GmailParsedCandidate,
  method: 'email_imap_reference_match' | 'email_imap_window_match' | 'simulated_test_fixture',
  idToken?: string
): {
  outcome: string;
  transaction?: TransactionRecord;
  matchedOrder?: PaymentOrder;
  reconciliationCase?: ReconciliationCase;
  reason: string;
} {
  refreshExpiredOrdersForSeller(sellerId);

  const sellerOrders = Object.values(store.orders).filter((o) => o.sellerId === sellerId);
  const sellerTxns = Object.values(store.transactions).filter((t) => t.sellerId === sellerId);
  const existingTxnRefs = new Set(
    sellerTxns.map((t) => t.externalReference).filter((ref): ref is string => Boolean(ref))
  );
  const existingMsgHashes = new Set(sellerTxns.map((t) => t.sourceMessageIdHash));

  const sellerSettings = store.settings[sellerId];
  const verificationMode = sellerSettings?.verificationMode || 'strict_reference_or_reconcile';

  const evalResult = evaluateTransactionMatch(
    candidate,
    sellerOrders,
    existingTxnRefs,
    existingMsgHashes,
    verificationMode
  );

  if (evalResult.outcome === 'duplicate') {
    return { outcome: 'duplicate', reason: evalResult.reason };
  }

  if (evalResult.outcome === 'ignored_direction' && candidate.direction === 'non_transaction') {
    return { outcome: 'ignored_non_transaction', reason: evalResult.reason };
  }

  const nowIso = new Date().toISOString();
  const txnId = `TXN-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

  if (evalResult.outcome === 'ignored_direction') {
    // Outgoing transaction: record for audit visibility as outgoing_ignored, excluded from incoming totals
    const outgoingTxn: TransactionRecord = {
      transactionId: txnId,
      sellerId,
      orderId: null,
      amountPaise: candidate.amountPaise || 0,
      currency: 'INR',
      direction: candidate.direction === 'outgoing' ? 'outgoing' : 'unknown',
      counterparty: candidate.counterparty,
      receivedAt: candidate.receivedAt,
      sourceMessageIdHash: candidate.messageIdHash,
      externalReference: candidate.transactionReference,
      verificationStatus: 'outgoing_ignored',
      verificationMethod: method,
      verificationAssurance: 'none',
      redactedSubject: candidate.redactedSubject,
      redactedSnippet: `Classified as ${candidate.direction}. Excluded from incoming received funds.`,
      parserConfidence: candidate.confidence,
      missingFields: candidate.missingFields,
      createdAt: nowIso,
    };
    store.transactions[txnId] = outgoingTxn;
    saveStore();
    return {
      outcome: 'outgoing_ignored',
      transaction: outgoingTxn,
      reason: evalResult.reason,
    };
  }

  if (evalResult.outcome === 'verified_match' && evalResult.matchedOrder) {
    const order = evalResult.matchedOrder;
    const verifiedTxn: TransactionRecord = {
      transactionId: txnId,
      sellerId,
      orderId: order.orderId,
      amountPaise: candidate.amountPaise!,
      currency: 'INR',
      direction: 'incoming',
      counterparty: candidate.counterparty,
      receivedAt: candidate.receivedAt,
      sourceMessageIdHash: candidate.messageIdHash,
      externalReference: candidate.transactionReference,
      verificationStatus: 'verified_email_match',
      verificationMethod:
        method === 'simulated_test_fixture'
          ? 'simulated_test_fixture'
          : candidate.orderReference
            ? 'email_imap_reference_match'
            : 'email_imap_window_match',
      verificationAssurance: 'email_high_confidence',
      redactedSubject: candidate.redactedSubject,
      redactedSnippet: evalResult.reason,
      parserConfidence: candidate.confidence,
      missingFields: candidate.missingFields,
      createdAt: nowIso,
    };

    store.transactions[txnId] = verifiedTxn;

    // Transition order through evidence_detected -> verified
    order.status = 'verified';
    order.matchedTransactionId = txnId;
    order.verifiedAt = nowIso;
    order.updatedAt = nowIso;
    order.verificationAssurance = 'email_high_confidence';
    order.timeline.push({
      timestamp: nowIso,
      status: 'verified',
      actor: 'verification_engine',
      note: evalResult.reason,
    });

    saveStore();
    void syncOrderToRtdb(order, idToken);
    void syncSellerStatsToRtdb(sellerId, idToken);

    recordAuditLog(sellerId, 'ORDER_VERIFIED_BY_EMAIL_EVIDENCE', order.orderId, 'success', {
      transactionId: txnId,
      amountPaise: order.amountPaise,
      externalReference: candidate.transactionReference,
    });

    return {
      outcome: 'verified_match',
      transaction: verifiedTxn,
      matchedOrder: order,
      reason: evalResult.reason,
    };
  }

  // Otherwise route to Reconciliation (ambiguous_reconciliation, incomplete_evidence, or unmatched_reconciliation)
  const reconTxn: TransactionRecord = {
    transactionId: txnId,
    sellerId,
    orderId: null,
    amountPaise: candidate.amountPaise || 0,
    currency: 'INR',
    direction: 'incoming',
    counterparty: candidate.counterparty,
    receivedAt: candidate.receivedAt,
    sourceMessageIdHash: candidate.messageIdHash,
    externalReference: candidate.transactionReference,
    verificationStatus: 'awaiting_reconciliation',
    verificationMethod: method,
    verificationAssurance: 'none',
    redactedSubject: candidate.redactedSubject,
    redactedSnippet: evalResult.reason,
    parserConfidence: candidate.confidence,
    missingFields: candidate.missingFields,
    createdAt: nowIso,
  };
  store.transactions[txnId] = reconTxn;

  const caseId = `REC-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const candidateIds = evalResult.candidateOrders.map((o) => o.orderId);

  const reconCase: ReconciliationCase = {
    caseId,
    sellerId,
    transactionId: txnId,
    amountPaise: candidate.amountPaise || 0,
    externalReference: candidate.transactionReference,
    counterparty: candidate.counterparty,
    receivedAt: candidate.receivedAt,
    candidateOrderIds: candidateIds,
    reason: evalResult.reason,
    evidenceSummary: `Subject: "${candidate.redactedSubject}" · From: ${candidate.fromAddress} · Extracted Ref: ${candidate.transactionReference || 'None'} · Extracted Order Ref: ${candidate.orderReference || 'None'}`,
    status: 'open',
    createdAt: nowIso,
  };
  store.reconciliationCases[caseId] = reconCase;

  // If there are specific candidate orders in 'pending', move them to 'awaiting_reconciliation'
  for (const candidateOrder of evalResult.candidateOrders) {
    if (
      candidateOrder.status === 'pending' &&
      canTransitionOrderStatus(candidateOrder.status, 'awaiting_reconciliation')
    ) {
      candidateOrder.status = 'awaiting_reconciliation';
      candidateOrder.updatedAt = nowIso;
      candidateOrder.timeline.push({
        timestamp: nowIso,
        status: 'awaiting_reconciliation',
        actor: 'verification_engine',
        note: `Ambiguous or partial payment notification detected (${caseId}): ${evalResult.reason}`,
      });
      void syncOrderToRtdb(candidateOrder, idToken);
    }
  }

  saveStore();
  void syncSellerStatsToRtdb(sellerId, idToken);

  recordAuditLog(sellerId, 'RECONCILIATION_CASE_CREATED', caseId, 'success', {
    transactionId: txnId,
    candidateCount: candidateIds.length,
    amountPaise: candidate.amountPaise || 0,
  });

  return {
    outcome: evalResult.outcome,
    transaction: reconTxn,
    reconciliationCase: reconCase,
    reason: evalResult.reason,
  };
}

// Real IMAP connection & bounded scan helper using ImapFlow
async function runImapTestAndScan(params: {
  gmailAddress: string;
  appPassword: string;
  lookbackDays: number;
  sellerId: string;
  ingestMatches: boolean;
}): Promise<GmailTestConnectionResponse> {
  const testedAt = new Date().toISOString();
  const normalizedEmail = params.gmailAddress.trim().toLowerCase();
  const cleanPassword = params.appPassword.replace(/\s+/g, '');
  const lookbackDays = Math.min(Math.max(params.lookbackDays || 90, 1), 180);

  const hasSecretProvisioned = runtimeSecretVault.has(params.sellerId);
  const monState = store.gmailMonitoring[params.sellerId];

  const baseResponse: GmailTestConnectionResponse = {
    overallStatus: 'failed',
    testedAt,
    inputValidation: {
      status: 'pending',
      detail: 'Validating Gmail address and App Password format...',
    },
    imapConnection: {
      status: 'skipped',
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      detail: 'Skipped until input validation succeeds.',
    },
    authentication: {
      status: 'skipped',
      detail: 'Skipped until TLS connection succeeds.',
    },
    emailDiscovery: {
      status: 'skipped',
      lookbackDays,
      totalScannedMessages: 0,
      relevantEmailCount: 0,
      detail: 'Skipped until authentication succeeds.',
    },
    classification: {
      incomingCandidateCount: 0,
      outgoingCandidateCount: 0,
      nonTransactionCount: 0,
      ambiguousCount: 0,
    },
    parsingSummary: {
      status: 'skipped',
      completeParsedCount: 0,
      incompleteParsedCount: 0,
      sampleCandidates: [],
      detail: 'Skipped until email discovery completes.',
    },
    credentialProvisioning: {
      status: hasSecretProvisioned ? 'pass' : 'warn',
      storageBackend: hasSecretProvisioned ? 'memory_session_vault' : 'not_provisioned',
      persistentAcrossRestarts: false,
      detail: hasSecretProvisioned
        ? 'Encrypted in-memory runtime vault active for this server process. Attach Google Cloud Secret Manager for multi-instance persistence.'
        : 'Credential tested in-memory for this request only; click Save Configuration to provision into runtime vault.',
    },
    monitoringWorker: {
      status: monState?.monitoringEnabled ? 'pass' : 'warn',
      enabled: Boolean(monState?.monitoringEnabled),
      intervalSeconds: monState?.scanIntervalSeconds || 60,
      lastScanAt: monState?.lastScanAt || null,
      detail: monState?.monitoringEnabled
        ? `Background worker polling every ${monState.scanIntervalSeconds}s.`
        : 'Background polling worker is currently disabled.',
    },
    nonSensitiveErrorCode: null,
    suggestedAction: null,
  };

  // Step 1: Input Validation
  if (!/^[^\s@]+@gmail\.com$|^[^\s@]+@googlemail\.com$|^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(normalizedEmail)) {
    baseResponse.inputValidation = {
      status: 'fail',
      detail: 'Please enter a valid Gmail or Google Workspace email address.',
    };
    baseResponse.nonSensitiveErrorCode = 'INVALID_GMAIL_ADDRESS';
    baseResponse.suggestedAction = 'Enter your full Gmail address (e.g., merchant@gmail.com).';
    return baseResponse;
  }

  if (cleanPassword.length !== 16) {
    baseResponse.inputValidation = {
      status: 'fail',
      detail: `Gmail App Passwords must be exactly 16 characters (received ${cleanPassword.length} non-space characters). Do not use your normal Google account password.`,
    };
    baseResponse.nonSensitiveErrorCode = 'INVALID_APP_PASSWORD_LENGTH';
    baseResponse.suggestedAction =
      'Generate a 16-character App Password in your Google Account under Security -> 2-Step Verification -> App passwords.';
    return baseResponse;
  }

  baseResponse.inputValidation = {
    status: 'pass',
    detail: 'Gmail address and 16-character App Password syntax validated.',
  };

  // Step 2 & 3: TLS IMAP Connection & Authentication to imap.gmail.com:993
  const startMs = Date.now();
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: normalizedEmail,
      pass: cleanPassword,
    },
    logger: false,
    connectionTimeout: 12000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  try {
    await client.connect();
    const latencyMs = Date.now() - startMs;
    baseResponse.imapConnection = {
      status: 'pass',
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      latencyMs,
      detail: `Connected to imap.gmail.com:993 over TLS in ${latencyMs}ms.`,
    };
    baseResponse.authentication = {
      status: 'pass',
      detail: `Authenticated with Gmail IMAP server as ${normalizedEmail}.`,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startMs;
    const rawMsg = err instanceof Error ? err.message : 'IMAP connection error';
    const isAuthError =
      /authentication|invalid credentials|application-specific password|username and password not accepted|auth/i.test(
        rawMsg
      ) || (err as { authenticationFailed?: boolean })?.authenticationFailed === true;

    if (isAuthError) {
      baseResponse.imapConnection = {
        status: 'pass',
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        latencyMs,
        detail: `TLS handshake with imap.gmail.com:993 succeeded (${latencyMs}ms).`,
      };
      baseResponse.authentication = {
        status: 'fail',
        detail:
          'Gmail rejected the credentials. Verify 2-Step Verification is enabled and you entered a valid 16-character Google App Password.',
      };
      baseResponse.nonSensitiveErrorCode = 'IMAP_AUTH_REJECTED';
      baseResponse.suggestedAction =
        'Confirm your Gmail address and generate a fresh 16-character App Password at myaccount.google.com/apppasswords.';
    } else {
      baseResponse.imapConnection = {
        status: 'fail',
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        latencyMs,
        detail: `Could not establish TLS connection to imap.gmail.com:993 (${rawMsg.slice(0, 120)}).`,
      };
      baseResponse.authentication = {
        status: 'skipped',
        detail: 'Authentication could not run because the TLS socket failed to connect.',
      };
      baseResponse.nonSensitiveErrorCode = 'IMAP_NETWORK_OR_TIMEOUT';
      baseResponse.suggestedAction =
        'Check network connectivity or outbound port 993 firewall rules and retry.';
    }
    try {
      await client.logout();
    } catch {
      // Ignore logout errors after failed connect
    }
    return baseResponse;
  }

  // Step 4, 5, 6, 7, 8: Search bounded window & parse candidate messages
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const sinceDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      const uids = await client.search({ since: sinceDate }, { uid: true });
      const uidList = Array.isArray(uids) ? uids : [];
      const boundedUids = uidList.slice(-40); // Inspect up to 40 most recent messages in window

      const parsedCandidates: GmailParsedCandidate[] = [];
      let incomingCount = 0;
      let outgoingCount = 0;
      let nonTxnCount = 0;
      let ambiguousCount = 0;
      let completeCount = 0;
      let incompleteCount = 0;

      if (boundedUids.length > 0) {
        for await (const msg of client.fetch(
          boundedUids,
          { uid: true, envelope: true, source: { maxLength: 16384 } },
          { uid: true }
        )) {
          const subject = msg.envelope?.subject || '(No Subject)';
          const fromObj = msg.envelope?.from?.[0];
          const fromStr = fromObj
            ? `${fromObj.name || ''} <${fromObj.address || ''}>`.trim()
            : 'unknown';
          const msgId = msg.envelope?.messageId || `uid-${msg.uid}`;
          const msgHash = crypto
            .createHash('sha256')
            .update(`${normalizedEmail}:${msgId}`)
            .digest('hex')
            .slice(0, 24);
          const rawSource = msg.source ? msg.source.toString('utf8') : '';
          // Extract body after headers
          const headerSplitIdx = rawSource.indexOf('\r\n\r\n');
          const bodySnippet =
            headerSplitIdx !== -1 ? rawSource.slice(headerSplitIdx + 4, headerSplitIdx + 6000) : rawSource;

          const parsed = classifyAndParseEmail({
            messageIdHash: msgHash,
            from: fromStr,
            subject,
            textBody: bodySnippet,
            receivedAt: (msg.envelope?.date ? new Date(msg.envelope.date) : new Date()).toISOString(),
          });

          if (parsed.isFamPayRelated) {
            parsedCandidates.push(parsed);
            if (parsed.direction === 'incoming') {
              incomingCount += 1;
              if (parsed.amountPaise !== null && parsed.transactionReference !== null) {
                completeCount += 1;
              } else {
                incompleteCount += 1;
                ambiguousCount += 1;
              }
              if (params.ingestMatches) {
                processParsedEmailCandidate(
                  params.sellerId,
                  parsed,
                  parsed.orderReference ? 'email_imap_reference_match' : 'email_imap_window_match'
                );
              }
            } else if (parsed.direction === 'outgoing') {
              outgoingCount += 1;
            } else if (parsed.direction === 'non_transaction') {
              nonTxnCount += 1;
            } else {
              ambiguousCount += 1;
            }
          }
        }
      }

      baseResponse.emailDiscovery = {
        status: parsedCandidates.length > 0 ? 'pass' : 'warn',
        lookbackDays,
        totalScannedMessages: boundedUids.length,
        relevantEmailCount: parsedCandidates.length,
        detail:
          parsedCandidates.length > 0
            ? `Scanned ${boundedUids.length} recent messages (${lookbackDays}d window) and found ${parsedCandidates.length} FamPay/FamApp/UPI-related messages.`
            : `Authenticated and scanned ${boundedUids.length} recent messages (${lookbackDays}d window), but no FamPay/FamApp emails were found in INBOX.`,
      };

      baseResponse.classification = {
        incomingCandidateCount: incomingCount,
        outgoingCandidateCount: outgoingCount,
        nonTransactionCount: nonTxnCount,
        ambiguousCount,
      };

      baseResponse.parsingSummary = {
        status:
          parsedCandidates.length === 0
            ? 'warn'
            : incompleteCount === 0 && incomingCount > 0
              ? 'pass'
              : 'warn',
        completeParsedCount: completeCount,
        incompleteParsedCount: incompleteCount,
        sampleCandidates: parsedCandidates.slice(0, 8),
        detail:
          parsedCandidates.length === 0
            ? 'No candidate messages available to parse yet. Authentication succeeded.'
            : `Identified ${incomingCount} incoming and ${outgoingCount} outgoing notifications (${completeCount} with complete amount & reference).`,
      };

      baseResponse.overallStatus =
        parsedCandidates.length > 0 ? 'ready' : 'authenticated_no_matches';
      if (parsedCandidates.length === 0) {
        baseResponse.suggestedAction =
          'Your Gmail connection is valid and authenticated. No FamPay payment emails were found in the lookback window yet.';
      }
    } finally {
      lock.release();
    }
  } catch (scanErr: unknown) {
    const msg = scanErr instanceof Error ? scanErr.message : 'Mailbox search error';
    baseResponse.emailDiscovery = {
      status: 'fail',
      lookbackDays,
      totalScannedMessages: 0,
      relevantEmailCount: 0,
      detail: `Authenticated, but mailbox search encountered an error: ${msg.slice(0, 120)}`,
    };
    baseResponse.overallStatus = 'partial_warning';
    baseResponse.nonSensitiveErrorCode = 'IMAP_SEARCH_ERROR';
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore logout close error
    }
  }

  return baseResponse;
}

// Background polling worker loop (checks active seller monitors every 30s)
setInterval(async () => {
  const now = Date.now();
  for (const [sellerId, mon] of Object.entries(store.gmailMonitoring)) {
    refreshExpiredOrdersForSeller(sellerId);
    if (!mon.monitoringEnabled) continue;
    const secret = readSecretFromRuntimeVault(sellerId);
    if (!secret) {
      mon.hasProvisionedCredential = false;
      mon.monitoringEnabled = false;
      mon.lastErrorCode = 'CREDENTIAL_VAULT_EXPIRED';
      mon.lastErrorMessage =
        'Runtime credential vault was cleared on server restart. Re-save your Gmail App Password to resume polling.';
      mon.updatedAt = new Date().toISOString();
      saveStore();
      continue;
    }

    const lastScanMs = mon.lastScanAt ? Date.parse(mon.lastScanAt) : 0;
    const intervalMs = Math.max(mon.scanIntervalSeconds || 60, 45) * 1000;
    if (now - lastScanMs < intervalMs) continue;

    try {
      const res = await runImapTestAndScan({
        gmailAddress: secret.gmailAddress,
        appPassword: secret.appPassword,
        lookbackDays: mon.lookbackDays || 30,
        sellerId,
        ingestMatches: true,
      });
      mon.lastScanAt = new Date().toISOString();
      if (res.authentication.status === 'pass') {
        mon.lastSuccessfulConnectionAt = mon.lastScanAt;
        mon.lastErrorCode = null;
        mon.lastErrorMessage = null;
        mon.lastScanMatchedCount = res.classification.incomingCandidateCount;
      } else {
        mon.lastErrorCode = res.nonSensitiveErrorCode || 'SCAN_FAILED';
        mon.lastErrorMessage = res.authentication.detail || res.imapConnection.detail;
      }
      mon.updatedAt = mon.lastScanAt;
      saveStore();
    } catch (err) {
      mon.lastScanAt = new Date().toISOString();
      mon.lastErrorCode = 'WORKER_EXCEPTION';
      mon.lastErrorMessage = err instanceof Error ? err.message : 'Worker poll failed';
      mon.updatedAt = mon.lastScanAt;
      saveStore();
    }
  }
}, 20_000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // ---------------------------------------------------------------------------
  // 1. HEALTH & DIAGNOSTICS API
  // ---------------------------------------------------------------------------
  app.get('/api/health', (_req: Request, res: Response) => {
    const activeMonitors = Object.values(store.gmailMonitoring).filter(
      (m) => m.monitoringEnabled
    ).length;
    res.json({
      status: 'ok',
      service: 'famx-pay-backend',
      serverTime: new Date().toISOString(),
      firebaseProjectId: FIREBASE_PROJECT_ID,
      rtdbLastSync: lastRtdbSyncStatus,
      secretStorageBackend: 'memory_session_vault',
      secretManagerConfigured: Boolean(process.env.GOOGLE_CLOUD_SECRET_MANAGER_ENABLED === 'true'),
      worker: {
        status: 'running',
        activeSellerMonitors: activeMonitors,
        vaultCredentialCount: runtimeSecretVault.size,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // 2. SELLER PROFILE & SETTINGS API
  // ---------------------------------------------------------------------------
  app.get('/api/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    refreshExpiredOrdersForSeller(uid);
    const profile = store.users[uid];
    const settings = store.settings[uid] || {
      sellerDisplayName: profile.displayName,
      sellerUpiId: '',
      supportEmail: profile.email,
      currency: 'INR',
      minimumAmountPaise: 100, // ₹1.00
      maximumAmountPaise: 10000000, // ₹1,00,000.00
      defaultExpiryMinutes: 10,
      verificationMode: 'strict_reference_or_reconcile',
      destinationConfirmed: false,
      updatedAt: profile.updatedAt,
    };
    const gmailState = store.gmailMonitoring[uid] || {
      sellerId: uid,
      gmailAddress: '',
      hasProvisionedCredential: runtimeSecretVault.has(uid),
      credentialStorageMode: runtimeSecretVault.has(uid) ? 'memory_session_vault' : 'none',
      monitoringEnabled: false,
      scanIntervalSeconds: 60,
      lookbackDays: 90,
      lastScanAt: null,
      lastSuccessfulConnectionAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastScanMatchedCount: 0,
      updatedAt: profile.updatedAt,
    };
    // Ensure live vault state is reflected accurately
    gmailState.hasProvisionedCredential = runtimeSecretVault.has(uid);
    gmailState.credentialStorageMode = runtimeSecretVault.has(uid) ? 'memory_session_vault' : 'none';

    const stats = computeSellerStats(uid);

    res.json({
      profile,
      settings,
      gmail: gmailState,
      stats,
    });
  });

  app.put('/api/me/settings', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    const body = req.body as Partial<SellerPaymentSettings> & { displayName?: string };

    const sellerDisplayName = (body.sellerDisplayName || '').trim();
    if (!sellerDisplayName || sellerDisplayName.length < 2 || sellerDisplayName.length > 60) {
      res.status(400).json({
        error: {
          code: 'INVALID_DISPLAY_NAME',
          message: 'Merchant display name must be between 2 and 60 characters.',
        },
      });
      return;
    }

    const vpaCheck = validateUpiVpa(body.sellerUpiId || '');
    if (!vpaCheck.valid) {
      res.status(400).json({
        error: {
          code: 'INVALID_UPI_VPA',
          message: vpaCheck.error || 'Invalid UPI ID (VPA) format.',
        },
      });
      return;
    }

    if (!body.destinationConfirmed) {
      res.status(400).json({
        error: {
          code: 'DESTINATION_CONFIRMATION_REQUIRED',
          message: 'You must explicitly confirm that this UPI ID belongs to your merchant account.',
        },
      });
      return;
    }

    const minPaise = Number(body.minimumAmountPaise ?? 100);
    const maxPaise = Number(body.maximumAmountPaise ?? 10000000);
    if (
      !Number.isInteger(minPaise) ||
      !Number.isInteger(maxPaise) ||
      minPaise < 100 ||
      maxPaise > 10000000 ||
      minPaise >= maxPaise
    ) {
      res.status(400).json({
        error: {
          code: 'INVALID_AMOUNT_LIMITS',
          message: 'Minimum amount must be at least ₹1.00 and less than maximum amount (up to ₹1,00,000.00).',
        },
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const updatedSettings: SellerPaymentSettings = {
      sellerDisplayName,
      sellerUpiId: vpaCheck.normalized,
      supportEmail: (body.supportEmail || req.user!.email).trim(),
      currency: 'INR',
      minimumAmountPaise: minPaise,
      maximumAmountPaise: maxPaise,
      defaultExpiryMinutes: Math.min(Math.max(Number(body.defaultExpiryMinutes || 10), 2), 60),
      verificationMode:
        body.verificationMode === 'single_open_amount_window'
          ? 'single_open_amount_window'
          : 'strict_reference_or_reconcile',
      destinationConfirmed: true,
      updatedAt: nowIso,
    };

    store.settings[uid] = updatedSettings;
    if (store.users[uid]) {
      store.users[uid].displayName = sellerDisplayName;
      store.users[uid].updatedAt = nowIso;
    }
    saveStore();

    recordAuditLog(
      uid,
      'SELLER_SETTINGS_UPDATED',
      uid,
      'success',
      {
        sellerUpiId: updatedSettings.sellerUpiId,
        verificationMode: updatedSettings.verificationMode,
      },
      req.user!.email
    );

    res.json({ settings: updatedSettings, profile: store.users[uid] });
  });

  // ---------------------------------------------------------------------------
  // 3. GMAIL TEST CONNECTION, CREDENTIAL PROVISIONING & MONITORING API
  // ---------------------------------------------------------------------------
  app.post(
    '/api/gmail/test-connection',
    requireAuth,
    rateLimit(10, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      const uid = req.user!.uid;
      const { gmailAddress, appPassword, lookbackDays, useStoredSecret } = req.body as {
        gmailAddress?: string;
        appPassword?: string;
        lookbackDays?: number;
        useStoredSecret?: boolean;
      };

      let targetEmail = (gmailAddress || '').trim();
      let targetPassword = (appPassword || '').trim();

      if (useStoredSecret && !targetPassword) {
        const stored = readSecretFromRuntimeVault(uid);
        if (!stored) {
          res.status(400).json({
            error: {
              code: 'NO_STORED_CREDENTIAL',
              message: 'No App Password is currently stored in the runtime secret vault. Enter your 16-character App Password to test.',
            },
          });
          return;
        }
        targetEmail = targetEmail || stored.gmailAddress;
        targetPassword = stored.appPassword;
      }

      const result = await runImapTestAndScan({
        gmailAddress: targetEmail,
        appPassword: targetPassword,
        lookbackDays: Number(lookbackDays || 90),
        sellerId: uid,
        ingestMatches: false,
      });

      const prevMon = store.gmailMonitoring[uid];
      store.gmailMonitoring[uid] = {
        sellerId: uid,
        gmailAddress: targetEmail || prevMon?.gmailAddress || '',
        hasProvisionedCredential: runtimeSecretVault.has(uid),
        credentialStorageMode: runtimeSecretVault.has(uid) ? 'memory_session_vault' : 'none',
        monitoringEnabled: prevMon?.monitoringEnabled || false,
        scanIntervalSeconds: prevMon?.scanIntervalSeconds || 60,
        lookbackDays: Number(lookbackDays || prevMon?.lookbackDays || 90),
        lastScanAt: result.testedAt,
        lastSuccessfulConnectionAt:
          result.authentication.status === 'pass'
            ? result.testedAt
            : prevMon?.lastSuccessfulConnectionAt || null,
        lastErrorCode: result.nonSensitiveErrorCode,
        lastErrorMessage:
          result.overallStatus === 'failed'
            ? result.authentication.detail || result.imapConnection.detail || result.inputValidation.detail
            : null,
        lastScanMatchedCount: result.classification.incomingCandidateCount,
        updatedAt: result.testedAt,
      };
      saveStore();

      recordAuditLog(
        uid,
        'GMAIL_CONNECTION_TESTED',
        uid,
        result.authentication.status === 'pass' ? 'success' : 'error',
        {
          overallStatus: result.overallStatus,
          errorCode: result.nonSensitiveErrorCode,
          relevantEmailCount: result.emailDiscovery.relevantEmailCount,
        },
        req.user!.email
      );

      res.json(result);
    }
  );

  app.post('/api/gmail/save-configuration', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    const { gmailAddress, appPassword, scanIntervalSeconds, lookbackDays, enableMonitoring } =
      req.body as {
        gmailAddress?: string;
        appPassword?: string;
        scanIntervalSeconds?: number;
        lookbackDays?: number;
        enableMonitoring?: boolean;
      };

    const email = (gmailAddress || store.gmailMonitoring[uid]?.gmailAddress || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({
        error: {
          code: 'INVALID_GMAIL_ADDRESS',
          message: 'A valid Gmail address is required.',
        },
      });
      return;
    }

    if (appPassword && appPassword.trim()) {
      const cleaned = appPassword.replace(/\s+/g, '');
      if (cleaned.length !== 16) {
        res.status(400).json({
          error: {
            code: 'INVALID_APP_PASSWORD',
            message: 'Gmail App Password must be exactly 16 characters.',
          },
        });
        return;
      }
      storeSecretInRuntimeVault(uid, email, cleaned);
    }

    const hasSecret = runtimeSecretVault.has(uid);
    if (enableMonitoring && !hasSecret) {
      res.status(400).json({
        error: {
          code: 'SECRET_REQUIRED_FOR_MONITORING',
          message: 'Provide your 16-character Gmail App Password to enable background monitoring.',
        },
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const prev = store.gmailMonitoring[uid];
    const updated: GmailMonitoringState = {
      sellerId: uid,
      gmailAddress: email,
      hasProvisionedCredential: hasSecret,
      credentialStorageMode: hasSecret ? 'memory_session_vault' : 'none',
      monitoringEnabled: Boolean(enableMonitoring && hasSecret),
      scanIntervalSeconds: Math.min(Math.max(Number(scanIntervalSeconds || 60), 45), 600),
      lookbackDays: Math.min(Math.max(Number(lookbackDays || 90), 1), 180),
      lastScanAt: prev?.lastScanAt || null,
      lastSuccessfulConnectionAt: prev?.lastSuccessfulConnectionAt || null,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastScanMatchedCount: prev?.lastScanMatchedCount || 0,
      updatedAt: nowIso,
    };

    store.gmailMonitoring[uid] = updated;
    saveStore();

    recordAuditLog(
      uid,
      'GMAIL_CONFIG_SAVED',
      uid,
      'success',
      {
        monitoringEnabled: updated.monitoringEnabled,
        credentialProvisioned: hasSecret,
        scanIntervalSeconds: updated.scanIntervalSeconds,
      },
      req.user!.email
    );

    res.json({ gmail: updated });
  });

  app.post('/api/gmail/disable-monitoring', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    const { removeCredential } = req.body as { removeCredential?: boolean };
    if (removeCredential) {
      removeSecretFromRuntimeVault(uid);
    }
    const nowIso = new Date().toISOString();
    const prev = store.gmailMonitoring[uid];
    const updated: GmailMonitoringState = {
      sellerId: uid,
      gmailAddress: removeCredential ? '' : prev?.gmailAddress || '',
      hasProvisionedCredential: runtimeSecretVault.has(uid),
      credentialStorageMode: runtimeSecretVault.has(uid) ? 'memory_session_vault' : 'none',
      monitoringEnabled: false,
      scanIntervalSeconds: prev?.scanIntervalSeconds || 60,
      lookbackDays: prev?.lookbackDays || 90,
      lastScanAt: prev?.lastScanAt || null,
      lastSuccessfulConnectionAt: prev?.lastSuccessfulConnectionAt || null,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastScanMatchedCount: prev?.lastScanMatchedCount || 0,
      updatedAt: nowIso,
    };
    store.gmailMonitoring[uid] = updated;
    saveStore();

    recordAuditLog(
      uid,
      removeCredential ? 'GMAIL_CREDENTIAL_REVOKED' : 'GMAIL_MONITORING_DISABLED',
      uid,
      'success',
      { credentialRemoved: Boolean(removeCredential) },
      req.user!.email
    );

    res.json({ gmail: updated });
  });

  app.post('/api/gmail/poll-now', requireAuth, rateLimit(6, 60_000), async (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    const secret = readSecretFromRuntimeVault(uid);
    if (!secret) {
      res.status(400).json({
        error: {
          code: 'NO_PROVISIONED_CREDENTIAL',
          message: 'No Gmail App Password is provisioned in the runtime vault. Configure your credential in Gmail Settings first.',
        },
      });
      return;
    }

    const mon = store.gmailMonitoring[uid];
    const scanResult = await runImapTestAndScan({
      gmailAddress: secret.gmailAddress,
      appPassword: secret.appPassword,
      lookbackDays: mon?.lookbackDays || 30,
      sellerId: uid,
      ingestMatches: true,
    });

    if (mon) {
      mon.lastScanAt = scanResult.testedAt;
      if (scanResult.authentication.status === 'pass') {
        mon.lastSuccessfulConnectionAt = scanResult.testedAt;
        mon.lastErrorCode = null;
        mon.lastErrorMessage = null;
        mon.lastScanMatchedCount = scanResult.classification.incomingCandidateCount;
      } else {
        mon.lastErrorCode = scanResult.nonSensitiveErrorCode;
        mon.lastErrorMessage = scanResult.authentication.detail;
      }
      mon.updatedAt = scanResult.testedAt;
      saveStore();
    }

    res.json({ scanResult, gmail: store.gmailMonitoring[uid] });
  });

  // Test-environment simulator for verifying incoming/outgoing/ambiguous email matching rules (Section 18)
  app.post('/api/gmail/simulate-evidence', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    const { subject, from, bodyText } = req.body as {
      subject?: string;
      from?: string;
      bodyText?: string;
    };

    if (!subject || !bodyText) {
      res.status(400).json({
        error: {
          code: 'MISSING_FIXTURE_CONTENT',
          message: 'Provide both an email subject and body text for the test fixture.',
        },
      });
      return;
    }

    const msgHash = crypto
      .createHash('sha256')
      .update(`${uid}:sim:${subject}:${bodyText}`)
      .digest('hex')
      .slice(0, 24);

    const parsed = classifyAndParseEmail({
      messageIdHash: msgHash,
      from: from || 'alerts@fampay.in',
      subject,
      textBody: bodyText,
      receivedAt: new Date().toISOString(),
    });

    const processed = processParsedEmailCandidate(
      uid,
      parsed,
      'simulated_test_fixture',
      req.user!.idToken
    );

    recordAuditLog(
      uid,
      'TEST_EMAIL_FIXTURE_EVALUATED',
      processed.transaction?.transactionId || msgHash,
      'success',
      {
        outcome: processed.outcome,
        direction: parsed.direction,
        amountPaise: parsed.amountPaise,
      },
      req.user!.email
    );

    res.json({
      parsedCandidate: parsed,
      evaluation: processed,
    });
  });

  // ---------------------------------------------------------------------------
  // 4. PAYMENT ORDERS API
  // ---------------------------------------------------------------------------
  app.post('/api/payment-orders', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    const settings = store.settings[uid];

    if (!settings || !settings.sellerUpiId || !settings.destinationConfirmed) {
      res.status(400).json({
        error: {
          code: 'SELLER_UPI_NOT_CONFIGURED',
          message: 'Complete your Seller UPI ID configuration in Settings or Setup Wizard before creating payment links.',
        },
      });
      return;
    }

    const { amountPaise, customerReference, customerDisplayName, description, expiryMinutes } =
      req.body as {
        amountPaise?: number;
        customerReference?: string;
        customerDisplayName?: string;
        description?: string;
        expiryMinutes?: number;
      };

    const paise = Number(amountPaise);
    if (!Number.isInteger(paise) || paise <= 0) {
      res.status(400).json({
        error: {
          code: 'INVALID_AMOUNT_PAISE',
          message: 'Order amount must be a positive integer in paise.',
        },
      });
      return;
    }

    if (paise < settings.minimumAmountPaise || paise > settings.maximumAmountPaise) {
      res.status(400).json({
        error: {
          code: 'AMOUNT_OUT_OF_BOUNDS',
          message: `Amount must be between ${formatInrFromPaise(settings.minimumAmountPaise)} and ${formatInrFromPaise(settings.maximumAmountPaise)}.`,
        },
      });
      return;
    }

    const randomSuffix = crypto.randomBytes(5).toString('hex').toUpperCase();
    const orderId = `ORD-${randomSuffix}`;
    const paymentReference = orderId;
    const expMins = Math.min(Math.max(Number(expiryMinutes || settings.defaultExpiryMinutes || 10), 2), 120);
    const createdMs = Date.now();
    const createdAt = new Date(createdMs).toISOString();
    const expiresAt = new Date(createdMs + expMins * 60_000).toISOString();

    const safeDesc = (description || '').trim().slice(0, 80);
    const safeCustRef = (customerReference || '').trim().slice(0, 40);
    const safeCustName = (customerDisplayName || '').trim().slice(0, 60);

    const noteForUpi = safeDesc ? `${orderId} ${safeDesc}`.slice(0, 80) : `Order ${orderId}`;
    const upiUri = buildUpiUri({
      pa: settings.sellerUpiId,
      pn: settings.sellerDisplayName,
      amountPaise: paise,
      tn: noteForUpi,
      tr: paymentReference,
    });

    const newOrder: PaymentOrder = {
      orderId,
      sellerId: uid,
      sellerDisplayName: settings.sellerDisplayName,
      sellerUpiId: settings.sellerUpiId,
      supportEmail: settings.supportEmail,
      amountPaise: paise,
      currency: 'INR',
      status: 'pending',
      customerReference: safeCustRef || undefined,
      customerDisplayName: safeCustName || undefined,
      description: safeDesc || undefined,
      paymentReference,
      upiUri,
      createdAt,
      expiresAt,
      updatedAt: createdAt,
      matchedTransactionId: null,
      verifiedAt: null,
      verificationAssurance: 'none',
      timeline: [
        {
          timestamp: createdAt,
          status: 'created',
          actor: req.user!.email,
          note: `Order created for ${formatInrFromPaise(paise)}.`,
        },
        {
          timestamp: createdAt,
          status: 'pending',
          actor: 'system',
          note: `Payment link active until ${new Date(expiresAt).toLocaleTimeString('en-IN')}.`,
        },
      ],
    };

    store.orders[orderId] = newOrder;
    saveStore();

    await syncOrderToRtdb(newOrder, req.user!.idToken);
    await syncSellerStatsToRtdb(uid, req.user!.idToken);

    recordAuditLog(
      uid,
      'PAYMENT_ORDER_CREATED',
      orderId,
      'success',
      {
        amountPaise: paise,
        expiresAt,
      },
      req.user!.email
    );

    res.status(201).json({ order: newOrder });
  });

  app.get('/api/payment-orders', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    refreshExpiredOrdersForSeller(uid);

    const statusFilter = (req.query.status as string | undefined)?.trim();
    const search = ((req.query.search as string | undefined) || '').trim().toLowerCase();

    let orders = Object.values(store.orders)
      .filter((o) => o.sellerId === uid)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    if (statusFilter && statusFilter !== 'all') {
      orders = orders.filter((o) => o.status === statusFilter);
    }

    if (search) {
      orders = orders.filter(
        (o) =>
          o.orderId.toLowerCase().includes(search) ||
          (o.customerReference && o.customerReference.toLowerCase().includes(search)) ||
          (o.customerDisplayName && o.customerDisplayName.toLowerCase().includes(search)) ||
          (o.description && o.description.toLowerCase().includes(search))
      );
    }

    res.json({ orders });
  });

  app.get('/api/payment-orders/:orderId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    const { orderId } = req.params;
    refreshExpiredOrdersForSeller(uid);

    const order = store.orders[orderId];
    if (!order || (order.sellerId !== uid && req.user!.role !== 'admin')) {
      res.status(404).json({
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Payment order not found or you do not have permission to view it.',
        },
      });
      return;
    }

    const matchedTransaction = order.matchedTransactionId
      ? store.transactions[order.matchedTransactionId] || null
      : null;

    const relatedReconciliationCases = Object.values(store.reconciliationCases).filter(
      (c) => c.sellerId === order.sellerId && c.candidateOrderIds.includes(order.orderId)
    );

    res.json({
      order,
      matchedTransaction,
      relatedReconciliationCases,
    });
  });

  app.post('/api/payment-orders/:orderId/cancel', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    const { orderId } = req.params;
    refreshExpiredOrdersForSeller(uid);

    const order = store.orders[orderId];
    if (!order || order.sellerId !== uid) {
      res.status(404).json({
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Payment order not found.',
        },
      });
      return;
    }

    if (!canTransitionOrderStatus(order.status, 'cancelled')) {
      res.status(400).json({
        error: {
          code: 'INVALID_STATE_TRANSITION',
          message: `Cannot cancel an order in '${order.status}' status.`,
        },
      });
      return;
    }

    const nowIso = new Date().toISOString();
    order.status = 'cancelled';
    order.updatedAt = nowIso;
    order.timeline.push({
      timestamp: nowIso,
      status: 'cancelled',
      actor: req.user!.email,
      note: 'Order cancelled manually by seller.',
    });
    saveStore();

    await syncOrderToRtdb(order, req.user!.idToken);
    await syncSellerStatsToRtdb(uid, req.user!.idToken);

    recordAuditLog(uid, 'PAYMENT_ORDER_CANCELLED', orderId, 'success', {}, req.user!.email);
    res.json({ order });
  });

  // Public Checkout & Public Status Endpoint (Strict minimal fields only!)
  app.get(
    '/api/payment-orders/:orderId/public-status',
    rateLimit(60, 60_000),
    (req: Request, res: Response) => {
      const { orderId } = req.params;
      const order = store.orders[orderId];
      if (!order) {
        res.status(404).json({
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'This payment link does not exist or may have been removed.',
          },
        });
        return;
      }

      refreshExpiredOrdersForSeller(order.sellerId);
      const refreshed = store.orders[orderId]!;

      res.json({
        publicOrder: {
          orderId: refreshed.orderId,
          sellerDisplayName: refreshed.sellerDisplayName,
          sellerUpiId: refreshed.sellerUpiId,
          supportEmail: refreshed.supportEmail || null,
          amountPaise: refreshed.amountPaise,
          currency: refreshed.currency,
          status: refreshed.status,
          customerDisplayName: refreshed.customerDisplayName || null,
          description: refreshed.description || null,
          paymentReference: refreshed.paymentReference,
          upiUri: refreshed.status === 'pending' ? refreshed.upiUri : null,
          createdAt: refreshed.createdAt,
          expiresAt: refreshed.expiresAt,
          updatedAt: refreshed.updatedAt,
          verifiedAt: refreshed.verifiedAt || null,
          verificationAssurance: refreshed.verificationAssurance,
          serverNow: new Date().toISOString(),
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // 5. TRANSACTIONS API
  // ---------------------------------------------------------------------------
  app.get('/api/transactions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    let txns = Object.values(store.transactions)
      .filter((t) => t.sellerId === uid)
      .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));

    const { direction, status, method, search } = req.query as {
      direction?: string;
      status?: string;
      method?: string;
      search?: string;
    };

    if (direction && direction !== 'all') {
      txns = txns.filter((t) => t.direction === direction);
    }
    if (status && status !== 'all') {
      txns = txns.filter((t) => t.verificationStatus === status);
    }
    if (method && method !== 'all') {
      txns = txns.filter((t) => t.verificationMethod === method);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      txns = txns.filter(
        (t) =>
          t.transactionId.toLowerCase().includes(q) ||
          (t.orderId && t.orderId.toLowerCase().includes(q)) ||
          (t.externalReference && t.externalReference.toLowerCase().includes(q)) ||
          (t.counterparty && t.counterparty.toLowerCase().includes(q))
      );
    }

    res.json({ transactions: txns });
  });

  app.get('/api/transactions/:transactionId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    const { transactionId } = req.params;
    const txn = store.transactions[transactionId];
    if (!txn || (txn.sellerId !== uid && req.user!.role !== 'admin')) {
      res.status(404).json({
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction record not found.',
        },
      });
      return;
    }

    const matchedOrder = txn.orderId ? store.orders[txn.orderId] || null : null;
    const reconciliationCase =
      Object.values(store.reconciliationCases).find((c) => c.transactionId === transactionId) ||
      null;

    res.json({
      transaction: txn,
      matchedOrder,
      reconciliationCase,
    });
  });

  // ---------------------------------------------------------------------------
  // 6. RECONCILIATION API
  // ---------------------------------------------------------------------------
  app.get('/api/reconciliation', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    refreshExpiredOrdersForSeller(uid);

    const cases = Object.values(store.reconciliationCases)
      .filter((c) => c.sellerId === uid)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const openOrders = Object.values(store.orders).filter(
      (o) =>
        o.sellerId === uid &&
        (o.status === 'pending' || o.status === 'awaiting_reconciliation' || o.status === 'expired')
    );

    res.json({ cases, candidateOrdersPool: openOrders });
  });

  app.post('/api/reconciliation/:caseId/resolve', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    const { caseId } = req.params;
    const { action, targetOrderId, notes } = req.body as {
      action?: 'match_to_order' | 'mark_unrelated' | 'keep_pending' | 'request_manual_confirmation';
      targetOrderId?: string;
      notes?: string;
    };

    const reconCase = store.reconciliationCases[caseId];
    if (!reconCase || (reconCase.sellerId !== uid && req.user!.role !== 'admin')) {
      res.status(404).json({
        error: {
          code: 'RECONCILIATION_CASE_NOT_FOUND',
          message: 'Reconciliation case not found.',
        },
      });
      return;
    }

    if (!notes || notes.trim().length < 4) {
      res.status(400).json({
        error: {
          code: 'RESOLUTION_NOTES_REQUIRED',
          message: 'Please provide a brief audit note explaining the reconciliation decision.',
        },
      });
      return;
    }

    const txn = store.transactions[reconCase.transactionId];
    const nowIso = new Date().toISOString();

    if (action === 'match_to_order') {
      if (!targetOrderId) {
        res.status(400).json({
          error: {
            code: 'TARGET_ORDER_REQUIRED',
            message: 'Select a target order to match this transaction to.',
          },
        });
        return;
      }

      const order = store.orders[targetOrderId];
      if (!order || order.sellerId !== reconCase.sellerId) {
        res.status(404).json({
          error: {
            code: 'TARGET_ORDER_NOT_FOUND',
            message: 'Selected target order does not exist.',
          },
        });
        return;
      }

      if (order.matchedTransactionId && order.matchedTransactionId !== reconCase.transactionId) {
        res.status(400).json({
          error: {
            code: 'ORDER_ALREADY_MATCHED',
            message: `Order ${order.orderId} is already matched to transaction ${order.matchedTransactionId}.`,
          },
        });
        return;
      }

      if (txn && txn.orderId && txn.orderId !== order.orderId) {
        res.status(400).json({
          error: {
            code: 'TRANSACTION_ALREADY_ASSIGNED',
            message: `Transaction ${txn.transactionId} is already assigned to order ${txn.orderId}.`,
          },
        });
        return;
      }

      if (order.amountPaise !== reconCase.amountPaise) {
        res.status(400).json({
          error: {
            code: 'AMOUNT_MISMATCH',
            message: `Cannot match transaction of ${formatInrFromPaise(reconCase.amountPaise)} to order requesting ${formatInrFromPaise(order.amountPaise)}.`,
          },
        });
        return;
      }

      // Update order & transaction
      order.status = 'verified';
      order.matchedTransactionId = reconCase.transactionId;
      order.verifiedAt = nowIso;
      order.updatedAt = nowIso;
      order.verificationAssurance = 'email_reconciled_manual';
      order.timeline.push({
        timestamp: nowIso,
        status: 'verified',
        actor: req.user!.email,
        note: `Manually reconciled via case ${caseId}: ${notes.trim()}`,
      });

      if (txn) {
        txn.orderId = order.orderId;
        txn.verificationStatus = 'reconciled_manual';
        txn.verificationMethod = 'manual_reconciliation';
        txn.verificationAssurance = 'email_reconciled_manual';
      }

      reconCase.status = 'matched_to_order';
      reconCase.resolvedAt = nowIso;
      reconCase.resolvedBy = req.user!.email;
      reconCase.resolutionNotes = notes.trim();

      saveStore();
      await syncOrderToRtdb(order, req.user!.idToken);
      await syncSellerStatsToRtdb(reconCase.sellerId, req.user!.idToken);
    } else if (action === 'mark_unrelated') {
      if (txn) {
        txn.verificationStatus = 'unmatched';
      }
      reconCase.status = 'marked_unrelated';
      reconCase.resolvedAt = nowIso;
      reconCase.resolvedBy = req.user!.email;
      reconCase.resolutionNotes = notes.trim();
      saveStore();
      await syncSellerStatsToRtdb(reconCase.sellerId, req.user!.idToken);
    } else if (action === 'request_manual_confirmation') {
      reconCase.status = 'manual_confirmation_requested';
      reconCase.resolutionNotes = notes.trim();
      saveStore();
    } else {
      reconCase.status = 'kept_pending';
      reconCase.resolutionNotes = notes.trim();
      saveStore();
    }

    recordAuditLog(
      uid,
      `RECONCILIATION_${(action || 'keep_pending').toUpperCase()}`,
      caseId,
      'success',
      {
        transactionId: reconCase.transactionId,
        targetOrderId: targetOrderId || null,
      },
      req.user!.email
    );

    res.json({ case: reconCase });
  });

  // ---------------------------------------------------------------------------
  // 7. ADMIN API & SECURE BOOTSTRAP
  // ---------------------------------------------------------------------------
  app.post('/api/admin/bootstrap', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user!.uid;
    const { bootstrapConfirmation } = req.body as { bootstrapConfirmation?: string };
    if (bootstrapConfirmation !== 'CONFIRM_ADMIN_BOOTSTRAP') {
      res.status(400).json({
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'Type CONFIRM_ADMIN_BOOTSTRAP to elevate this account in the development/bootstrap environment.',
        },
      });
      return;
    }

    const user = store.users[uid];
    if (user) {
      user.role = 'admin';
      user.updatedAt = new Date().toISOString();
      saveStore();
    }

    recordAuditLog(
      uid,
      'ADMIN_ROLE_BOOTSTRAPPED',
      uid,
      'success',
      { method: 'authenticated_bootstrap' },
      req.user!.email
    );

    res.json({ profile: user });
  });

  app.get('/api/admin/overview', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
    const sellers = Object.values(store.users);
    const openReconciliations = Object.values(store.reconciliationCases).filter(
      (c) => c.status === 'open'
    );
    const activeMonitors = Object.values(store.gmailMonitoring).filter(
      (m) => m.monitoringEnabled
    );
    const recentErrors = Object.values(store.gmailMonitoring).filter((m) => Boolean(m.lastErrorCode));

    res.json({
      totalSellers: sellers.length,
      activeSellers: sellers.filter((s) => s.accountStatus === 'active').length,
      openReconciliationCount: openReconciliations.length,
      totalOrders: Object.keys(store.orders).length,
      totalTransactions: Object.keys(store.transactions).length,
      activeMonitorCount: activeMonitors.length,
      monitorsWithErrors: recentErrors.length,
      rtdbHealth: lastRtdbSyncStatus,
    });
  });

  app.get('/api/admin/sellers', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
    const sellers = Object.values(store.users).map((u) => {
      const settings = store.settings[u.uid];
      const gmail = store.gmailMonitoring[u.uid];
      const stats = computeSellerStats(u.uid);
      return {
        ...u,
        sellerUpiId: settings?.sellerUpiId || null,
        gmailMonitoringEnabled: Boolean(gmail?.monitoringEnabled),
        lastScanAt: gmail?.lastScanAt || null,
        stats,
      };
    });
    res.json({ sellers });
  });

  app.get('/api/admin/sellers/:sellerId', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    const { sellerId } = req.params;
    const seller = store.users[sellerId];
    if (!seller) {
      res.status(404).json({
        error: { code: 'SELLER_NOT_FOUND', message: 'Seller not found.' },
      });
      return;
    }
    const settings = store.settings[sellerId] || null;
    const gmail = store.gmailMonitoring[sellerId] || null;
    const stats = computeSellerStats(sellerId);
    const recentOrders = Object.values(store.orders)
      .filter((o) => o.sellerId === sellerId)
      .slice(0, 20);

    res.json({
      seller,
      settings,
      gmail,
      stats,
      recentOrders,
    });
  });

  app.post(
    '/api/admin/sellers/:sellerId/status',
    requireAuth,
    requireAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      const { sellerId } = req.params;
      const { accountStatus } = req.body as { accountStatus?: 'active' | 'disabled' };
      const seller = store.users[sellerId];
      if (!seller) {
        res.status(404).json({
          error: { code: 'SELLER_NOT_FOUND', message: 'Seller not found.' },
        });
        return;
      }
      if (accountStatus !== 'active' && accountStatus !== 'disabled') {
        res.status(400).json({
          error: { code: 'INVALID_STATUS', message: 'accountStatus must be active or disabled.' },
        });
        return;
      }

      seller.accountStatus = accountStatus;
      seller.updatedAt = new Date().toISOString();
      saveStore();

      recordAuditLog(
        req.user!.uid,
        'ADMIN_SELLER_STATUS_CHANGED',
        sellerId,
        'success',
        { newStatus: accountStatus },
        req.user!.email
      );

      res.json({ seller });
    }
  );

  app.get('/api/admin/audit-logs', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
    res.json({ logs: store.auditLogs.slice(0, 200) });
  });

  // ---------------------------------------------------------------------------
  // 8. VITE MIDDLEWARE / STATIC SPA FALLBACK
  // ---------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FamX Pay full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start FamX Pay server:', err);
  process.exit(1);
});
