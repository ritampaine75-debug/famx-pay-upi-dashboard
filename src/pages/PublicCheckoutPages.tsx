import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ref, onValue } from 'firebase/database';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Smartphone,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { realtimeDb } from '../lib/firebase';
import { computeRemainingSeconds, formatInrFromPaise } from '../lib/domain';
import { UpiQrCard } from '../components/UpiQrCard';
import type { OrderStatus, VerificationAssurance } from '../types/domain';

interface PublicOrderView {
  orderId: string;
  sellerDisplayName: string;
  sellerUpiId: string;
  supportEmail: string | null;
  amountPaise: number;
  currency: 'INR';
  status: OrderStatus;
  customerDisplayName: string | null;
  description: string | null;
  paymentReference: string;
  upiUri: string | null;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  verifiedAt: string | null;
  verificationAssurance: VerificationAssurance;
  serverNow: string;
}

export function PublicCheckoutPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<PublicOrderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState<number>(0);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchPublicOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`/api/payment-orders/${encodeURIComponent(orderId)}/public-status`);
      if (res.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { publicOrder: PublicOrderView };
      const pub = data.publicOrder;
      setOrder(pub);
      const serverMs = Date.parse(pub.serverNow);
      if (!Number.isNaN(serverMs)) {
        setServerClockOffsetMs(serverMs - Date.now());
      }
      setRemainingSeconds(computeRemainingSeconds(pub.expiresAt, Date.now() + (serverMs - Date.now())));
      setNetworkError(null);
      setNotFound(false);
    } catch {
      setNetworkError('Verification temporarily unavailable');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void fetchPublicOrder();
    const pollTimer = setInterval(() => {
      void fetchPublicOrder();
    }, 6000);
    return () => clearInterval(pollTimer);
  }, [fetchPublicOrder]);

  // Subscribe to Firebase Realtime Database `liveOrders/{orderId}` for low-latency status signals
  useEffect(() => {
    if (!orderId) return;
    try {
      const orderRef = ref(realtimeDb, `liveOrders/${orderId}`);
      const unsubscribe = onValue(
        orderRef,
        (snapshot) => {
          const val = snapshot.val() as { status?: OrderStatus; lastUpdatedAt?: string } | null;
          if (val && val.status) {
            setOrder((prev) =>
              prev ? { ...prev, status: val.status!, updatedAt: val.lastUpdatedAt || prev.updatedAt } : prev
            );
          }
        },
        () => {
          // RTDB permission denied is gracefully handled via backend polling
        }
      );
      return () => unsubscribe();
    } catch {
      return undefined;
    }
  }, [orderId]);

  // Authoritative countdown tick based on server `expiresAt`
  useEffect(() => {
    if (!order) return;
    const interval = setInterval(() => {
      const authoritativeNow = Date.now() + serverClockOffsetMs;
      const secs = computeRemainingSeconds(order.expiresAt, authoritativeNow);
      setRemainingSeconds(secs);
      if (secs <= 0 && order.status === 'pending') {
        setOrder((prev) => (prev && prev.status === 'pending' ? { ...prev, status: 'expired' } : prev));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [order, serverClockOffsetMs]);

  const handleUpiLaunch = (appName: string) => {
    if (!order?.upiUri || order.status !== 'pending' || remainingSeconds <= 0) return;
    setHandoffNotice(
      `Opened ${appName} with UPI intent. Completing or closing the app does not confirm payment automatically—this page will update once the backend verifies the transaction.`
    );
    window.location.href = order.upiUri;
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const formatCountdown = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-8 max-w-md w-full text-center">
          <p className="text-sm font-medium text-[#171717]">Loading payment request...</p>
          <p className="mt-1 text-xs text-[#666666] font-mono">{orderId}</p>
        </div>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-8 h-8 text-[#991B1B] mx-auto" />
          <h1 className="mt-3 text-xl font-bold text-[#171717] font-display">
            Payment Link Not Found
          </h1>
          <p className="mt-2 text-xs text-[#666666] leading-relaxed">
            The requested payment order (<span className="font-mono">{orderId}</span>) does not exist or is no longer publicly available.
          </p>
          <div className="mt-6">
            <Link
              to="/support"
              className="px-4 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] transition-colors inline-block"
            >
              View Support & Troubleshooting
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isPayable = order.status === 'pending' && remainingSeconds > 0 && Boolean(order.upiUri);

  const renderStatusBanner = () => {
    if (networkError) {
      return (
        <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#991B1B] flex items-center justify-between">
          <span>Verification temporarily unavailable</span>
          <button
            type="button"
            onClick={fetchPublicOrder}
            className="font-semibold underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      );
    }

    switch (order.status) {
      case 'verified':
        return (
          <div className="p-5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl text-[#166534]">
            <div className="flex items-center gap-2.5 font-semibold text-base">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>Payment verified</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed">
              Your payment of <strong className="font-mono">{formatInrFromPaise(order.amountPaise)}</strong> for order{' '}
              <strong className="font-mono">{order.orderId}</strong> has been matched and recorded.
            </p>
            {order.verifiedAt && (
              <p className="mt-2 text-xs font-mono">
                Verified at: {new Date(order.verifiedAt).toLocaleString('en-IN')}
              </p>
            )}
          </div>
        );
      case 'evidence_detected':
        return (
          <div className="p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl text-[#92400E] text-xs flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
            <span className="font-medium">Payment notification detected — verifying</span>
          </div>
        );
      case 'awaiting_reconciliation':
        return (
          <div className="p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl text-[#92400E] text-xs space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Payment received notification needs review</span>
            </div>
            <p className="leading-relaxed">
              A payment notification matching this amount was detected and routed to the merchant’s reconciliation queue for manual confirmation. Do not pay a second time unless instructed by the merchant.
            </p>
          </div>
        );
      case 'expired':
        return (
          <div className="p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-xl text-[#171717] text-xs space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <Clock className="w-4 h-4 shrink-0 text-[#991B1B]" />
              <span>This payment link has expired</span>
            </div>
            <p className="text-[#666666] leading-relaxed">
              The 10-minute payment window has ended. Do not initiate a new payment on this expired link. If you already completed the UPI payment before expiration, the merchant’s server will reconcile late-arriving evidence automatically.
            </p>
          </div>
        );
      case 'cancelled':
        return (
          <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-[#991B1B] text-xs">
            This payment request was cancelled by the merchant and is no longer payable.
          </div>
        );
      default:
        return (
          <div className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-xl text-xs text-[#171717] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#666666]" />
              <span className="font-medium">Waiting for payment confirmation</span>
            </div>
            <span className="font-mono tabular-nums font-semibold text-[#171717]">
              Expires in {formatCountdown(remainingSeconds)}
            </span>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#171717] flex flex-col">
      {/* Top Minimal Checkout Header */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white border-b border-[#E5E2DC]">
        <Link to="/" className="text-base font-bold text-[#171717] font-display whitespace-nowrap">
          FamX Pay Checkout
        </Link>
        <div className="text-xs text-[#666666] font-mono tabular-nums">
          Order {order.orderId}
        </div>
        <Link
          to={`/pay/${order.orderId}/status`}
          className="text-xs font-medium text-[#171717] hover:underline whitespace-nowrap"
        >
          Status View
        </Link>
      </header>

      <main className="flex-1 max-w-xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Merchant & Amount Summary Card */}
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 border-b border-[#E5E2DC] pb-4">
            <div>
              <div className="text-xs text-[#666666]">Payable To Merchant</div>
              <h1 className="text-xl font-bold text-[#171717] font-display mt-0.5">
                {order.sellerDisplayName}
              </h1>
              <div className="text-xs font-mono text-[#666666] mt-0.5">{order.sellerUpiId}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#666666]">Requested Amount</div>
              <div className="text-3xl font-bold font-mono tabular-nums text-[#171717] mt-0.5">
                {formatInrFromPaise(order.amountPaise)}
              </div>
            </div>
          </div>

          {(order.description || order.customerDisplayName) && (
            <div className="text-xs text-[#666666] space-y-1">
              {order.customerDisplayName && (
                <div>
                  Customer: <strong className="text-[#171717]">{order.customerDisplayName}</strong>
                </div>
              )}
              {order.description && (
                <div>
                  Note: <strong className="text-[#171717]">{order.description}</strong>
                </div>
              )}
            </div>
          )}

          {/* Live Status Banner */}
          {renderStatusBanner()}

          {handoffNotice && (
            <div className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-xs text-[#666666] leading-relaxed">
              {handoffNotice}
            </div>
          )}

          {/* Payable Controls: UPI App Handoff Buttons + QR Code */}
          {isPayable && order.upiUri && (
            <div className="space-y-6 pt-2">
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-[#171717]">
                  Option 1: Open Installed UPI Application (Android / Mobile)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleUpiLaunch('Google Pay')}
                    className="py-3 px-4 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4 shrink-0" />
                    <span>Pay with Google Pay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpiLaunch('PhonePe')}
                    className="py-3 px-4 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4 shrink-0" />
                    <span>Pay with PhonePe</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpiLaunch('UPI App')}
                  className="w-full py-2.5 px-4 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span>Pay with any UPI app (Generic UPI Intent)</span>
                </button>
                <p className="text-[11px] text-[#666666]">
                  App handoff depends on your device, browser, and installed UPI apps. If no UPI app opens, scan the QR code below.
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-[#171717]">
                  Option 2: Scan UPI QR Code
                </div>
                <UpiQrCard
                  upiUri={order.upiUri}
                  merchantName={order.sellerDisplayName}
                  merchantUpiId={order.sellerUpiId}
                  amountPaise={order.amountPaise}
                  orderId={order.orderId}
                />
              </div>

              {/* Copyable Reference & VPA */}
              <div className="bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#666666]">Payee VPA</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(order.sellerUpiId, 'vpa')}
                    className="font-mono text-[#171717] inline-flex items-center gap-1.5 hover:underline cursor-pointer"
                  >
                    <span>{order.sellerUpiId}</span>
                    {copiedField === 'vpa' ? (
                      <Check className="w-3.5 h-3.5 text-[#166534]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-[#666666]" />
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#666666]">Order Reference (include in UPI remarks)</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(order.paymentReference, 'ref')}
                    className="font-mono font-semibold text-[#171717] inline-flex items-center gap-1.5 hover:underline cursor-pointer"
                  >
                    <span>{order.paymentReference}</span>
                    {copiedField === 'ref' ? (
                      <Check className="w-3.5 h-3.5 text-[#166534]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-[#666666]" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer Instructions & Support */}
          <div className="pt-4 border-t border-[#E5E2DC] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-[#666666]">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#171717] shrink-0" />
              <span>Keep your UPI remarks set to {order.paymentReference} for instant matching.</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {order.supportEmail && (
                <a
                  href={`mailto:${order.supportEmail}?subject=Order%20${order.orderId}`}
                  className="text-[#171717] underline"
                >
                  Contact Merchant
                </a>
              )}
              <Link to="/support" className="text-[#171717] underline">
                Help
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export function PublicOrderStatusPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<PublicOrderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!orderId) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/payment-orders/${encodeURIComponent(orderId)}/public-status`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as { publicOrder: PublicOrderView };
        setOrder(data.publicOrder);
        setNotFound(false);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    void fetchStatus();
    const timer = setInterval(() => void fetchStatus(), 5000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  useEffect(() => {
    if (!orderId) return;
    try {
      const orderRef = ref(realtimeDb, `liveOrders/${orderId}`);
      const unsubscribe = onValue(orderRef, (snap) => {
        const val = snap.val() as { status?: OrderStatus; lastUpdatedAt?: string } | null;
        if (val?.status) {
          setOrder((prev) =>
            prev ? { ...prev, status: val.status!, updatedAt: val.lastUpdatedAt || prev.updatedAt } : prev
          );
        }
      });
      return () => unsubscribe();
    } catch {
      return undefined;
    }
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 max-w-md w-full text-center text-sm text-[#171717]">
          Checking live order status...
        </div>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-lg font-bold text-[#171717] font-display">Order Status Not Found</h1>
          <p className="mt-2 text-xs text-[#666666]">
            No public order matches reference <span className="font-mono">{orderId}</span>.
          </p>
          <Link to="/" className="mt-5 inline-block text-xs font-semibold text-[#171717] underline">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F6F2] flex flex-col">
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white border-b border-[#E5E2DC]">
        <Link to="/" className="text-base font-bold text-[#171717] font-display">
          FamX Pay Status
        </Link>
        <Link
          to={`/pay/${order.orderId}`}
          className="text-xs font-medium text-[#171717] hover:underline"
        >
          Back to Checkout
        </Link>
      </header>

      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-10">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#E5E2DC] pb-4">
            <div>
              <div className="text-xs text-[#666666]">Order Reference</div>
              <div className="text-lg font-bold font-mono text-[#171717]">{order.orderId}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#666666]">Amount</div>
              <div className="text-xl font-bold font-mono tabular-nums text-[#171717]">
                {formatInrFromPaise(order.amountPaise)}
              </div>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-[#666666]">Merchant Display Name</span>
              <span className="font-medium text-[#171717]">{order.sellerDisplayName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666666]">Public Verification Status</span>
              <span className="font-mono font-semibold text-[#171717]">{order.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666666]">Verification Assurance</span>
              <span className="font-mono text-[#171717]">{order.verificationAssurance}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666666]">Last Updated</span>
              <span className="font-mono tabular-nums text-[#171717]">
                {new Date(order.updatedAt).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E5E2DC] flex items-center justify-between">
            <button
              type="button"
              onClick={fetchStatus}
              disabled={refreshing}
              className="px-4 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] disabled:opacity-50 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh Status</span>
            </button>

            <Link to="/support" className="text-xs text-[#666666] hover:text-[#171717] underline">
              Support Instructions
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
