import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  PlusCircle,
  Search,
  Copy,
  Check,
  Share2,
  ExternalLink,
  XCircle,
  ArrowLeft,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import {
  buildUpiUri,
  formatInrFromPaise,
  inrToPaise,
} from '../lib/domain';
import { UpiQrCard } from '../components/UpiQrCard';
import { OrderStatusLabel } from '../components/AppLayouts';
import type {
  PaymentOrder,
  ReconciliationCase,
  TransactionRecord,
} from '../types/domain';

export function PaymentLinksListPage() {
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ orders: PaymentOrder[] }>('/api/payment-orders');
      setOrders(data.orders);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load payment links.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const handleCopyUrl = async (orderId: string) => {
    const url = `${window.location.origin}/pay/${orderId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(orderId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignore
    }
  };

  const handleShareUrl = async (order: PaymentOrder) => {
    const url = `${window.location.origin}/pay/${order.orderId}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Payment Request ${formatInrFromPaise(order.amountPaise)} — ${order.sellerDisplayName}`,
          text: `Pay ${formatInrFromPaise(order.amountPaise)} via UPI (${order.orderId})`,
          url,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    await handleCopyUrl(order.orderId);
  };

  const handleCancelOrder = async (orderId: string) => {
    setCancellingId(orderId);
    try {
      await apiRequest(`/api/payment-orders/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST',
      });
      await loadOrders();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not cancel order.');
    } finally {
      setCancellingId(null);
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (statusFilter === 'pending' && order.status !== 'pending' && order.status !== 'evidence_detected') {
      return false;
    }
    if (statusFilter === 'verified' && order.status !== 'verified') return false;
    if (statusFilter === 'expired' && order.status !== 'expired') return false;
    if (statusFilter === 'awaiting_reconciliation' && order.status !== 'awaiting_reconciliation') {
      return false;
    }
    if (statusFilter === 'cancelled' && order.status !== 'cancelled' && order.status !== 'verification_failed') {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchId = order.orderId.toLowerCase().includes(q);
      const matchRef = order.customerReference?.toLowerCase().includes(q) || false;
      const matchName = order.customerDisplayName?.toLowerCase().includes(q) || false;
      const matchDesc = order.description?.toLowerCase().includes(q) || false;
      return matchId || matchRef || matchName || matchDesc;
    }
    return true;
  });

  const filterTabs = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'verified', label: 'Paid / Verified' },
    { id: 'awaiting_reconciliation', label: 'Needs Review' },
    { id: 'expired', label: 'Expired' },
    { id: 'cancelled', label: 'Cancelled / Failed' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#171717] font-display">Payment Links</h1>
          <p className="mt-0.5 text-xs text-[#666666]">
            Manage seller-scoped UPI payment orders, share public checkout URLs, and inspect verification state.
          </p>
        </div>
        <Link
          to="/app/payment-links/new"
          className="self-start sm:self-auto px-4 py-2.5 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Create Payment Link</span>
        </Link>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white border border-[#E5E2DC] rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#666666] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Order ID, customer reference, or description..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717] focus:outline-none focus:border-[#171717]"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg overflow-x-auto">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-white text-[#171717] shadow-xs'
                  : 'text-[#666666] hover:text-[#171717]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#991B1B]">
          {errorMsg}
        </div>
      )}

      {/* Orders Table / Mobile Cards */}
      <div className="bg-white border border-[#E5E2DC] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-[#666666]">Loading payment links...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-[#171717]">No matching payment links</p>
            <p className="text-xs text-[#666666]">
              Create a new INR payment order or clear your active search filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E5E2DC] bg-[#F7F6F2] text-[#666666]">
                  <th className="py-3 px-4 font-medium">Order ID</th>
                  <th className="py-3 px-4 font-medium text-right">Amount</th>
                  <th className="py-3 px-4 font-medium">Customer / Ref</th>
                  <th className="py-3 px-4 font-medium">Created</th>
                  <th className="py-3 px-4 font-medium">Expires</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E2DC]">
                {filteredOrders.map((order) => (
                  <tr key={order.orderId} className="hover:bg-[#F7F6F2]">
                    <td className="py-3.5 px-4 font-mono font-semibold text-[#171717] whitespace-nowrap">
                      <Link to={`/app/payment-links/${order.orderId}`} className="hover:underline">
                        {order.orderId}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums font-bold text-right text-[#171717] whitespace-nowrap">
                      {formatInrFromPaise(order.amountPaise)}
                    </td>
                    <td className="py-3.5 px-4 text-[#666666]">
                      {order.customerDisplayName || order.customerReference || order.description || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-[#666666] whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-[#666666] whitespace-nowrap">
                      {new Date(order.expiresAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <OrderStatusLabel status={order.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2.5">
                      <Link
                        to={`/app/payment-links/${order.orderId}`}
                        className="font-medium text-[#171717] hover:underline"
                      >
                        Details & QR
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(order.orderId)}
                        className="text-[#666666] hover:text-[#171717] inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedId === order.orderId ? (
                          <Check className="w-3.5 h-3.5 text-[#166534]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>Copy</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShareUrl(order)}
                        className="text-[#666666] hover:text-[#171717] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Share</span>
                      </button>
                      {order.status === 'pending' && (
                        <button
                          type="button"
                          disabled={cancellingId === order.orderId}
                          onClick={() => handleCancelOrder(order.orderId)}
                          className="text-[#991B1B] hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function CreatePaymentLinkPage() {
  const { settings, refreshSellerData } = useAuth();
  const navigate = useNavigate();

  const [amountInput, setAmountInput] = useState('250.00');
  const [customerReference, setCustomerReference] = useState('');
  const [customerDisplayName, setCustomerDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [expiryMinutes, setExpiryMinutes] = useState<number>(10);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isUpiReady = Boolean(settings?.sellerUpiId && settings?.destinationConfirmed);

  let previewPaise: number | null = null;
  let previewUpiUri: string | null = null;
  let amountError: string | null = null;

  try {
    previewPaise = inrToPaise(amountInput);
    if (settings && previewPaise < settings.minimumAmountPaise) {
      amountError = `Amount must be at least ${formatInrFromPaise(settings.minimumAmountPaise)}.`;
    } else if (settings && previewPaise > settings.maximumAmountPaise) {
      amountError = `Amount cannot exceed ${formatInrFromPaise(settings.maximumAmountPaise)}.`;
    } else if (settings?.sellerUpiId) {
      previewUpiUri = buildUpiUri({
        pa: settings.sellerUpiId,
        pn: settings.sellerDisplayName || 'Merchant',
        amountPaise: previewPaise,
        tn: description ? `ORD-PREVIEW ${description}` : 'Order ORD-PREVIEW',
        tr: 'ORD-PREVIEW',
      });
    }
  } catch (err) {
    amountError = err instanceof Error ? err.message : 'Invalid INR amount.';
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);

    if (!isUpiReady) {
      setErrorMsg('Please configure your UPI VPA in Seller Settings or the Setup Wizard first.');
      return;
    }

    let validPaise: number;
    try {
      validPaise = inrToPaise(amountInput);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid amount.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ order: PaymentOrder }>('/api/payment-orders', {
        method: 'POST',
        body: JSON.stringify({
          amountPaise: validPaise,
          customerReference: customerReference.trim() || undefined,
          customerDisplayName: customerDisplayName.trim() || undefined,
          description: description.trim() || undefined,
          expiryMinutes,
        }),
      });
      await refreshSellerData();
      navigate(`/app/payment-links/${res.order.orderId}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create payment order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#171717] font-display">
            Create UPI Payment Link
          </h1>
          <p className="mt-0.5 text-xs text-[#666666]">
            Server validates the integer paise amount, generates a cryptographically unpredictable Order ID, and publishes live checkout state.
          </p>
        </div>
        <Link
          to="/app/payment-links"
          className="text-xs font-medium text-[#666666] hover:text-[#171717] inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Links</span>
        </Link>
      </div>

      {!isUpiReady && (
        <div className="p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl text-xs text-[#92400E] flex items-center justify-between">
          <span>Your Seller UPI VPA is not configured yet. Configure it before creating payment links.</span>
          <Link to="/app/setup" className="font-semibold underline">
            Open Setup Wizard
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4"
          noValidate
        >
          {errorMsg && (
            <div className="p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#991B1B]">
              {errorMsg}
            </div>
          )}

          <div>
            <label htmlFor="order-amount" className="block text-xs font-medium text-[#171717]">
              Requested Amount (INR)
            </label>
            <div className="mt-1.5 relative flex items-center">
              <span className="absolute left-3.5 text-sm font-mono font-semibold text-[#666666]">
                ₹
              </span>
              <input
                id="order-amount"
                type="text"
                inputMode="decimal"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="250.00"
                className="w-full pl-8 pr-4 py-2.5 text-base font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717] focus:outline-none focus:border-[#171717]"
              />
            </div>
            {amountError ? (
              <p className="mt-1 text-xs text-[#991B1B]">{amountError}</p>
            ) : (
              previewPaise && (
                <p className="mt-1 text-[11px] font-mono text-[#666666]">
                  Canonical server storage: {previewPaise} paise ({formatInrFromPaise(previewPaise)})
                </p>
              )
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cust-name" className="block text-xs font-medium text-[#171717]">
                Customer Display Name (Optional)
              </label>
              <input
                id="cust-name"
                type="text"
                maxLength={60}
                value={customerDisplayName}
                onChange={(e) => setCustomerDisplayName(e.target.value)}
                placeholder="Rohan Sharma"
                className="mt-1.5 w-full px-3.5 py-2 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
              />
            </div>

            <div>
              <label htmlFor="cust-ref" className="block text-xs font-medium text-[#171717]">
                Customer / Invoice Reference (Optional)
              </label>
              <input
                id="cust-ref"
                type="text"
                maxLength={40}
                value={customerReference}
                onChange={(e) => setCustomerReference(e.target.value)}
                placeholder="INV-2026-104"
                className="mt-1.5 w-full px-3.5 py-2 text-sm font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="order-desc" className="block text-xs font-medium text-[#171717]">
              Payment Description / Note (Optional)
            </label>
            <input
              id="order-desc"
              type="text"
              maxLength={80}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Wireless keyboard order"
              className="mt-1.5 w-full px-3.5 py-2 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
            />
          </div>

          <div>
            <label htmlFor="order-expiry" className="block text-xs font-medium text-[#171717]">
              Checkout Expiration Window
            </label>
            <select
              id="order-expiry"
              value={expiryMinutes}
              onChange={(e) => setExpiryMinutes(Number(e.target.value))}
              className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
            >
              <option value={10}>10 Minutes (Standard Default)</option>
              <option value={5}>5 Minutes</option>
              <option value={15}>15 Minutes</option>
              <option value={30}>30 Minutes</option>
              <option value={60}>60 Minutes</option>
            </select>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || !isUpiReady || Boolean(amountError)}
              className="w-full py-3 px-4 text-sm font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? 'Generating Order & QR...' : 'Create Link'}
            </button>
          </div>
        </form>

        {/* Live Preview Card */}
        <div className="lg:col-span-5 bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4">
          <div className="text-xs font-semibold text-[#171717]">
            Customer Checkout Specification Preview
          </div>
          <div className="p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#666666]">Payee Name (`pn`)</span>
              <span className="font-medium text-[#171717]">
                {settings?.sellerDisplayName || 'Not set'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666666]">Payee VPA (`pa`)</span>
              <span className="font-mono text-[#171717]">
                {settings?.sellerUpiId || 'Not set'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666666]">Amount (`am`)</span>
              <span className="font-mono font-bold text-[#171717]">
                {previewPaise ? formatInrFromPaise(previewPaise) : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666666]">Expiration Preset</span>
              <span className="font-mono text-[#171717]">{expiryMinutes} minutes</span>
            </div>
            {previewUpiUri && (
              <div className="pt-2 border-t border-[#E5E2DC]">
                <div className="text-[11px] text-[#666666] mb-1">Encoded UPI Intent URI:</div>
                <div className="font-mono text-[11px] text-[#171717] break-all bg-white p-2 rounded border border-[#E5E2DC]">
                  {previewUpiUri}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PaymentLinkDetailsPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [matchedTxn, setMatchedTxn] = useState<TransactionRecord | null>(null);
  const [relatedCases, setRelatedCases] = useState<ReconciliationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const loadOrderDetails = useCallback(async () => {
    if (!orderId) return;
    try {
      const data = await apiRequest<{
        order: PaymentOrder;
        matchedTransaction: TransactionRecord | null;
        relatedReconciliationCases: ReconciliationCase[];
      }>(`/api/payment-orders/${encodeURIComponent(orderId)}`);
      setOrder(data.order);
      setMatchedTxn(data.matchedTransaction);
      setRelatedCases(data.relatedReconciliationCases);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load order details.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadOrderDetails();
  }, [loadOrderDetails]);

  const publicUrl = order ? `${window.location.origin}/pay/${order.orderId}` : '';

  const handleCopy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleShare = async () => {
    if (!order) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Payment Request ${formatInrFromPaise(order.amountPaise)}`,
          text: `Pay ${formatInrFromPaise(order.amountPaise)} to ${order.sellerDisplayName} (${order.orderId})`,
          url: publicUrl,
        });
        return;
      } catch {
        // Fallback
      }
    }
    await handleCopy();
  };

  const handleCancel = async () => {
    if (!order) return;
    setCancelling(true);
    try {
      await apiRequest(`/api/payment-orders/${encodeURIComponent(order.orderId)}/cancel`, {
        method: 'POST',
      });
      await loadOrderDetails();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to cancel order.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="p-10 bg-white border border-[#E5E2DC] rounded-xl text-center text-xs text-[#666666]">
        Loading order {orderId}...
      </div>
    );
  }

  if (errorMsg || !order) {
    return (
      <div className="p-8 bg-white border border-[#E5E2DC] rounded-xl space-y-4">
        <div className="text-sm font-semibold text-[#991B1B]">
          {errorMsg || 'Order not found'}
        </div>
        <Link to="/app/payment-links" className="text-xs font-medium text-[#171717] underline">
          Return to Payment Links
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              to="/app/payment-links"
              className="text-xs text-[#666666] hover:text-[#171717] inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Payment Links</span>
            </Link>
            <span aria-hidden="true" className="text-xs text-[#666666]">/</span>
            <span className="text-xs font-mono text-[#171717]">{order.orderId}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold font-mono text-[#171717]">
            {formatInrFromPaise(order.amountPaise)} · {order.orderId}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <OrderStatusLabel status={order.status} />
          {order.status === 'pending' && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="px-3.5 py-2 text-xs font-medium bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA] rounded-lg hover:bg-[#FEE2E2] cursor-pointer"
            >
              {cancelling ? 'Cancelling...' : 'Cancel Order'}
            </button>
          )}
        </div>
      </div>

      {/* Shareable URL Banner */}
      <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[#171717]">Shareable Customer Checkout Link</div>
          <div className="mt-1 text-xs font-mono text-[#666666] truncate">{publicUrl}</div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="px-3.5 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] inline-flex items-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied URL' : 'Copy Link'}</span>
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="px-3.5 py-2 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>
          <Link
            to={`/pay/${order.orderId}`}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] inline-flex items-center gap-1.5"
          >
            <span>Open Checkout</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Order Metadata, Verification Summary & Timeline */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[#171717] font-display">
              Order & Transaction Matching Summary
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg">
                <div className="text-[#666666]">Created Timestamp</div>
                <div className="mt-1 font-mono text-[#171717]">
                  {new Date(order.createdAt).toLocaleString('en-IN')}
                </div>
              </div>
              <div className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg">
                <div className="text-[#666666]">Authoritative Expiration</div>
                <div className="mt-1 font-mono text-[#171717]">
                  {new Date(order.expiresAt).toLocaleString('en-IN')}
                </div>
              </div>
              <div className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg">
                <div className="text-[#666666]">Customer / Invoice Ref</div>
                <div className="mt-1 font-medium text-[#171717]">
                  {order.customerDisplayName || order.customerReference || 'None specified'}
                </div>
              </div>
              <div className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg">
                <div className="text-[#666666]">Verification Assurance</div>
                <div className="mt-1 font-mono text-[#171717]">{order.verificationAssurance}</div>
              </div>
            </div>

            {matchedTxn ? (
              <div className="p-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-xs text-[#166534] space-y-1.5">
                <div className="flex items-center justify-between font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Matched Transaction: {matchedTxn.transactionId}
                  </span>
                  <Link
                    to={`/app/transactions/${matchedTxn.transactionId}`}
                    className="underline font-mono"
                  >
                    Inspect Evidence
                  </Link>
                </div>
                <p>
                  External UPI/UTR Ref: <strong className="font-mono">{matchedTxn.externalReference || 'N/A'}</strong> · Method: <span className="font-mono">{matchedTxn.verificationMethod}</span>
                </p>
              </div>
            ) : relatedCases.length > 0 ? (
              <div className="p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-xs text-[#92400E] space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Candidate Payment Evidence Requires Reconciliation</span>
                </div>
                <p>
                  {relatedCases[0].reason}
                </p>
                <Link
                  to="/app/reconciliation"
                  className="inline-block font-semibold text-[#171717] underline"
                >
                  Open Reconciliation Queue ({relatedCases.length})
                </Link>
              </div>
            ) : (
              <div className="p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-xs text-[#666666] flex items-center justify-between">
                <span>No verified transaction matched to this order yet.</span>
                <Link to="/app/gmail" className="text-[#171717] underline font-medium">
                  Poll Gmail or Simulate Evidence
                </Link>
              </div>
            )}
          </div>

          {/* Event Timeline */}
          <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[#171717] font-display">
              Audit & State Transition Timeline
            </h2>
            <div className="space-y-3">
              {order.timeline.map((ev, idx) => (
                <div
                  key={`${ev.timestamp}-${idx}`}
                  className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-semibold text-[#171717]">
                      Status: <span className="font-mono">{ev.status}</span> · Actor:{' '}
                      <span className="font-mono">{ev.actor}</span>
                    </div>
                    <div className="text-[#666666] mt-0.5">{ev.note}</div>
                  </div>
                  <div className="font-mono tabular-nums text-[11px] text-[#666666] shrink-0">
                    {new Date(ev.timestamp).toLocaleTimeString('en-IN')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Downloadable QR Card */}
        <div className="lg:col-span-5">
          <UpiQrCard
            upiUri={order.upiUri}
            merchantName={order.sellerDisplayName}
            merchantUpiId={order.sellerUpiId}
            amountPaise={order.amountPaise}
            orderId={order.orderId}
          />
        </div>
      </div>
    </div>
  );
}
