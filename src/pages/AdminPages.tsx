import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  RefreshCw,
  Search,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatInrFromPaise } from '../lib/domain';
import type {
  AuditLogEntry,
  GmailMonitoringState,
  PaymentOrder,
  SellerLiveStats,
  SellerPaymentSettings,
  UserProfile,
} from '../types/domain';

interface AdminOverviewData {
  totalSellers: number;
  activeSellers: number;
  openReconciliationCount: number;
  totalOrders: number;
  totalTransactions: number;
  activeMonitorCount: number;
  monitorsWithErrors: number;
  rtdbHealth: { ok: boolean; status: number; detail: string; testedAt: string };
}

export function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<AdminOverviewData>('/api/admin/overview');
      setData(res);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load admin overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#171717] font-display">
            Platform Health & Administration
          </h1>
          <p className="mt-0.5 text-xs text-[#666666]">
            Server-authorized platform overview · Plaintext credentials are never accessible to administrators.
          </p>
        </div>
        <button
          type="button"
          onClick={loadOverview}
          className="px-3.5 py-2 text-xs font-medium bg-white text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#991B1B]">
          {errorMsg}
        </div>
      )}

      {loading || !data ? (
        <div className="p-10 bg-white border border-[#E5E2DC] rounded-xl text-center text-xs text-[#666666]">
          Loading platform metrics...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5">
              <div className="text-xs text-[#666666]">Active Sellers</div>
              <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#171717]">
                {data.activeSellers} / {data.totalSellers}
              </div>
              <div className="mt-1 text-[11px] text-[#666666]">
                <Link to="/admin/sellers" className="underline">
                  Manage seller accounts
                </Link>
              </div>
            </div>

            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5">
              <div className="text-xs text-[#666666]">Pending Reconciliations</div>
              <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#171717]">
                {data.openReconciliationCount}
              </div>
              <div className="mt-1 text-[11px] text-[#666666]">
                Across all seller workspaces
              </div>
            </div>

            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5">
              <div className="text-xs text-[#666666]">Background IMAP Workers</div>
              <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#171717]">
                {data.activeMonitorCount}
              </div>
              <div className="mt-1 text-[11px] text-[#666666]">
                Errors: {data.monitorsWithErrors}
              </div>
            </div>

            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5">
              <div className="text-xs text-[#666666]">Total Orders / Transactions</div>
              <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#171717]">
                {data.totalOrders} / {data.totalTransactions}
              </div>
              <div className="mt-1 text-[11px] text-[#666666]">
                <Link to="/admin/audit-logs" className="underline">
                  Inspect Audit Trail
                </Link>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-2 text-xs">
            <div className="font-semibold text-[#171717]">
              Realtime Database Synchronization Health
            </div>
            <p className="text-[#666666] font-mono">
              Status: {data.rtdbHealth.ok ? 'OK' : 'WARN'} · Detail: {data.rtdbHealth.detail} · Tested:{' '}
              {new Date(data.rtdbHealth.testedAt).toLocaleString('en-IN')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

interface AdminSellerSummary extends UserProfile {
  sellerUpiId: string | null;
  gmailMonitoringEnabled: boolean;
  lastScanAt: string | null;
  stats: SellerLiveStats;
}

export function AdminSellersPage() {
  const [sellers, setSellers] = useState<AdminSellerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadSellers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ sellers: AdminSellerSummary[] }>('/api/admin/sellers');
      setSellers(res.sellers);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load sellers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSellers();
  }, [loadSellers]);

  const handleToggleStatus = async (seller: AdminSellerSummary) => {
    const nextStatus = seller.accountStatus === 'active' ? 'disabled' : 'active';
    try {
      await apiRequest(`/api/admin/sellers/${encodeURIComponent(seller.uid)}/status`, {
        method: 'POST',
        body: JSON.stringify({ accountStatus: nextStatus }),
      });
      await loadSellers();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update seller status.');
    }
  };

  const filtered = sellers.filter((s) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      s.displayName.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.uid.toLowerCase().includes(q) ||
      (s.sellerUpiId && s.sellerUpiId.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#171717] font-display">Authorized Sellers</h1>
          <p className="mt-0.5 text-xs text-[#666666]">
            Manage seller account states and inspect aggregate verification health.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-[#666666] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search seller name, email, VPA..."
            className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-[#E5E2DC] rounded-lg text-[#171717]"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#991B1B]">
          {errorMsg}
        </div>
      )}

      <div className="bg-white border border-[#E5E2DC] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-[#666666]">Loading sellers...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E5E2DC] bg-[#F7F6F2] text-[#666666]">
                  <th className="py-3 px-4 font-medium">Seller</th>
                  <th className="py-3 px-4 font-medium">Role</th>
                  <th className="py-3 px-4 font-medium">UPI VPA</th>
                  <th className="py-3 px-4 font-medium text-right">Verified Volume</th>
                  <th className="py-3 px-4 font-medium">Gmail Monitor</th>
                  <th className="py-3 px-4 font-medium">Account Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E2DC]">
                {filtered.map((s) => (
                  <tr key={s.uid} className="hover:bg-[#F7F6F2]">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[#171717]">{s.displayName}</div>
                      <div className="font-mono text-[11px] text-[#666666]">{s.email}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono">{s.role}</td>
                    <td className="py-3.5 px-4 font-mono text-[#666666]">
                      {s.sellerUpiId || 'Not configured'}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums font-semibold text-right">
                      {formatInrFromPaise(s.stats.verifiedAmountPaise)}
                    </td>
                    <td className="py-3.5 px-4">
                      {s.gmailMonitoringEnabled ? 'Active' : 'Idle'}
                    </td>
                    <td className="py-3.5 px-4 font-mono">{s.accountStatus}</td>
                    <td className="py-3.5 px-4 text-right space-x-3 whitespace-nowrap">
                      <Link
                        to={`/admin/sellers/${s.uid}`}
                        className="font-medium text-[#171717] hover:underline"
                      >
                        Inspect
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(s)}
                        className="text-[#666666] hover:text-[#171717] underline cursor-pointer"
                      >
                        {s.accountStatus === 'active' ? 'Disable' : 'Enable'}
                      </button>
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

export function AdminSellerDetailPage() {
  const { sellerId } = useParams<{ sellerId: string }>();
  const [seller, setSeller] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<SellerPaymentSettings | null>(null);
  const [gmail, setGmail] = useState<GmailMonitoringState | null>(null);
  const [stats, setStats] = useState<SellerLiveStats | null>(null);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sellerId) return;
    setLoading(true);
    apiRequest<{
      seller: UserProfile;
      settings: SellerPaymentSettings | null;
      gmail: GmailMonitoringState | null;
      stats: SellerLiveStats;
      recentOrders: PaymentOrder[];
    }>(`/api/admin/sellers/${encodeURIComponent(sellerId)}`)
      .then((res) => {
        setSeller(res.seller);
        setSettings(res.settings);
        setGmail(res.gmail);
        setStats(res.stats);
        setOrders(res.recentOrders);
      })
      .finally(() => setLoading(false));
  }, [sellerId]);

  if (loading || !seller) {
    return (
      <div className="p-10 bg-white border border-[#E5E2DC] rounded-xl text-center text-xs text-[#666666]">
        Loading seller detail...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/admin/sellers"
          className="text-xs text-[#666666] hover:text-[#171717] inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Sellers</span>
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-[#171717] font-display">
          {seller.displayName} ({seller.email})
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-1.5">
          <div className="font-semibold text-[#171717]">Seller Configuration</div>
          <div>UID: <span className="font-mono">{seller.uid}</span></div>
          <div>Role: <span className="font-mono">{seller.role}</span></div>
          <div>VPA: <span className="font-mono">{settings?.sellerUpiId || 'Not set'}</span></div>
        </div>

        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-1.5">
          <div className="font-semibold text-[#171717]">Gmail Monitor State (Redacted)</div>
          <div>Mailbox: <span className="font-mono">{gmail?.gmailAddress || 'Not set'}</span></div>
          <div>Worker Enabled: <span className="font-mono">{String(Boolean(gmail?.monitoringEnabled))}</span></div>
          <div>Last Scan: <span className="font-mono">{gmail?.lastScanAt || 'Never'}</span></div>
        </div>

        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-1.5">
          <div className="font-semibold text-[#171717]">Aggregate Metrics</div>
          <div>Verified Total: <strong className="font-mono">{formatInrFromPaise(stats?.verifiedAmountPaise || 0)}</strong></div>
          <div>Verified Count: <span className="font-mono">{stats?.verifiedCount || 0}</span></div>
          <div>Open Reconciliations: <span className="font-mono">{stats?.reconciliationCount || 0}</span></div>
        </div>
      </div>

      <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-3">
        <h2 className="text-base font-bold text-[#171717] font-display">Recent Seller Orders</h2>
        {orders.length === 0 ? (
          <p className="text-xs text-[#666666]">No orders created by this seller.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E5E2DC] text-[#666666]">
                  <th className="py-2 pr-4">Order ID</th>
                  <th className="py-2 px-4 text-right">Amount</th>
                  <th className="py-2 px-4">Status</th>
                  <th className="py-2 pl-4">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E2DC]">
                {orders.map((o) => (
                  <tr key={o.orderId}>
                    <td className="py-2.5 pr-4 font-mono">{o.orderId}</td>
                    <td className="py-2.5 px-4 font-mono text-right">
                      {formatInrFromPaise(o.amountPaise)}
                    </td>
                    <td className="py-2.5 px-4 font-mono">{o.status}</td>
                    <td className="py-2.5 pl-4 font-mono text-[#666666]">
                      {new Date(o.createdAt).toLocaleString('en-IN')}
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

export function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ logs: AuditLogEntry[] }>('/api/admin/audit-logs');
      setLogs(res.logs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#171717] font-display">
            Restricted Audit Event Log
          </h1>
          <p className="mt-0.5 text-xs text-[#666666]">
            Immutable record of payment verifications, manual reconciliations, credential changes, and role operations.
          </p>
        </div>
        <button
          type="button"
          onClick={loadLogs}
          className="px-3.5 py-2 text-xs font-medium bg-white text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="bg-white border border-[#E5E2DC] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-[#666666]">Loading audit logs...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E5E2DC] bg-[#F7F6F2] text-[#666666]">
                  <th className="py-3 px-4 font-medium">Timestamp</th>
                  <th className="py-3 px-4 font-medium">Actor</th>
                  <th className="py-3 px-4 font-medium">Action</th>
                  <th className="py-3 px-4 font-medium">Target</th>
                  <th className="py-3 px-4 font-medium">Outcome</th>
                  <th className="py-3 px-4 font-medium">Redacted Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E2DC]">
                {logs.map((log) => (
                  <tr key={log.logId} className="hover:bg-[#F7F6F2]">
                    <td className="py-3 px-4 font-mono tabular-nums text-[#666666] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#171717]">
                      {log.actorEmail || log.actorId}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-[#171717]">
                      {log.action}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#666666]">{log.targetId}</td>
                    <td className="py-3 px-4 font-mono">{log.outcome}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#666666]">
                      {JSON.stringify(log.redactedMetadata)}
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
