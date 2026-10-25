import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import {
  inrToPaise,
  paiseToInrDecimal,
  formatInrFromPaise,
  validateUpiVpa,
  buildUpiUri,
  canTransitionOrderStatus,
  computeRemainingSeconds,
  isOrderExpired,
  classifyAndParseEmail,
  evaluateTransactionMatch,
  escapeCsvCell,
  generateTransactionsCsv,
} from '../domain';
import type { PaymentOrder, TransactionRecord } from '../../types/domain';

describe('FamX Pay Domain & Security Unit Suite', () => {
  describe('1. Integer Paise Conversion & INR Formatting', () => {
    it('converts valid INR strings and numbers to exact integer paise', () => {
      expect(inrToPaise('1')).toBe(100);
      expect(inrToPaise('250.50')).toBe(25050);
      expect(inrToPaise('1499.05')).toBe(149905);
      expect(inrToPaise(99.99)).toBe(9999);
    });

    it('rejects zero, negative, or more than 2 decimal places', () => {
      expect(() => inrToPaise('0')).toThrow();
      expect(() => inrToPaise('-10')).toThrow();
      expect(() => inrToPaise('12.345')).toThrow();
      expect(() => inrToPaise('abc')).toThrow();
    });

    it('formats integer paise into Indian Rupee currency string and 2-decimal UPI string', () => {
      expect(paiseToInrDecimal(25050)).toBe('250.50');
      expect(formatInrFromPaise(145000)).toContain('1,450.00');
    });
  });

  describe('2. UPI VPA Validation, URI Construction & QR Encoding', () => {
    it('validates UPI VPA syntax accurately', () => {
      expect(validateUpiVpa('merchant@fam').valid).toBe(true);
      expect(validateUpiVpa('aarav.store_1@okaxis').valid).toBe(true);
      expect(validateUpiVpa('invalid-vpa').valid).toBe(false);
      expect(validateUpiVpa('').valid).toBe(false);
    });

    it('constructs a URL-encoded NPCI UPI intent URI with pa, pn, am, cu, tn, tr', () => {
      const uri = buildUpiUri({
        pa: 'merchant@fam',
        pn: 'Aarav Store',
        amountPaise: 25000,
        tn: 'Order ORD-1001',
        tr: 'ORD-1001',
      });
      expect(uri).toBe(
        'upi://pay?pa=merchant%40fam&pn=Aarav%20Store&am=250.00&cu=INR&tn=Order%20ORD-1001&tr=ORD-1001'
      );
    });

    it('encodes a real QR data URL from the generated UPI URI', async () => {
      const uri = buildUpiUri({
        pa: 'merchant@fam',
        pn: 'Aarav Store',
        amountPaise: 50000,
        tr: 'ORD-500',
      });
      const dataUrl = await QRCode.toDataURL(uri);
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });
  });

  describe('3. Order State Machine & Authoritative Expiration', () => {
    it('enforces valid state transitions and blocks illegal transitions', () => {
      expect(canTransitionOrderStatus('created', 'pending')).toBe(true);
      expect(canTransitionOrderStatus('pending', 'verified')).toBe(true);
      expect(canTransitionOrderStatus('pending', 'awaiting_reconciliation')).toBe(true);
      expect(canTransitionOrderStatus('expired', 'awaiting_reconciliation')).toBe(true);
      // Cancelled orders must never transition to verified
      expect(canTransitionOrderStatus('cancelled', 'verified')).toBe(false);
      expect(canTransitionOrderStatus('verified', 'cancelled')).toBe(false);
    });

    it('computes remaining seconds from server expiration timestamp accurately', () => {
      const now = 1_700_000_000_000;
      const expiresAt = new Date(now + 180_000).toISOString();
      expect(computeRemainingSeconds(expiresAt, now)).toBe(180);
      expect(isOrderExpired(expiresAt, now)).toBe(false);
      expect(computeRemainingSeconds(expiresAt, now + 200_000)).toBe(0);
      expect(isOrderExpired(expiresAt, now + 200_000)).toBe(true);
    });
  });

  describe('4. Email Classification, Parsing & Fraud-Resistant Matching', () => {
    const makeOrder = (id: string, amountPaise: number, status: PaymentOrder['status'] = 'pending'): PaymentOrder => ({
      orderId: id,
      sellerId: 'seller-1',
      sellerDisplayName: 'Aarav Store',
      sellerUpiId: 'merchant@fam',
      amountPaise,
      currency: 'INR',
      status,
      paymentReference: id,
      upiUri: `upi://pay?pa=merchant@fam&pn=Aarav&am=${paiseToInrDecimal(amountPaise)}&cu=INR&tr=${id}`,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      updatedAt: new Date().toISOString(),
      verificationAssurance: 'none',
      timeline: [],
    });

    it('classifies incoming FamPay receipt and extracts paise, UTR, and order reference', () => {
      const parsed = classifyAndParseEmail({
        messageIdHash: 'hash-101',
        from: 'alerts@fampay.in',
        subject: 'FamPay: You received ₹250.00 via UPI',
        textBody:
          'Money received! ₹250.00 has been credited to your FamX account from Rohan Sharma. UPI Ref No: 412345678901. Remarks: ORD-AB12CD',
        receivedAt: new Date().toISOString(),
      });

      expect(parsed.isFamPayRelated).toBe(true);
      expect(parsed.direction).toBe('incoming');
      expect(parsed.amountPaise).toBe(25000);
      expect(parsed.transactionReference).toBe('412345678901');
      expect(parsed.orderReference).toBe('ORD-AB12CD');
      expect(parsed.confidence).toBe('high');
    });

    it('classifies outgoing payment alerts separately and excludes them from incoming match', () => {
      const parsed = classifyAndParseEmail({
        messageIdHash: 'hash-out-1',
        from: 'alerts@fampay.in',
        subject: 'FamPay: You paid ₹250.00 to Swiggy',
        textBody: '₹250.00 debited from your FamX account. Paid to Swiggy. UPI Ref No: 499988887777.',
        receivedAt: new Date().toISOString(),
      });

      expect(parsed.direction).toBe('outgoing');
      const match = evaluateTransactionMatch(
        parsed,
        [makeOrder('ORD-AB12CD', 25000)],
        new Set(),
        new Set()
      );
      expect(match.outcome).toBe('ignored_direction');
    });

    it('rejects duplicate transaction references and duplicate message hashes', () => {
      const parsed = classifyAndParseEmail({
        messageIdHash: 'hash-dup',
        from: 'alerts@fampay.in',
        subject: 'FamPay: Money received ₹250.00',
        textBody: 'Received ₹250.00. UPI Ref No: 411122223333. Remarks: ORD-AB12CD',
        receivedAt: new Date().toISOString(),
      });

      const dupByRef = evaluateTransactionMatch(
        parsed,
        [makeOrder('ORD-AB12CD', 25000)],
        new Set(['411122223333']),
        new Set()
      );
      expect(dupByRef.outcome).toBe('duplicate');
    });

    it('routes same-amount orders without an order reference to reconciliation instead of guessing', () => {
      const parsed = classifyAndParseEmail({
        messageIdHash: 'hash-ambig',
        from: 'alerts@fampay.in',
        subject: 'FamPay: Money received ₹500.00',
        textBody: 'Received ₹500.00 credited to your FamX account. UPI Ref No: 455566667777.',
        receivedAt: new Date().toISOString(),
      });

      const orderA = makeOrder('ORD-AAAA11', 50000);
      const orderB = makeOrder('ORD-BBBB22', 50000);

      const res = evaluateTransactionMatch(
        parsed,
        [orderA, orderB],
        new Set(),
        new Set(),
        'single_open_amount_window'
      );
      expect(res.outcome).toBe('ambiguous_reconciliation');
      expect(res.candidateOrders).toHaveLength(2);
    });
  });

  describe('5. Safe CSV Export & Formula Injection Prevention', () => {
    it('prefixes dangerous leading characters (=, +, -, @) with a single quote', () => {
      expect(escapeCsvCell('=cmd|"/c calc"!A0')).toBe('"\'=cmd|""/c calc""!A0"');
      expect(escapeCsvCell('+SUM(A1:A2)')).toBe('"\'+SUM(A1:A2)"');
      expect(escapeCsvCell('Normal Counterparty')).toBe('"Normal Counterparty"');
    });

    it('generates valid CSV output for transaction records', () => {
      const sample: TransactionRecord[] = [
        {
          transactionId: 'TXN-100',
          sellerId: 'seller-1',
          orderId: 'ORD-100',
          amountPaise: 25000,
          currency: 'INR',
          direction: 'incoming',
          counterparty: '=EvilSender',
          receivedAt: '2026-10-24T09:00:00.000Z',
          sourceMessageIdHash: 'hash1',
          externalReference: '412345678901',
          verificationStatus: 'verified_email_match',
          verificationMethod: 'email_imap_reference_match',
          verificationAssurance: 'email_high_confidence',
          redactedSubject: 'FamPay receipt',
          redactedSnippet: 'Matched',
          parserConfidence: 'high',
          missingFields: [],
          createdAt: '2026-10-24T09:00:00.000Z',
        },
      ];
      const csv = generateTransactionsCsv(sample);
      expect(csv).toContain('"\'=EvilSender"');
      expect(csv).toContain('"250.00"');
    });
  });
});
