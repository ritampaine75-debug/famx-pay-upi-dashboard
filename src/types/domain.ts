export type UserRole = 'seller' | 'admin';

export type AccountStatus = 'active' | 'disabled' | 'pending_setup';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export type VerificationMode = 'strict_reference_or_reconcile' | 'single_open_amount_window';

export interface SellerPaymentSettings {
  sellerDisplayName: string;
  sellerUpiId: string;
  supportEmail: string;
  currency: 'INR';
  minimumAmountPaise: number;
  maximumAmountPaise: number;
  defaultExpiryMinutes: number;
  verificationMode: VerificationMode;
  destinationConfirmed: boolean;
  updatedAt: string;
}

export type OrderStatus =
  | 'created'
  | 'pending'
  | 'evidence_detected'
  | 'awaiting_reconciliation'
  | 'verified'
  | 'expired'
  | 'cancelled'
  | 'verification_failed';

export type VerificationAssurance =
  | 'none'
  | 'email_high_confidence'
  | 'email_reconciled_manual'
  | 'official_provider';

export interface OrderTimelineEvent {
  timestamp: string;
  status: OrderStatus;
  actor: string;
  note: string;
}

export interface PaymentOrder {
  orderId: string;
  sellerId: string;
  sellerDisplayName: string;
  sellerUpiId: string;
  supportEmail?: string;
  amountPaise: number;
  currency: 'INR';
  status: OrderStatus;
  customerReference?: string;
  customerDisplayName?: string;
  description?: string;
  paymentReference: string;
  upiUri: string;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  matchedTransactionId?: string | null;
  verifiedAt?: string | null;
  verificationAssurance: VerificationAssurance;
  timeline: OrderTimelineEvent[];
}

export type PaymentDirection = 'incoming' | 'outgoing' | 'unknown';

export type TransactionVerificationStatus =
  | 'verified_email_match'
  | 'reconciled_manual'
  | 'awaiting_reconciliation'
  | 'outgoing_ignored'
  | 'rejected_duplicate'
  | 'unmatched';

export type VerificationMethod =
  | 'email_imap_reference_match'
  | 'email_imap_window_match'
  | 'manual_reconciliation'
  | 'simulated_test_fixture';

export interface TransactionRecord {
  transactionId: string;
  sellerId: string;
  orderId: string | null;
  amountPaise: number;
  currency: 'INR';
  direction: PaymentDirection;
  counterparty: string | null;
  receivedAt: string;
  sourceMessageIdHash: string;
  externalReference: string | null;
  verificationStatus: TransactionVerificationStatus;
  verificationMethod: VerificationMethod;
  verificationAssurance: VerificationAssurance;
  redactedSubject: string;
  redactedSnippet: string;
  parserConfidence: 'high' | 'medium' | 'low';
  missingFields: string[];
  createdAt: string;
}

export type ReconciliationStatus =
  | 'open'
  | 'matched_to_order'
  | 'marked_unrelated'
  | 'kept_pending'
  | 'manual_confirmation_requested';

export interface ReconciliationCase {
  caseId: string;
  sellerId: string;
  transactionId: string;
  amountPaise: number;
  externalReference: string | null;
  counterparty: string | null;
  receivedAt: string;
  candidateOrderIds: string[];
  reason: string;
  evidenceSummary: string;
  status: ReconciliationStatus;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolutionNotes?: string | null;
}

export interface AuditLogEntry {
  logId: string;
  actorId: string;
  actorEmail?: string;
  action: string;
  targetId: string;
  timestamp: string;
  outcome: 'success' | 'denied' | 'error';
  redactedMetadata: Record<string, string | number | boolean | null>;
}

export interface LiveOrderSignal {
  orderId: string;
  sellerId: string;
  status: OrderStatus;
  amountPaise: number;
  expiresAt: string;
  lastUpdatedAt: string;
}

export interface SellerLiveStats {
  pendingCount: number;
  verifiedCount: number;
  verifiedAmountPaise: number;
  reconciliationCount: number;
  lastActivityAt: string;
}

export type StepCheckStatus = 'pass' | 'warn' | 'fail' | 'skipped' | 'pending';

export interface GmailParsedCandidate {
  messageIdHash: string;
  receivedAt: string;
  fromAddress: string;
  redactedSubject: string;
  isFamPayRelated: boolean;
  direction: PaymentDirection | 'non_transaction';
  amountPaise: number | null;
  transactionReference: string | null;
  orderReference: string | null;
  counterparty: string | null;
  confidence: 'high' | 'medium' | 'low';
  missingFields: string[];
}

export interface GmailTestConnectionRequest {
  gmailAddress: string;
  appPassword?: string;
  lookbackDays?: number;
  useStoredSecret?: boolean;
}

export interface GmailTestConnectionResponse {
  overallStatus: 'ready' | 'authenticated_no_matches' | 'partial_warning' | 'failed';
  testedAt: string;
  inputValidation: {
    status: StepCheckStatus;
    detail: string;
  };
  imapConnection: {
    status: StepCheckStatus;
    host: string;
    port: number;
    tls: boolean;
    latencyMs?: number;
    detail: string;
  };
  authentication: {
    status: StepCheckStatus;
    detail: string;
  };
  emailDiscovery: {
    status: StepCheckStatus;
    lookbackDays: number;
    totalScannedMessages: number;
    relevantEmailCount: number;
    detail: string;
  };
  classification: {
    incomingCandidateCount: number;
    outgoingCandidateCount: number;
    nonTransactionCount: number;
    ambiguousCount: number;
  };
  parsingSummary: {
    status: StepCheckStatus;
    completeParsedCount: number;
    incompleteParsedCount: number;
    sampleCandidates: GmailParsedCandidate[];
    detail: string;
  };
  credentialProvisioning: {
    status: StepCheckStatus;
    storageBackend: 'memory_session_vault' | 'secret_manager' | 'not_provisioned';
    persistentAcrossRestarts: boolean;
    detail: string;
  };
  monitoringWorker: {
    status: StepCheckStatus;
    enabled: boolean;
    intervalSeconds: number;
    lastScanAt: string | null;
    detail: string;
  };
  nonSensitiveErrorCode: string | null;
  suggestedAction: string | null;
}

export interface GmailMonitoringState {
  sellerId: string;
  gmailAddress: string;
  hasProvisionedCredential: boolean;
  credentialStorageMode: 'memory_session_vault' | 'secret_manager' | 'none';
  monitoringEnabled: boolean;
  scanIntervalSeconds: number;
  lookbackDays: number;
  lastScanAt: string | null;
  lastSuccessfulConnectionAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastScanMatchedCount: number;
  updatedAt: string;
}
