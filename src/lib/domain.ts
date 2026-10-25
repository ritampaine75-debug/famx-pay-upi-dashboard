import type {
  GmailParsedCandidate,
  OrderStatus,
  PaymentOrder,
  TransactionRecord,
  VerificationMode,
} from '../types/domain';

/**
 * Converts an INR string or number into exact integer paise.
 * Rejects non-positive values, NaN, Infinity, or more than 2 decimal places.
 */
export function inrToPaise(input: string | number): number {
  const str = typeof input === 'number' ? String(input) : input.trim();
  if (!str || !/^\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error('Amount must be a positive INR value with at most 2 decimal places.');
  }
  const [rupeesPart, paisePart = ''] = str.split('.');
  const rupees = Number(rupeesPart);
  const paddedPaise = (paisePart + '00').slice(0, 2);
  const paise = Number(paddedPaise);
  const totalPaise = rupees * 100 + paise;
  if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) {
    throw new Error('Amount must be greater than ₹0.00.');
  }
  return totalPaise;
}

/**
 * Formats integer paise into a 2-decimal INR string suitable for UPI `am` parameters.
 */
export function paiseToInrDecimal(amountPaise: number): string {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new Error('amountPaise must be a positive integer.');
  }
  const rupees = Math.floor(amountPaise / 100);
  const paise = amountPaise % 100;
  return `${rupees}.${String(paise).padStart(2, '0')}`;
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats integer paise into standard Indian Rupee currency representation.
 */
export function formatInrFromPaise(amountPaise: number): string {
  if (!Number.isFinite(amountPaise)) return '₹0.00';
  return inrFormatter.format(amountPaise / 100);
}

/**
 * Validates standard UPI Virtual Payment Address (VPA) syntax.
 * Note: Format validation does not prove bank account ownership.
 */
export function validateUpiVpa(vpa: string): { valid: boolean; normalized: string; error?: string } {
  const trimmed = vpa.trim().toLowerCase();
  if (!trimmed) {
    return { valid: false, normalized: '', error: 'UPI ID (VPA) is required.' };
  }
  const vpaRegex = /^[a-z0-9.\-_]{2,256}@[a-z]{2,64}$/i;
  if (!vpaRegex.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Enter a valid UPI ID format (for example, merchant@fam or store@okaxis).',
    };
  }
  return { valid: true, normalized: trimmed };
}

export interface UpiUriParams {
  pa: string;
  pn: string;
  amountPaise: number;
  tn?: string;
  tr?: string;
}

/**
 * Constructs a standard NPCI-compliant UPI payment intent URI.
 * Values are URL-encoded.
 */
export function buildUpiUri(params: UpiUriParams): string {
  const vpaCheck = validateUpiVpa(params.pa);
  if (!vpaCheck.valid) {
    throw new Error(vpaCheck.error || 'Invalid payee UPI ID.');
  }
  const payeeName = params.pn.trim();
  if (!payeeName) {
    throw new Error('Payee display name (pn) is required.');
  }
  const amountStr = paiseToInrDecimal(params.amountPaise);

  const queryParts: string[] = [
    `pa=${encodeURIComponent(vpaCheck.normalized)}`,
    `pn=${encodeURIComponent(payeeName.slice(0, 60))}`,
    `am=${encodeURIComponent(amountStr)}`,
    `cu=INR`,
  ];

  if (params.tn && params.tn.trim()) {
    queryParts.push(`tn=${encodeURIComponent(params.tn.trim().slice(0, 80))}`);
  }
  if (params.tr && params.tr.trim()) {
    queryParts.push(`tr=${encodeURIComponent(params.tr.trim().slice(0, 35))}`);
  }

  return `upi://pay?${queryParts.join('&')}`;
}

/**
 * Documented Payment Order State Machine.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  created: ['pending', 'cancelled'],
  pending: [
    'evidence_detected',
    'awaiting_reconciliation',
    'verified',
    'expired',
    'cancelled',
    'verification_failed',
  ],
  evidence_detected: ['verified', 'awaiting_reconciliation', 'verification_failed'],
  awaiting_reconciliation: ['verified', 'expired', 'cancelled', 'verification_failed'],
  verified: [],
  expired: ['awaiting_reconciliation'],
  cancelled: [],
  verification_failed: ['awaiting_reconciliation', 'pending'],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Computes remaining seconds until `expiresAt` based on authoritative server time.
 */
export function computeRemainingSeconds(expiresAt: string | number, nowMs: number = Date.now()): number {
  const expiryMs = typeof expiresAt === 'number' ? expiresAt : Date.parse(expiresAt);
  if (Number.isNaN(expiryMs)) return 0;
  const diffSeconds = Math.floor((expiryMs - nowMs) / 1000);
  return Math.max(0, diffSeconds);
}

export function isOrderExpired(expiresAt: string | number, nowMs: number = Date.now()): boolean {
  return computeRemainingSeconds(expiresAt, nowMs) <= 0;
}

/**
 * Strips HTML tags and normalizes whitespace safely without executing scripts.
 */
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#8377;|&₹/gi, '₹')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface RawEmailInput {
  messageIdHash: string;
  from: string;
  subject: string;
  textBody?: string;
  htmlBody?: string;
  receivedAt: string;
}

/**
 * Inspects untrusted email metadata and body to classify FamPay/FamApp/UPI payment alerts
 * and extract amount, transaction reference, order reference, and direction.
 * Never fabricates missing fields.
 */
export function classifyAndParseEmail(input: RawEmailInput): GmailParsedCandidate {
  const plainText = [
    input.subject || '',
    input.textBody || '',
    input.htmlBody ? stripHtmlToText(input.htmlBody) : '',
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const lowerCombined = `${input.from.toLowerCase()} ${plainText.toLowerCase()}`;

  const isFamPayRelated =
    /\b(fampay|famapp|famx|famcard|triumph|idfc|upi)\b/i.test(lowerCombined) ||
    /@(fampay\.in|famapp\.in|triumph\.fampay\.in)/i.test(input.from);

  // Direction classification
  const incomingSignals =
    /\b(received|credited|money received|payment received|sent you|paid you|added to your|deposited|incoming)\b/i.test(
      plainText
    );
  const outgoingSignals =
    /\b(debited|paid to|sent to|payment successful to|you paid|spent|withdrawn|outgoing)\b/i.test(
      plainText
    );
  const nonTxnSignals =
    /\b(otp|verification code|login alert|password reset|promotional|newsletter|offer|kyc update)\b/i.test(
      plainText
    );

  let direction: GmailParsedCandidate['direction'] = 'unknown';
  if (nonTxnSignals && !incomingSignals && !outgoingSignals) {
    direction = 'non_transaction';
  } else if (incomingSignals && !outgoingSignals) {
    direction = 'incoming';
  } else if (outgoingSignals && !incomingSignals) {
    direction = 'outgoing';
  } else if (incomingSignals && outgoingSignals) {
    // Check subject precedence
    if (/\b(received|credited|paid you)\b/i.test(input.subject)) {
      direction = 'incoming';
    } else if (/\b(debited|paid to|sent to|you paid)\b/i.test(input.subject)) {
      direction = 'outgoing';
    } else {
      direction = 'unknown';
    }
  } else {
    direction = 'non_transaction';
  }

  // Extract INR amount
  let amountPaise: number | null = null;
  const amountRegex = /(?:₹|rs\.?|inr)\s*([0-9]{1,7}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)/i;
  const amountMatch = plainText.match(amountRegex);
  if (amountMatch && amountMatch[1]) {
    const cleanNumeric = amountMatch[1].replace(/,/g, '');
    try {
      amountPaise = inrToPaise(cleanNumeric);
    } catch {
      amountPaise = null;
    }
  }

  // Extract UPI / FamPay Transaction Reference (12-digit UTR or explicit Txn ID)
  let transactionReference: string | null = null;
  const refPatterns = [
    /(?:upi\s*(?:ref|txn|transaction)?\s*(?:no|id|ref)?|utr|txn\s*id|transaction\s*id|reference\s*(?:no|id))[\s:#\-]*([A-Z0-9\-]{8,28})/i,
    /\b([0-9]{12})\b/,
  ];
  for (const pattern of refPatterns) {
    const match = plainText.match(pattern);
    if (match && match[1]) {
      transactionReference = match[1].trim();
      break;
    }
  }

  // Extract Order Reference (e.g. ORD-XXXXXX or FX-XXXXXX)
  let orderReference: string | null = null;
  const orderRefMatch = plainText.match(/\b((?:ORD|FX|FAMX)-[A-Z0-9]{6,20})\b/i);
  if (orderRefMatch && orderRefMatch[1]) {
    orderReference = orderRefMatch[1].toUpperCase();
  }

  // Extract Counterparty if present
  let counterparty: string | null = null;
  const counterpartyMatch = plainText.match(
    /(?:from|by|sender|paid by)\s+([A-Za-z0-9 .@_'-]{3,40}?)(?:\s+(?:via|on|ref|utr|upi|towards|for|\.)|$)/i
  );
  if (counterpartyMatch && counterpartyMatch[1]) {
    counterparty = counterpartyMatch[1].trim();
  }

  const missingFields: string[] = [];
  if (amountPaise === null) missingFields.push('amount');
  if (!transactionReference) missingFields.push('transactionReference');
  if (!orderReference) missingFields.push('orderReference');

  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (
    isFamPayRelated &&
    direction === 'incoming' &&
    amountPaise !== null &&
    transactionReference !== null &&
    orderReference !== null
  ) {
    confidence = 'high';
  } else if (
    isFamPayRelated &&
    direction === 'incoming' &&
    amountPaise !== null &&
    transactionReference !== null
  ) {
    confidence = 'medium';
  }

  const redactedSubject = input.subject.slice(0, 100);

  return {
    messageIdHash: input.messageIdHash,
    receivedAt: input.receivedAt,
    fromAddress: input.from.slice(0, 100),
    redactedSubject,
    isFamPayRelated,
    direction,
    amountPaise,
    transactionReference,
    orderReference,
    counterparty,
    confidence,
    missingFields,
  };
}

export interface MatchEvaluationResult {
  outcome:
    | 'duplicate'
    | 'ignored_direction'
    | 'incomplete_evidence'
    | 'verified_match'
    | 'ambiguous_reconciliation'
    | 'unmatched_reconciliation';
  matchedOrder?: PaymentOrder;
  candidateOrders: PaymentOrder[];
  reason: string;
}

/**
 * Evaluates a parsed email candidate against seller's open orders under strict fraud-resistance rules.
 * - Rejects duplicate transaction references or message hashes.
 * - Ignores outgoing or non-transaction emails.
 * - Requires exact integer paise match.
 * - Never arbitrarily assigns same-amount transactions when multiple orders match.
 */
export function evaluateTransactionMatch(
  candidate: GmailParsedCandidate,
  sellerOrders: PaymentOrder[],
  existingTxnRefs: Set<string>,
  existingMessageHashes: Set<string>,
  verificationMode: VerificationMode = 'strict_reference_or_reconcile'
): MatchEvaluationResult {
  if (existingMessageHashes.has(candidate.messageIdHash)) {
    return {
      outcome: 'duplicate',
      candidateOrders: [],
      reason: 'Email message ID hash has already been processed.',
    };
  }

  if (candidate.transactionReference && existingTxnRefs.has(candidate.transactionReference)) {
    return {
      outcome: 'duplicate',
      candidateOrders: [],
      reason: `Transaction reference ${candidate.transactionReference} already exists in ledger.`,
    };
  }

  if (candidate.direction !== 'incoming') {
    return {
      outcome: 'ignored_direction',
      candidateOrders: [],
      reason: `Notification classified as ${candidate.direction}; excluded from incoming settlement.`,
    };
  }

  if (candidate.amountPaise === null || !candidate.transactionReference) {
    const sameAmountOrders =
      candidate.amountPaise !== null
        ? sellerOrders.filter(
            (o) =>
              o.amountPaise === candidate.amountPaise &&
              (o.status === 'pending' || o.status === 'evidence_detected' || o.status === 'expired')
          )
        : [];
    return {
      outcome: 'incomplete_evidence',
      candidateOrders: sameAmountOrders,
      reason: `Missing required evidence fields (${candidate.missingFields.join(', ') || 'unknown'}). Routed to manual reconciliation.`,
    };
  }

  // 1. Check for exact unambiguous Order Reference + exact amount match
  if (candidate.orderReference) {
    const exactRefOrders = sellerOrders.filter(
      (o) =>
        (o.orderId.toUpperCase() === candidate.orderReference ||
          o.paymentReference.toUpperCase() === candidate.orderReference) &&
        o.amountPaise === candidate.amountPaise
    );

    if (exactRefOrders.length === 1) {
      const targetOrder = exactRefOrders[0];
      if (targetOrder.status === 'pending' || targetOrder.status === 'evidence_detected') {
        return {
          outcome: 'verified_match',
          matchedOrder: targetOrder,
          candidateOrders: [targetOrder],
          reason: `Unambiguous match on order reference ${candidate.orderReference}, exact amount ${formatInrFromPaise(candidate.amountPaise)}, and unique transaction reference ${candidate.transactionReference}.`,
        };
      } else {
        return {
          outcome: 'ambiguous_reconciliation',
          candidateOrders: [targetOrder],
          reason: `Order reference ${candidate.orderReference} matched, but order is currently in '${targetOrder.status}' status. Requires manual reconciliation review.`,
        };
      }
    }
  }

  // 2. Find open orders with the exact amount in paise
  const activeSameAmountOrders = sellerOrders.filter(
    (o) =>
      o.amountPaise === candidate.amountPaise &&
      (o.status === 'pending' || o.status === 'evidence_detected')
  );

  if (activeSameAmountOrders.length > 1) {
    // Fraud/ambiguity resistance: NEVER arbitrarily pick oldest or newest order when multiple have the same amount
    return {
      outcome: 'ambiguous_reconciliation',
      candidateOrders: activeSameAmountOrders,
      reason: `Multiple active orders (${activeSameAmountOrders.map((o) => o.orderId).join(', ')}) request the exact amount ${formatInrFromPaise(candidate.amountPaise)} without an unambiguous order reference in the email.`,
    };
  }

  if (activeSameAmountOrders.length === 1) {
    const singleOrder = activeSameAmountOrders[0];
    if (verificationMode === 'single_open_amount_window') {
      return {
        outcome: 'verified_match',
        matchedOrder: singleOrder,
        candidateOrders: [singleOrder],
        reason: `Matched single active order ${singleOrder.orderId} for exact amount ${formatInrFromPaise(candidate.amountPaise)} under seller single-window policy.`,
      };
    }
    return {
      outcome: 'ambiguous_reconciliation',
      candidateOrders: [singleOrder],
      reason: `Exact amount ${formatInrFromPaise(candidate.amountPaise)} matches active order ${singleOrder.orderId}, but email did not include order reference ${singleOrder.paymentReference}. Routed to reconciliation under strict verification policy.`,
    };
  }

  // 3. Check recently expired orders with the same amount (late-arriving evidence)
  const expiredSameAmount = sellerOrders.filter(
    (o) => o.amountPaise === candidate.amountPaise && o.status === 'expired'
  );
  if (expiredSameAmount.length > 0) {
    return {
      outcome: 'ambiguous_reconciliation',
      candidateOrders: expiredSameAmount,
      reason: `Late payment notification for ${formatInrFromPaise(candidate.amountPaise)} arrived after order expiration. Routed to reconciliation.`,
    };
  }

  return {
    outcome: 'unmatched_reconciliation',
    candidateOrders: [],
    reason: `Incoming payment of ${formatInrFromPaise(candidate.amountPaise)} (Ref: ${candidate.transactionReference}) did not match any active or recently expired order.`,
  };
}

/**
 * Escapes CSV cell values and prevents spreadsheet formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`).
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Generates a formula-safe CSV string for seller transaction exports.
 */
export function generateTransactionsCsv(transactions: TransactionRecord[]): string {
  const headers = [
    'Transaction ID',
    'Order ID',
    'Amount (INR)',
    'Amount (Paise)',
    'Direction',
    'Counterparty',
    'External Reference',
    'Received Timestamp',
    'Verification Status',
    'Verification Method',
    'Assurance Level',
  ];

  const rows = transactions.map((t) => [
    escapeCsvCell(t.transactionId),
    escapeCsvCell(t.orderId || ''),
    escapeCsvCell(paiseToInrDecimal(t.amountPaise)),
    escapeCsvCell(t.amountPaise),
    escapeCsvCell(t.direction),
    escapeCsvCell(t.counterparty || ''),
    escapeCsvCell(t.externalReference || ''),
    escapeCsvCell(t.receivedAt),
    escapeCsvCell(t.verificationStatus),
    escapeCsvCell(t.verificationMethod),
    escapeCsvCell(t.verificationAssurance),
  ]);

  return [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.join(','))].join('\n');
}
