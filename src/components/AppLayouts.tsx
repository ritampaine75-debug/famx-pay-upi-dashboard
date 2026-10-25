import React, { useState } from 'react';
import { Link, NavLink, Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Link2,
  PlusCircle,
  ArrowLeftRight,
  Scale,
  Mail,
  Settings,
  Activity,
  ShieldAlert,
  LogOut,
  Menu,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { OrderStatus, TransactionVerificationStatus } from '../types/domain';

export function PublicHeader() {
  const { isAuthenticated } = useAuth();

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white border-b border-[#E5E2DC]">
      {/* Zone 1: Single text element wordmark */}
      <Link
        to="/"
        className="text-lg font-bold tracking-tight text-[#171717] font-display whitespace-nowrap shrink-0"
      >
        FamX Pay
      </Link>

      {/* Zone 2: 4 concise single-line text navigation links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#666666]">
        <a
          href="/#how-it-works"
          className="hover:text-[#171717] transition-colors whitespace-nowrap shrink-0"
        >
          How It Works
        </a>
        <a
          href="/#verification"
          className="hover:text-[#171717] transition-colors whitespace-nowrap shrink-0"
        >
          Verification Model
        </a>
        <Link
          to="/terms"
          className="hover:text-[#171717] transition-colors whitespace-nowrap shrink-0"
        >
          Terms
        </Link>
        <Link
          to="/support"
          className="hover:text-[#171717] transition-colors whitespace-nowrap shrink-0"
        >
          Support
        </Link>
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center gap-3 shrink-0">
        <Link
          to={isAuthenticated ? '/app' : '/login'}
          className="px-4 py-2 text-xs font-medium text-white bg-[#242424] rounded-lg hover:bg-[#171717] transition-colors whitespace-nowrap shrink-0"
        >
          {isAuthenticated ? 'Open Dashboard' : 'Seller Sign In'}
        </Link>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-[#E5E2DC] bg-white px-6 py-8 mt-auto">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#666666]">
        <div>
          <span className="font-semibold text-[#171717]">FamX Pay</span>
          <span aria-hidden="true"> · </span>
          <span>Independent seller UPI payment-link & notification reconciliation platform. Not affiliated with FamPay, NPCI, Google Pay, or PhonePe.</span>
        </div>
        <div className="flex items-center gap-5 shrink-0">
          <Link to="/privacy" className="hover:text-[#171717] transition-colors whitespace-nowrap">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-[#171717] transition-colors whitespace-nowrap">
            Terms & Limitations
          </Link>
          <Link to="/support" className="hover:text-[#171717] transition-colors whitespace-nowrap">
            Support
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function RequireSellerAuth({ children }: { children?: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F6F2] p-6">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 max-w-sm w-full text-center">
          <p className="text-sm font-medium text-[#171717]">Verifying seller session...</p>
          <p className="text-xs text-[#666666] mt-1">Checking authentication state with Firebase</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export function RequireAdminAuth({ children }: { children?: React.ReactNode }) {
  const { isAuthenticated, loading, profile } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F6F2] p-6">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 max-w-sm w-full text-center">
          <p className="text-sm font-medium text-[#171717]">Checking administrator authorization...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F6F2] p-6">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-8 max-w-md w-full">
          <div className="flex items-center gap-2.5 text-[#991B1B] font-semibold text-base">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>Administrator Role Required</span>
          </div>
          <p className="mt-3 text-sm text-[#666666] leading-relaxed">
            Your seller account (<span className="font-mono text-[#171717]">{profile?.email}</span>) currently holds the{' '}
            <span className="font-mono text-[#171717]">{profile?.role}</span> role. Access to <span className="font-mono">/admin/*</span> routes is restricted to server-authorized administrators.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="px-4 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] transition-colors cursor-pointer"
            >
              Return to Seller Dashboard
            </button>
            <button
              type="button"
              onClick={() => navigate('/app/diagnostics')}
              className="px-4 py-2 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] transition-colors cursor-pointer"
            >
              Open Diagnostics & Bootstrap
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
}

export function SellerAppLayout() {
  const { profile, settings, gmailState, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const navItems = [
    { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/app/setup', label: 'Setup Wizard', icon: CheckCircle2 },
    { to: '/app/payment-links', label: 'Payment Links', icon: Link2 },
    { to: '/app/payment-links/new', label: 'Create Link', icon: PlusCircle },
    { to: '/app/transactions', label: 'Transactions', icon: ArrowLeftRight },
    { to: '/app/reconciliation', label: 'Reconciliation', icon: Scale },
    { to: '/app/gmail', label: 'Gmail Monitor', icon: Mail },
    { to: '/app/settings', label: 'Seller Settings', icon: Settings },
    { to: '/app/diagnostics', label: 'Diagnostics', icon: Activity },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const isSetupReady = Boolean(settings?.sellerUpiId && settings?.destinationConfirmed);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F7F6F2] text-[#171717]">
      {/* Desktop Sidebar (260px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-white border-r border-[#E5E2DC] shrink-0">
        <div className="px-6 py-5 border-b border-[#E5E2DC]">
          <Link to="/app" className="text-lg font-bold tracking-tight text-[#171717] font-display">
            FamX Pay
          </Link>
          <div className="mt-1 text-xs text-[#666666] truncate">
            <span>{settings?.sellerDisplayName || profile?.displayName}</span>
            {settings?.sellerUpiId && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="font-mono">{settings.sellerUpiId}</span>
              </>
            )}
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#242424] text-white'
                      : 'text-[#666666] hover:text-[#171717] hover:bg-[#F7F6F2]'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
              </NavLink>
            );
          })}

          {profile?.role === 'admin' && (
            <div className="pt-4 mt-4 border-t border-[#E5E2DC]">
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#242424] text-white'
                      : 'text-[#666666] hover:text-[#171717] hover:bg-[#F7F6F2]'
                  }`
                }
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">Admin Console</span>
              </NavLink>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-[#E5E2DC] text-xs text-[#666666]">
          <div className="truncate font-mono text-[#171717]">{profile?.email}</div>
          <div className="mt-1 flex items-center justify-between">
            <span>
              {isSetupReady ? 'UPI Configured' : 'UPI Setup Pending'} ·{' '}
              {gmailState?.monitoringEnabled ? 'Monitor On' : 'Monitor Off'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-3 w-full px-3 py-2 text-xs font-medium text-[#171717] bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-[#E5E2DC]">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 -ml-2 text-[#171717] rounded-lg hover:bg-[#F7F6F2]"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <span className="text-sm font-semibold text-[#171717] whitespace-nowrap truncate">
              {settings?.sellerDisplayName || profile?.displayName || 'Seller Workspace'}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-4 text-xs text-[#666666] whitespace-nowrap">
            <span>
              UPI Destination:{' '}
              <strong className="font-mono text-[#171717]">
                {settings?.sellerUpiId || 'Not configured'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Gmail Monitor:{' '}
              <strong className="text-[#171717]">
                {gmailState?.monitoringEnabled
                  ? `Active (${gmailState.gmailAddress})`
                  : gmailState?.hasProvisionedCredential
                    ? 'Ready (Paused)'
                    : 'Not connected'}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/app/payment-links/new"
              className="px-3.5 py-2 text-xs font-medium text-white bg-[#242424] rounded-lg hover:bg-[#171717] transition-colors whitespace-nowrap shrink-0"
            >
              Create Payment Link
            </Link>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-[#E5E2DC] px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      isActive ? 'bg-[#242424] text-white' : 'text-[#666666]'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
            {profile?.role === 'admin' && (
              <NavLink
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#666666]"
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Admin Console</span>
              </NavLink>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#991B1B]"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        )}

        <main className="flex-1 p-6 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AdminAppLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const adminNav = [
    { to: '/admin', label: 'Platform Health', end: true },
    { to: '/admin/sellers', label: 'Authorized Sellers' },
    { to: '/admin/audit-logs', label: 'Audit Logs' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2] text-[#171717]">
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white border-b border-[#E5E2DC]">
        <Link
          to="/admin"
          className="text-lg font-bold tracking-tight text-[#171717] font-display whitespace-nowrap shrink-0"
        >
          FamX Pay Admin
        </Link>

        <nav className="flex items-center gap-6 text-sm font-medium text-[#666666]">
          {adminNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap shrink-0 transition-colors ${
                  isActive ? 'text-[#171717] font-semibold underline underline-offset-4' : 'hover:text-[#171717]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <Link to="/app" className="hover:text-[#171717] whitespace-nowrap shrink-0">
            Seller Workspace
          </Link>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden sm:inline text-xs font-mono text-[#666666]">{profile?.email}</span>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
            className="px-3.5 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-6xl w-full mx-auto">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Unboxed semantic status label (adheres strictly to Zero-Pill discipline:
 * uses icon + clear text label with semantic color, no rounded pill capsules).
 */
export function OrderStatusLabel({ status }: { status: OrderStatus }) {
  switch (status) {
    case 'verified':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#166534] whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Verified (Email Match)</span>
        </span>
      );
    case 'pending':
    case 'created':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#92400E] whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Awaiting Payment</span>
        </span>
      );
    case 'evidence_detected':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#92400E] whitespace-nowrap">
          <Activity className="w-3.5 h-3.5 shrink-0" />
          <span>Evidence Detected</span>
        </span>
      );
    case 'awaiting_reconciliation':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B45309] whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Needs Reconciliation</span>
        </span>
      );
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#666666] whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Expired</span>
        </span>
      );
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#666666] whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Cancelled</span>
        </span>
      );
    case 'verification_failed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#991B1B] whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Verification Failed</span>
        </span>
      );
    default:
      return <span className="text-xs text-[#666666]">{status}</span>;
  }
}

export function TransactionStatusLabel({ status }: { status: TransactionVerificationStatus }) {
  switch (status) {
    case 'verified_email_match':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#166534] whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Verified Email Match</span>
        </span>
      );
    case 'reconciled_manual':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#166534] whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Manually Reconciled</span>
        </span>
      );
    case 'awaiting_reconciliation':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B45309] whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Awaiting Reconciliation</span>
        </span>
      );
    case 'outgoing_ignored':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#666666] whitespace-nowrap">
          <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
          <span>Outgoing (Excluded)</span>
        </span>
      );
    case 'rejected_duplicate':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#991B1B] whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Duplicate Rejected</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#666666] whitespace-nowrap">
          <span>Unmatched</span>
        </span>
      );
  }
}
