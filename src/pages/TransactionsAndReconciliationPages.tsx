import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Download,
  Search,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Scale,
  RefreshCw,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  formatInrFromPaise,
  generateTransactionsCsv,
  inrToPaise,
} from '../lib/domain';
import { TransactionStatusLabel } from '../components/AppLayouts';
import { useAuth } from '../context/AuthContext';
import type {
  PaymentOrder,
  ReconciliationCase,
  TransactionRecord,
} from '../types/domain';

export function TransactionsListPage() {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [minAmountInr, setMinAmountInr] = useState('');
  const [maxAmountInr, setMaxAmountInr] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ transactions: TransactionRecord[] }>('/api/transactions');
      setTransactions(data.transactions);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const filtered = transactions.filter((txn) => {
    if (directionFilter !== 'all' && txn.direction !== directionFilter) return false;
    if (statusFilter !== 'all' && txn.verificationStatus !== statusFilter) return false;
    if (methodFilter !== 'all' && txn.verificationMethod !== methodFilter) return false;

    if (minAmountInr.trim()) {
      try {
        const minPaise = inrToPaise(minAmountInr);
        if (txn.amountPaise < minPaise) return false;
      } catch {
        // Ignore partial invalid filter input
      }
    }

    if (maxAmountInr.trim()) {
      try {
        const maxPaise = inrToPaise(maxAmountInr);
        if (txn.amountPaise > maxPaise) return false;
      } catch {
        // Ignore
      }
    }

    if (dateFrom) {
      const fromMs = Date.parse(dateFrom);
      if (!Number.isNaN(fromMs) && Date.parse(txn.receivedAt) < fromMs) return false;
    }

    if (dateTo) {
      const toMs = Date.parse(dateTo) + 86400_000;
      if (!Number.isNaN(toMs) && Date.parse(txn.receivedAt) > toMs) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        txn.transactionId.toLowerCase().includes(q) ||
        (txn.orderId && txn.orderId.toLowerCase().includes(q)) ||
        (txn.externalReference && txn.externalReference.toLowerCase().includes(q)) ||
        (txn.counterparty && txn.counterparty.toLowerCase().includes(q))
      );
    }

    return true;
  });

  // Verified incoming sum (excludes outgoing, unmatched, awaiting_reconciliation)
  const verifiedIncomingTotalPaise = filtered
    .filter(
      (t) =>
        t.direction === 'incoming' &&
        (t.verificationStatus === 'verified_email_match' || t.verificationStatus === 'reconciled_manual')
    )
    .reduce((sum, t) => sum + t.amountPaise, 0);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleExportCsv = () => {
    const csvContent = generateTransactionsCsv(filtered);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `FamXPay-Transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#171717] font-display">Transaction Ledger</h1>
          <p className="mt-0.5 text-xs text-[#666666]">
            Deduplicated incoming and outgoing notifications · Outgoing transactions are excluded from received totals.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadTransactions}
            className="px-3.5 py-2 text-xs font-medium bg-white text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="px-4 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* Verified Summary Banner */}
      <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-[#666666]">
            Verified Incoming Payments (Filtered View)
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#171717]">
            {formatInrFromPaise(verifiedIncomingTotalPaise)}
          </div>
        </div>
        <div className="text-xs text-[#666666] font-mono tabular-nums">
          Showing {filtered.length} total records ({paginated.length} on page {page} of {totalPages})
        </div>
      </div>

      {/* Multi-Filter Bar */}
      <div className="bg-white border border-[#E5E2DC] rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#666666] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Txn ID, Order ID, UTR, sender..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
            />
          </div>

          <select
            value={directionFilter}
            onChange={(e) => {
              setDirectionFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
          >
            <option value="all">All Directions</option>
            <option value="incoming">Incoming Only</option>
            <option value="outgoing">Outgoing (Excluded)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
          >
            <option value="all">All Verification Statuses</option>
            <option value="verified_email_match">Verified Email Match</option>
            <option value="reconciled_manual">Manually Reconciled</option>
            <option value="awaiting_reconciliation">Awaiting Reconciliation</option>
            <option value="outgoing_ignored">Outgoing Ignored</option>
          </select>

          <select
            value={methodFilter}
            onChange={(e) => {
              setMethodFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
          >
            <option value="all">All Verification Methods</option>
            <option value="email_imap_reference_match">IMAP Reference Match</option>
            <option value="email_imap_window_match">IMAP Single-Window Match</option>
            <option value="manual_reconciliation">Manual Reconciliation</option>
            <option value="simulated_test_fixture">Sandbox Test Fixture</option>
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <input
            type="text"
            value={minAmountInr}
            onChange={(e) => setMinAmountInr(e.target.value)}
            placeholder="Min INR (e.g. 100)"
            className="px-3 py-1.5 text-xs font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
          />
          <input
            type="text"
            value={maxAmountInr}
            onChange={(e) => setMaxAmountInr(e.target.value)}
            placeholder="Max INR (e.g. 5000)"
            className="px-3 py-1.5 text-xs font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#991B1B]">
          {errorMsg}
        </div>
      )}

      {/* Transactions Table */}
      <div className="bg-white border border-[#E5E2DC] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-[#666666]">Loading transaction ledger...</div>
        ) : paginated.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-[#171717]">No transactions found</p>
            <p className="text-xs text-[#666666]">
              Incoming payment notifications matched via Gmail IMAP or the verification sandbox will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E5E2DC] bg-[#F7F6F2] text-[#666666]">
                  <th className="py-3 px-4 font-medium">Transaction ID</th>
                  <th className="py-3 px-4 font-medium">Order ID</th>
                  <th className="py-3 px-4 font-medium text-right">Amount</th>
                  <th className="py-3 px-4 font-medium">Direction</th>
                  <th className="py-3 px-4 font-medium">Counterparty / Ref</th>
                  <th className="py-3 px-4 font-medium">Received</th>
                  <th className="py-3 px-4 font-medium">Verification Status</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E2DC]">
                {paginated.map((txn) => (
                  <tr key={txn.transactionId} className="hover:bg-[#F7F6F2]">
                    <td className="py-3.5 px-4 font-mono font-semibold text-[#171717] whitespace-nowrap">
                      <Link to={`/app/transactions/${txn.transactionId}`} className="hover:underline">
                        {txn.transactionId}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                      {txn.orderId ? (
                        <Link
                          to={`/app/payment-links/${txn.orderId}`}
                          className="text-[#171717] underline"
                        >
                          {txn.orderId}
                        </Link>
                      ) : (
                        <span className="text-[#666666]">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums font-bold text-right text-[#171717] whitespace-nowrap">
                      {formatInrFromPaise(txn.amountPaise)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#666666] whitespace-nowrap">
                      {txn.direction}
                    </td>
                    <td className="py-3.5 px-4 text-[#666666]">
                      <div>{txn.counterparty || 'Unknown'}</div>
                      {txn.externalReference && (
                        <div className="font-mono text-[11px]">UTR: {txn.externalReference}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-[#666666] whitespace-nowrap">
                      {new Date(txn.receivedAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <TransactionStatusLabel status={txn.verificationStatus} />
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <Link
                        to={`/app/transactions/${txn.transactionId}`}
                        className="font-medium text-[#171717] hover:underline"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-[#E5E2DC] flex items-center justify-between text-xs">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-md disabled:opacity-50 cursor-pointer"
            >
              Previous
            </button>
            <span className="font-mono">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-md disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TransactionDetailsPage() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const [txn, setTxn] = useState<TransactionRecord | null>(null);
  const [matchedOrder, setMatchedOrder] = useState<PaymentOrder | null>(null);
  const [reconCase, setReconCase] = useState<ReconciliationCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!transactionId) return;
    setLoading(true);
    apiRequest<{
      transaction: TransactionRecord;
      matchedOrder: PaymentOrder | null;
      reconciliationCase: ReconciliationCase | null;
    }>(`/api/transactions/${encodeURIComponent(transactionId)}`)
      .then((data) => {
        setTxn(data.transaction);
        setMatchedOrder(data.matchedOrder);
        setReconCase(data.reconciliationCase);
        setErrorMsg(null);
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : 'Transaction not found.');
      })
      .finally(() => setLoading(false));
  }, [transactionId]);

  if (loading) {
    return (
      <div className="p-10 bg-white border border-[#E5E2DC] rounded-xl text-center text-xs text-[#666666]">
        Loading transaction {transactionId}...
      </div>
    );
  }

  if (errorMsg || !txn) {
    return (
      <div className="p-8 bg-white border border-[#E5E2DC] rounded-xl space-y-3">
        <div className="text-sm font-semibold text-[#991B1B]">{errorMsg || 'Not found'}</div>
        <Link to="/app/transactions" className="text-xs font-medium text-[#171717] underline">
          Back to Transactions
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#666666]">
            <Link to="/app/transactions" className="hover:text-[#171717] inline-flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Transactions</span>
            </Link>
            <span aria-hidden="true">/</span>
            <span className="font-mono text-[#171717]">{txn.transactionId}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold font-mono text-[#171717]">
            {formatInrFromPaise(txn.amountPaise)} · {txn.transactionId}
          </h1>
        </div>
        <TransactionStatusLabel status={txn.verificationStatus} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-[#171717] font-display">
            Transaction & Verification Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg">
              <div className="text-[#666666]">External UPI / UTR Reference</div>
              <div className="mt-1 font-mono font-semibold text-[#171717]">
                {txn.externalReference || 'Not present in notification'}
              </div>
            </div>
            <div className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg">
              <div className="text-[#666666]">Direction</div>
              <div className="mt-1 font-mono font-semibold text-[#171717]">{txn.direction}</div>
            </div>
            <div className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg">
              <div className="text-[#666666]">Counterparty</div>
              <div className="mt-1 font-medium text-[#171717]">
                {txn.counterparty || 'Not extracted'}
              </div>
            </div>
            <div className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg">
              <div className="text-[#666666]">Received Timestamp</div>
              <div className="mt-1 font-mono text-[#171717]">
                {new Date(txn.receivedAt).toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg">
              <div className="text-[#666666]">Verification Method</div>
              <div className="mt-1 font-mono text-[#171717]">{txn.verificationMethod}</div>
            </div>
            <div className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg">
              <div className="text-[#666666]">Assurance Level</div>
              <div className="mt-1 font-mono text-[#171717]">{txn.verificationAssurance}</div>
            </div>
          </div>

          {matchedOrder && (
            <div className="p-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-xs text-[#166534] flex items-center justify-between">
              <div>
                <div className="font-semibold">Matched to Payment Order {matchedOrder.orderId}</div>
                <div className="mt-0.5">
                  Order Amount: {formatInrFromPaise(matchedOrder.amountPaise)} · Status: {matchedOrder.status}
                </div>
              </div>
              <Link
                to={`/app/payment-links/${matchedOrder.orderId}`}
                className="font-semibold underline"
              >
                View Order
              </Link>
            </div>
          )}

          {reconCase && (
            <div className="p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-xs text-[#92400E] flex items-center justify-between">
              <div>
                <div className="font-semibold">Linked Reconciliation Case: {reconCase.caseId}</div>
                <div className="mt-0.5">Status: {reconCase.status}</div>
              </div>
              <Link to="/app/reconciliation" className="font-semibold underline text-[#171717]">
                Open Reconciliation
              </Link>
            </div>
          )}
        </div>

        {/* Right: Redacted Diagnostic Evidence */}
        <div className="lg:col-span-5 bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4 text-xs">
          <h2 className="text-base font-bold text-[#171717] font-display">
            Redacted Notification Evidence
          </h2>
          <p className="text-[#666666] leading-relaxed">
            Complete email bodies and sensitive MIME headers are omitted to protect seller privacy.
          </p>

          <div className="p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg space-y-2.5">
            <div>
              <span className="text-[#666666]">SHA-256 Message Hash:</span>
              <div className="font-mono text-[#171717] mt-0.5 break-all">
                {txn.sourceMessageIdHash}
              </div>
            </div>
            <div>
              <span className="text-[#666666]">Redacted Subject Line:</span>
              <div className="font-mono text-[#171717] mt-0.5">{txn.redactedSubject}</div>
            </div>
            <div>
              <span className="text-[#666666]">Evaluation Summary:</span>
              <div className="text-[#171717] mt-0.5 leading-relaxed">{txn.redactedSnippet}</div>
            </div>
            <div className="flex justify-between pt-2 border-t border-[#E5E2DC]">
              <span className="text-[#666666]">Parser Confidence</span>
              <span className="font-mono font-semibold text-[#171717] uppercase">
                {txn.parserConfidence}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReconciliationPage() {
  const { refreshSellerData } = useAuth();
  const [cases, setCases] = useState<ReconciliationCase[]>([]);
  const [candidateOrdersPool, setCandidateOrdersPool] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active resolution modal/panel state
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<
    'match_to_order' | 'mark_unrelated' | 'keep_pending' | 'request_manual_confirmation'
  >('match_to_order');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [confirmDecision, setConfirmDecision] = useState<boolean>(false);
  const [resolving, setResolving] = useState(false);

  const loadReconciliation = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{
        cases: ReconciliationCase[];
        candidateOrdersPool: PaymentOrder[];
      }>('/api/reconciliation');
      setCases(data.cases);
      setCandidateOrdersPool(data.candidateOrdersPool);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load reconciliation cases.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReconciliation();
  }, [loadReconciliation]);

  const handleOpenResolve = (reconCase: ReconciliationCase) => {
    setActiveCaseId(reconCase.caseId);
    setSelectedOrderId(reconCase.candidateOrderIds[0] || '');
    setSelectedAction(reconCase.candidateOrderIds.length > 0 ? 'match_to_order' : 'mark_unrelated');
    setResolutionNotes('');
    setConfirmDecision(false);
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCaseId || resolving) return;
    if (!confirmDecision) {
      setErrorMsg('Please check the confirmation box before applying a manual reconciliation decision.');
      return;
    }

    setResolving(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/reconciliation/${encodeURIComponent(activeCaseId)}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          action: selectedAction,
          targetOrderId: selectedAction === 'match_to_order' ? selectedOrderId : undefined,
          notes: resolutionNotes.trim(),
        }),
      });
      setActiveCaseId(null);
      await loadReconciliation();
      await refreshSellerData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to resolve reconciliation case.');
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#171717] font-display">
            Payment Reconciliation Queue
          </h1>
          <p className="mt-0.5 text-xs text-[#666666]">
            Ambiguous same-amount notifications, late payments, and missing-reference emails require explicit seller review.
          </p>
        </div>
        <button
          type="button"
          onClick={loadReconciliation}
          className="self-start sm:self-auto px-3.5 py-2 text-xs font-medium bg-white text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Queue</span>
        </button>
      </div>

      <div className="p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl text-xs text-[#92400E] leading-relaxed">
        <strong>Settlement Advisory:</strong> Email notification evidence does not prove bank settlement on its own. When resolving an ambiguous case below, verify the UTR / reference against your UPI app or bank statement before matching to an order.
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#991B1B]">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="p-10 bg-white border border-[#E5E2DC] rounded-xl text-center text-xs text-[#666666]">
          Loading reconciliation cases...
        </div>
      ) : cases.length === 0 ? (
        <div className="p-10 bg-white border border-[#E5E2DC] rounded-xl text-center space-y-2">
          <Scale className="w-7 h-7 text-[#666666] mx-auto" />
          <p className="text-sm font-medium text-[#171717]">No reconciliation cases pending</p>
          <p className="text-xs text-[#666666]">
            All incoming notifications either matched unambiguously or no ambiguous emails have been detected.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {cases.map((c) => {
            const matchingAmountOrders = candidateOrdersPool.filter(
              (o) => o.amountPaise === c.amountPaise
            );
            const isOpen = c.status === 'open' || c.status === 'kept_pending';

            return (
              <div
                key={c.caseId}
                className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E2DC] pb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-[#171717]">{c.caseId}</span>
                    <span aria-hidden="true" className="text-[#666666]">·</span>
                    <span className="font-mono font-bold text-base text-[#171717]">
                      {formatInrFromPaise(c.amountPaise)}
                    </span>
                    <span aria-hidden="true" className="text-[#666666]">·</span>
                    <span className="text-xs font-mono text-[#666666]">
                      Txn: {c.transactionId}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-[#171717]">
                    Status: <strong>{c.status}</strong>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <span className="font-semibold text-[#171717]">Reason for Review: </span>
                    <span className="text-[#92400E]">{c.reason}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-[#171717]">Evidence Summary: </span>
                    <span className="text-[#666666] font-mono">{c.evidenceSummary}</span>
                  </div>
                  {c.candidateOrderIds.length > 0 && (
                    <div>
                      <span className="font-semibold text-[#171717]">Candidate Orders: </span>
                      <span className="font-mono text-[#171717]">
                        {c.candidateOrderIds.join(', ')}
                      </span>
                      {c.candidateOrderIds.length > 1 && (
                        <span className="ml-2 text-[#991B1B] font-medium">
                          (Ambiguity Warning: Multiple orders request {formatInrFromPaise(c.amountPaise)})
                        </span>
                      )}
                    </div>
                  )}
                  {c.resolvedAt && (
                    <div className="p-3 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#666666]">
                      Resolved by <strong className="text-[#171717]">{c.resolvedBy}</strong> on{' '}
                      {new Date(c.resolvedAt).toLocaleString('en-IN')} · Notes: “{c.resolutionNotes}”
                    </div>
                  )}
                </div>

                {isOpen && activeCaseId !== c.caseId && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => handleOpenResolve(c)}
                      className="px-4 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] cursor-pointer"
                    >
                      Review & Resolve Case
                    </button>
                  </div>
                )}

                {activeCaseId === c.caseId && (
                  <form
                    onSubmit={handleResolveSubmit}
                    className="p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-xl space-y-4 text-xs"
                  >
                    <div className="font-semibold text-[#171717]">
                      Manual Reconciliation Decision for {c.caseId}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block font-medium text-[#171717] mb-1">
                          Resolution Action
                        </label>
                        <select
                          value={selectedAction}
                          onChange={(e) =>
                            setSelectedAction(
                              e.target.value as
                                | 'match_to_order'
                                | 'mark_unrelated'
                                | 'keep_pending'
                                | 'request_manual_confirmation'
                            )
                          }
                          className="w-full px-3 py-2 bg-white border border-[#E5E2DC] rounded-lg text-[#171717]"
                        >
                          <option value="match_to_order">Match to Order (Verify Payment)</option>
                          <option value="mark_unrelated">Mark Unrelated (Do Not Match)</option>
                          <option value="keep_pending">Keep Pending</option>
                          <option value="request_manual_confirmation">
                            Request Manual Customer Confirmation
                          </option>
                        </select>
                      </div>

                      {selectedAction === 'match_to_order' && (
                        <div>
                          <label className="block font-medium text-[#171717] mb-1">
                            Target Order (Exact Amount {formatInrFromPaise(c.amountPaise)})
                          </label>
                          <select
                            value={selectedOrderId}
                            onChange={(e) => setSelectedOrderId(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-[#E5E2DC] rounded-lg font-mono text-[#171717]"
                          >
                            <option value="">-- Select Target Order --</option>
                            {matchingAmountOrders.map((o) => (
                              <option key={o.orderId} value={o.orderId}>
                                {o.orderId} ({formatInrFromPaise(o.amountPaise)} · {o.status})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block font-medium text-[#171717] mb-1">
                        Audit Resolution Notes (Required)
                      </label>
                      <input
                        type="text"
                        required
                        value={resolutionNotes}
                        onChange={(e) => setResolutionNotes(e.target.value)}
                        placeholder="Verified UTR 412389012345 in FamX statement for customer order..."
                        className="w-full px-3 py-2 bg-white border border-[#E5E2DC] rounded-lg text-[#171717]"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-[#171717] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmDecision}
                        onChange={(e) => setConfirmDecision(e.target.checked)}
                        className="rounded border-[#E5E2DC]"
                      />
                      <span>
                        I confirm this manual reconciliation decision and understand it will be permanently recorded in the audit log.
                      </span>
                    </label>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="submit"
                        disabled={resolving}
                        className="px-4 py-2 bg-[#242424] text-white font-medium rounded-lg hover:bg-[#171717] disabled:opacity-50 cursor-pointer"
                      >
                        {resolving ? 'Applying Decision...' : 'Confirm Resolution'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveCaseId(null)}
                        className="px-4 py-2 bg-white text-[#171717] border border-[#E5E2DC] font-medium rounded-lg hover:bg-[#ECEAE3] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
