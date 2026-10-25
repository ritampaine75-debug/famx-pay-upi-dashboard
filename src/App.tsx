import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import {
  RequireSellerAuth,
  RequireAdminAuth,
  SellerAppLayout,
  AdminAppLayout,
  PublicHeader,
  PublicFooter,
} from './components/AppLayouts';
import {
  LandingPage,
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
  TermsPage,
  PrivacyPage,
  SupportPage,
} from './pages/PublicPages';
import {
  PublicCheckoutPage,
  PublicOrderStatusPage,
} from './pages/PublicCheckoutPages';
import {
  SetupWizardPage,
  DashboardPage,
} from './pages/SellerSetupAndDashboard';
import {
  PaymentLinksListPage,
  CreatePaymentLinkPage,
  PaymentLinkDetailsPage,
} from './pages/PaymentLinksPages';
import {
  TransactionsListPage,
  TransactionDetailsPage,
  ReconciliationPage,
} from './pages/TransactionsAndReconciliationPages';
import {
  GmailSettingsPage,
  SellerSettingsPage,
  DiagnosticsPage,
} from './pages/SettingsAndDiagnosticsPages';
import {
  AdminOverviewPage,
  AdminSellersPage,
  AdminSellerDetailPage,
  AdminAuditLogsPage,
} from './pages/AdminPages';

function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2] text-[#171717]">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-8 max-w-md w-full text-center space-y-3">
          <div className="text-xs font-mono text-[#666666]">HTTP 404</div>
          <h1 className="text-2xl font-bold text-[#171717] font-display">Page Not Found</h1>
          <p className="text-xs text-[#666666]">
            The requested route does not exist on FamX Pay.
          </p>
          <div className="pt-2">
            <Link
              to="/"
              className="px-4 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] inline-block"
            >
              Return Home
            </Link>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/pay/:orderId" element={<PublicCheckoutPage />} />
          <Route path="/pay/:orderId/status" element={<PublicOrderStatusPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/support" element={<SupportPage />} />

          {/* Authenticated Seller Routes */}
          <Route
            path="/app"
            element={
              <RequireSellerAuth>
                <SellerAppLayout />
              </RequireSellerAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="setup" element={<SetupWizardPage />} />
            <Route path="payment-links" element={<PaymentLinksListPage />} />
            <Route path="payment-links/new" element={<CreatePaymentLinkPage />} />
            <Route path="payment-links/:orderId" element={<PaymentLinkDetailsPage />} />
            <Route path="transactions" element={<TransactionsListPage />} />
            <Route path="transactions/:transactionId" element={<TransactionDetailsPage />} />
            <Route path="reconciliation" element={<ReconciliationPage />} />
            <Route path="gmail" element={<GmailSettingsPage />} />
            <Route path="settings" element={<SellerSettingsPage />} />
            <Route path="diagnostics" element={<DiagnosticsPage />} />
          </Route>

          {/* Server-Authorized Administrator Routes */}
          <Route
            path="/admin"
            element={
              <RequireAdminAuth>
                <AdminAppLayout />
              </RequireAdminAuth>
            }
          >
            <Route index element={<AdminOverviewPage />} />
            <Route path="sellers" element={<AdminSellersPage />} />
            <Route path="sellers/:sellerId" element={<AdminSellerDetailPage />} />
            <Route path="audit-logs" element={<AdminAuditLogsPage />} />
          </Route>

          {/* Fallback 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
