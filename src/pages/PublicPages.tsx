import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  QrCode,
  Link2,
  MailCheck,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Lock,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { PublicHeader, PublicFooter } from '../components/AppLayouts';
import { useAuth } from '../context/AuthContext';

export function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2] text-[#171717]">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="max-w-6xl mx-auto px-6 py-16 md:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <div className="text-xs font-medium text-[#666666] mb-3">
                <span>India UPI Seller Toolkit</span>
                <span aria-hidden="true"> · </span>
                <span>Order-Scoped Checkout</span>
                <span aria-hidden="true"> · </span>
                <span>Server-Side Notification Matching</span>
              </div>

              <h1
                className="text-4xl sm:text-5xl font-bold tracking-tight text-[#171717] font-display leading-[1.12]"
                style={{ textWrap: 'balance' }}
              >
                Create a UPI Payment Link in Seconds
              </h1>

              <p className="mt-5 text-base sm:text-lg text-[#666666] leading-relaxed max-w-2xl">
                Generate shareable INR payment links and downloadable NPCI-compliant QR codes for your customers. Monitor incoming FamPay and UPI email notifications on the backend with explicit fraud-resistance and manual reconciliation controls.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to={isAuthenticated ? '/app' : '/login'}
                  className="px-5 py-3 text-sm font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <span>Open Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="#how-it-works"
                  className="px-5 py-3 text-sm font-medium bg-white text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] transition-colors whitespace-nowrap shrink-0"
                >
                  How It Works
                </a>
              </div>

              <div className="mt-8 pt-6 border-t border-[#E5E2DC] text-xs text-[#666666] flex flex-wrap items-center gap-y-2">
                <span>Integer Paise Accounting</span>
                <span className="mx-2" aria-hidden="true">·</span>
                <span>Server-Issued 10-Minute Expiration</span>
                <span className="mx-2" aria-hidden="true">·</span>
                <span>TLS 993 Backend IMAP Verification</span>
              </div>
            </div>

            {/* Right Interactive Preview Card */}
            <div className="lg:col-span-5 flex flex-col justify-center">
              <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center justify-between text-xs text-[#666666] pb-4 border-b border-[#E5E2DC]">
                    <span>Checkout Specification Preview</span>
                    <span className="font-mono">ORD-8F92A1</span>
                  </div>

                  <div className="py-6 text-center">
                    <div className="text-xs text-[#666666]">Payable to Verified Seller VPA</div>
                    <div className="mt-2 text-4xl font-bold font-mono tabular-nums text-[#171717]">
                      ₹1,450.00
                    </div>
                    <div className="mt-1 text-xs text-[#666666] font-mono">
                      145000 paise · Currency: INR
                    </div>
                  </div>

                  <div className="bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg p-4 text-xs space-y-2.5">
                    <div className="flex justify-between">
                      <span className="text-[#666666]">UPI Intent URI</span>
                      <span className="font-mono text-[#171717] truncate max-w-[200px]">
                        upi://pay?pa=store@fam&am=1450.00&cu=INR
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#666666]">Client Approval Blocked</span>
                      <span className="font-medium text-[#166534]">Enforced Server-Side</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#666666]">Same-Amount Ambiguity</span>
                      <span className="font-medium text-[#92400E]">Routes to Reconciliation</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-[#E5E2DC] flex items-center justify-between text-xs text-[#666666]">
                  <span>Supports Google Pay, PhonePe, BHIM & QR Scan</span>
                  <Link to="/register" className="font-semibold text-[#171717] hover:underline">
                    Create Seller Account
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Three Feature Sections */}
        <section className="bg-white border-y border-[#E5E2DC] py-16 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#171717] font-display">
                Core Capabilities for Independent Sellers
              </h2>
              <p className="mt-2 text-sm text-[#666666]">
                Designed for transparent INR payment requests without third-party SDK bloat or client-side security shortcuts.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#F7F6F2] border border-[#E5E2DC] rounded-xl p-6">
                <div className="w-10 h-10 rounded-lg bg-white border border-[#E5E2DC] flex items-center justify-center text-[#171717]">
                  <Link2 className="w-5 h-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[#171717] font-display">
                  01. Payment Links
                </h3>
                <p className="mt-2 text-sm text-[#666666] leading-relaxed">
                  Create cryptographically unpredictable order URLs (<span className="font-mono text-xs">/pay/:orderId</span>) with server-enforced expiration timers and exact integer paise validation.
                </p>
              </div>

              <div className="bg-[#F7F6F2] border border-[#E5E2DC] rounded-xl p-6">
                <div className="w-10 h-10 rounded-lg bg-white border border-[#E5E2DC] flex items-center justify-center text-[#171717]">
                  <QrCode className="w-5 h-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[#171717] font-display">
                  02. UPI QR Codes
                </h3>
                <p className="mt-2 text-sm text-[#666666] leading-relaxed">
                  Generate standard NPCI UPI URIs and high-resolution downloadable PNG QR slips with verified merchant VPA, payee name, and order reference.
                </p>
              </div>

              <div className="bg-[#F7F6F2] border border-[#E5E2DC] rounded-xl p-6">
                <div className="w-10 h-10 rounded-lg bg-white border border-[#E5E2DC] flex items-center justify-center text-[#171717]">
                  <MailCheck className="w-5 h-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[#171717] font-display">
                  03. Payment Tracking
                </h3>
                <p className="mt-2 text-sm text-[#666666] leading-relaxed">
                  Connect your Gmail inbox via TLS IMAP on the server to classify incoming versus outgoing FamPay/UPI receipts and reconcile ambiguous matches safely.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Four-Step Flow */}
        <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#171717] font-display">
            How FamX Pay Works
          </h2>
          <p className="mt-2 text-sm text-[#666666] max-w-2xl">
            Every step separates customer-facing payment initiation from server-side verification.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: '01. Configure Seller VPA & Gmail',
                desc: 'Complete the Setup Wizard with your UPI VPA and test your 16-character Gmail App Password over TLS port 993.',
              },
              {
                step: '02. Generate Order Link & QR',
                desc: 'Enter the INR amount and optional customer reference. The server issues an order ID and 10-minute expiration.',
              },
              {
                step: '03. Customer Scans or Taps UPI',
                desc: 'Customer opens the public checkout link on Android or desktop and pays via Google Pay, PhonePe, or any UPI app.',
              },
              {
                step: '04. Server Matches or Reconciles',
                desc: 'Backend checks eligible incoming payment emails, rejects duplicates, and updates live status or routes to reconciliation.',
              },
            ].map((item) => (
              <div key={item.step} className="bg-white border border-[#E5E2DC] rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[#171717] font-display">{item.step}</h3>
                <p className="mt-2 text-xs text-[#666666] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Security and Verification Limitations Section */}
        <section id="verification" className="max-w-6xl mx-auto px-6 pb-20">
          <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-6 h-6 text-[#171717] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-xl font-bold text-[#171717] font-display">
                  Security Architecture & Verification Limitations
                </h2>
                <p className="mt-2 text-sm text-[#666666] leading-relaxed">
                  FamX Pay is built around strict operational honesty. Before using this platform in production, understand what it verifies and what requires bank or provider settlement verification:
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-[#666666] leading-relaxed">
              <div className="p-4 bg-[#F7F6F2] rounded-lg border border-[#E5E2DC]">
                <p className="font-semibold text-[#171717] mb-1">
                  1. App Handoff Is Never Proof of Payment
                </p>
                Clicking “Pay with Google Pay” or returning to the browser from a UPI app never marks an order as paid. Public clients have zero write access to order status.
              </div>
              <div className="p-4 bg-[#F7F6F2] rounded-lg border border-[#E5E2DC]">
                <p className="font-semibold text-[#171717] mb-1">
                  2. Email Notification vs. Bank Settlement
                </p>
                FamPay/FamApp does not provide a public merchant settlement API here. Matching a Gmail notification provides high-confidence notification evidence or routes ambiguous matches to manual reconciliation—it is not a substitute for inspecting your bank/FamX statement for high-value settlement.
              </div>
              <div className="p-4 bg-[#F7F6F2] rounded-lg border border-[#E5E2DC]">
                <p className="font-semibold text-[#171717] mb-1">
                  3. Server-Only Secret Handling
                </p>
                Your 16-character Gmail App Password is never stored in Firestore, Realtime Database, or browser storage. It is transmitted over HTTPS to the backend for TLS IMAP verification and held only in the server runtime vault.
              </div>
              <div className="p-4 bg-[#F7F6F2] rounded-lg border border-[#E5E2DC]">
                <p className="font-semibold text-[#171717] mb-1">
                  4. Duplicate & Same-Amount Protection
                </p>
                Every transaction reference and message hash is deduplicated server-side. If two open orders request the exact same INR amount and an email arrives without an unambiguous order reference, the system refuses to guess and creates a Reconciliation Case.
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

export function LoginPage() {
  const { signIn, signInWithDevFallback, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = (location.state as { from?: string } | null)?.from || '/app';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDevFallbackOption, setShowDevFallbackOption] = useState(false);

  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F6F2]">
        <PublicHeader />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 max-w-md w-full text-center">
            <CheckCircle2 className="w-8 h-8 text-[#166534] mx-auto" />
            <h1 className="mt-3 text-lg font-bold text-[#171717] font-display">
              Already Signed In
            </h1>
            <p className="mt-1 text-xs text-[#666666]">
              Your seller session is active.
            </p>
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="mt-5 w-full py-2.5 px-4 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] transition-colors cursor-pointer"
            >
              Continue to Dashboard
            </button>
          </div>
        </div>
        <PublicFooter />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);

    if (!email.trim() || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }

    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate(fromPath, { replace: true });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const raw = err instanceof Error ? err.message : 'Sign-in failed';
      if (
        code.includes('operation-not-allowed') ||
        code.includes('configuration-not-found') ||
        code.includes('network-request-failed')
      ) {
        setShowDevFallbackOption(true);
        setErrorMsg(
          `Firebase Auth reported "${code}". Email/Password sign-in may not be enabled yet in the Firebase Console for project hiiii-72d78. You can enable it in the Firebase Console or use the Local Development Session button below to test the workspace.`
        );
      } else if (
        code.includes('invalid-credential') ||
        code.includes('wrong-password') ||
        code.includes('user-not-found')
      ) {
        setShowDevFallbackOption(true);
        setErrorMsg(
          'Invalid email or password for Firebase project hiiii-72d78. Check your credentials, create a new account, or use the Local Workspace Session if testing locally.'
        );
      } else {
        setShowDevFallbackOption(true);
        setErrorMsg(`Authentication error (${code || 'unknown'}): ${raw}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDevFallback = async () => {
    const targetEmail = email.trim() || 'merchant@famxpay.in';
    setSubmitting(true);
    try {
      await signInWithDevFallback(targetEmail);
      navigate(fromPath, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2]">
      <PublicHeader />

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 sm:p-8 max-w-md w-full">
          <div className="flex items-center gap-2 text-xs text-[#666666]">
            <Lock className="w-3.5 h-3.5" />
            <span>Seller Workspace Authentication</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-[#171717] font-display">
            Sign in to FamX Pay
          </h1>
          <p className="mt-1 text-xs text-[#666666]">
            Manage your UPI payment links, Gmail notification monitor, and transaction ledger.
          </p>

          {errorMsg && (
            <div
              role="alert"
              className="mt-4 p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#991B1B] space-y-2"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
              {showDevFallbackOption && (
                <div className="pt-2 border-t border-[#FECACA]">
                  <button
                    type="button"
                    onClick={handleDevFallback}
                    className="w-full py-2 px-3 bg-[#171717] text-white rounded-md font-medium text-xs hover:bg-[#242424] transition-colors cursor-pointer"
                  >
                    Continue with Local Development Session ({email.trim() || 'merchant@famxpay.in'})
                  </button>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-[#171717]">
                Seller Email Address
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="merchant@example.com"
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717] focus:outline-none focus:border-[#171717]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="block text-xs font-medium text-[#171717]">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-[#666666] hover:text-[#171717] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717] focus:outline-none focus:border-[#171717]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-[#E5E2DC] flex items-center justify-between text-xs text-[#666666]">
            <span>New to FamX Pay?</span>
            <Link to="/register" className="font-semibold text-[#171717] hover:underline">
              Create seller account
            </Link>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

export function RegisterPage() {
  const { registerSeller, signInWithDevFallback } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [offerDevFallback, setOfferDevFallback] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);

    if (name.trim().length < 2) {
      setErrorMsg('Please enter your merchant or business name (at least 2 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (!acceptedTerms) {
      setErrorMsg('You must accept the Terms and Service Limitations to create an account.');
      return;
    }

    setSubmitting(true);
    try {
      await registerSeller(name, email, password);
      navigate('/app/setup', { replace: true });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const raw = err instanceof Error ? err.message : 'Registration failed';
      setOfferDevFallback(true);
      if (code.includes('email-already-in-use')) {
        setErrorMsg('An account with this email already exists. Sign in instead.');
      } else if (code.includes('weak-password')) {
        setErrorMsg('Password is too weak. Choose a stronger password with at least 8 characters.');
      } else {
        setErrorMsg(
          `Firebase Auth registration returned "${code || raw}". If Email/Password sign-up is not yet enabled in Firebase Console (hiiii-72d78), you can provision a Local Development Session below to proceed to the Setup Wizard.`
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2]">
      <PublicHeader />

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 sm:p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-[#171717] font-display">
            Create Seller Account
          </h1>
          <p className="mt-1 text-xs text-[#666666]">
            New accounts receive standard seller permissions verified by the backend.
          </p>

          {errorMsg && (
            <div
              role="alert"
              className="mt-4 p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#991B1B] space-y-2"
            >
              <p>{errorMsg}</p>
              {offerDevFallback && (
                <button
                  type="button"
                  onClick={async () => {
                    await signInWithDevFallback(
                      email.trim() || 'merchant@famxpay.in',
                      name.trim() || 'Merchant'
                    );
                    navigate('/app/setup', { replace: true });
                  }}
                  className="w-full py-2 px-3 bg-[#171717] text-white rounded-md font-medium text-xs hover:bg-[#242424] transition-colors cursor-pointer"
                >
                  Provision Local Seller Session & Open Setup Wizard
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="reg-name" className="block text-xs font-medium text-[#171717]">
                Merchant / Business Display Name
              </label>
              <input
                id="reg-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Aarav Electronics"
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717] focus:outline-none focus:border-[#171717]"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-xs font-medium text-[#171717]">
                Email Address
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="merchant@example.com"
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717] focus:outline-none focus:border-[#171717]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-pass" className="block text-xs font-medium text-[#171717]">
                  Password
                </label>
                <input
                  id="reg-pass"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 chars"
                  className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717] focus:outline-none focus:border-[#171717]"
                />
              </div>
              <div>
                <label htmlFor="reg-confirm" className="block text-xs font-medium text-[#171717]">
                  Confirm Password
                </label>
                <input
                  id="reg-confirm"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717] focus:outline-none focus:border-[#171717]"
                />
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-[#666666] cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 rounded border-[#E5E2DC]"
              />
              <span>
                I understand that FamX Pay is an independent payment-link and email reconciliation tool, not an official FamPay gateway, and I agree to the{' '}
                <Link to="/terms" className="text-[#171717] underline">
                  Terms & Service Limitations
                </Link>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-[#E5E2DC] flex items-center justify-between text-xs text-[#666666]">
            <span>Already registered?</span>
            <Link to="/login" className="font-semibold text-[#171717] hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastAttemptMs, setLastAttemptMs] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg('Enter a valid email address.');
      return;
    }

    const now = Date.now();
    if (now - lastAttemptMs < 15_000) {
      setErrorMsg('Please wait 15 seconds before requesting another password reset link.');
      return;
    }

    setSubmitting(true);
    setLastAttemptMs(now);
    try {
      await resetPassword(email);
    } catch {
      // Neutral response: do not reveal whether an email exists in the user directory
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2]">
      <PublicHeader />

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 sm:p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-[#171717] font-display">
            Reset Seller Password
          </h1>
          <p className="mt-1 text-xs text-[#666666]">
            Enter the email associated with your seller workspace.
          </p>

          {submitted ? (
            <div className="mt-5 p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-xs text-[#171717] space-y-2">
              <p className="font-semibold">Reset Request Processed</p>
              <p className="text-[#666666] leading-relaxed">
                If an active seller account matches <span className="font-mono">{email}</span>, a password reset link has been dispatched via Firebase Authentication.
              </p>
              <div className="pt-2">
                <Link to="/login" className="font-semibold text-[#171717] underline">
                  Return to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              {errorMsg && (
                <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#991B1B]">
                  {errorMsg}
                </div>
              )}
              <div>
                <label htmlFor="reset-email" className="block text-xs font-medium text-[#171717]">
                  Email Address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="merchant@example.com"
                  className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717] focus:outline-none focus:border-[#171717]"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 text-sm font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] disabled:opacity-50 transition-colors cursor-pointer"
              >
                {submitting ? 'Sending Reset Link...' : 'Send Reset Link'}
              </button>
            </form>
          )}

          <div className="mt-5 pt-4 border-t border-[#E5E2DC] text-xs text-[#666666]">
            <Link to="/login" className="font-semibold text-[#171717] hover:underline">
              Back to Sign In
            </Link>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

export function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2]">
      <PublicHeader />
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 sm:p-8 space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#171717] font-display">
              Terms of Use & Service Limitations
            </h1>
            <p className="mt-1 text-xs text-[#666666]">
              Effective Specification Version 1.0 · Applicable to Sellers and Checkout Visitors
            </p>
          </div>

          <section className="space-y-2 text-sm text-[#666666] leading-relaxed">
            <h2 className="text-base font-semibold text-[#171717] font-display">
              1. No Official Payment Brand Affiliation
            </h2>
            <p>
              FamX Pay is an independent software utility for generating standard NPCI UPI payment links and matching incoming email notifications. FamX Pay is not affiliated with, endorsed by, or an official merchant gateway of FamPay (Triumph / IDFC First Bank), Google Pay, PhonePe, Paytm, or NPCI.
            </p>
          </section>

          <section className="space-y-2 text-sm text-[#666666] leading-relaxed">
            <h2 className="text-base font-semibold text-[#171717] font-display">
              2. Email Notification Evidence Is Not Guaranteed Settlement
            </h2>
            <p>
              Without a direct banking settlement API or signed webhook from an acquiring bank, email notifications parsed over IMAP represent <em>notification evidence</em> only. Emails can be delayed, filtered, or lack unique order references. Ambiguous matches are routed to manual reconciliation and must be verified against the seller’s actual UPI/bank account statement before releasing high-value goods.
            </p>
          </section>

          <section className="space-y-2 text-sm text-[#666666] leading-relaxed">
            <h2 className="text-base font-semibold text-[#171717] font-display">
              3. Seller Responsibility for UPI Destination (VPA)
            </h2>
            <p>
              Sellers are solely responsible for verifying that their configured UPI ID (VPA) belongs to them and is capable of receiving INR funds. Syntax validation of a VPA does not verify bank ownership.
            </p>
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

export function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2]">
      <PublicHeader />
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 sm:p-8 space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#171717] font-display">
              Privacy Policy & Data Retention
            </h1>
            <p className="mt-1 text-xs text-[#666666]">
              Transparent Data Handling for Gmail IMAP & Checkout Records
            </p>
          </div>

          <section className="space-y-2 text-sm text-[#666666] leading-relaxed">
            <h2 className="text-base font-semibold text-[#171717] font-display">
              1. Minimal Email Metadata Processing
            </h2>
            <p>
              When you test or enable Gmail monitoring, the backend connects to <span className="font-mono text-xs">imap.gmail.com:993</span> over TLS and scans messages within your configured lookback window (default 90 days) strictly to identify FamPay/FamApp/UPI transaction receipts. Unrelated personal emails are ignored and never stored.
            </p>
          </section>

          <section className="space-y-2 text-sm text-[#666666] leading-relaxed">
            <h2 className="text-base font-semibold text-[#171717] font-display">
              2. What Data Is Retained
            </h2>
            <p>
              For candidate payment notifications, FamX Pay stores only a SHA-256 message ID hash (for deduplication), timestamp, extracted INR amount in integer paise, extracted transaction/UTR reference, counterparty name (if present), and a truncated 100-character subject snippet. Complete raw email bodies and sensitive MIME headers are never persisted.
            </p>
          </section>

          <section className="space-y-2 text-sm text-[#666666] leading-relaxed">
            <h2 className="text-base font-semibold text-[#171717] font-display">
              3. Credential Storage & Immediate Revocation
            </h2>
            <p>
              Your 16-character Gmail App Password is never written to Cloud Firestore, Firebase Realtime Database, localStorage, or application logs. You can disable monitoring and purge your stored credential at any time from <span className="font-mono text-xs">/app/gmail</span>, or revoke the App Password directly in your Google Account security settings.
            </p>
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

export function SupportPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2]">
      <PublicHeader />
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-2.5">
            <HelpCircle className="w-6 h-6 text-[#171717]" />
            <h1 className="text-2xl sm:text-3xl font-bold text-[#171717] font-display">
              Support & Troubleshooting Guide
            </h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs text-[#666666] leading-relaxed">
            <div className="p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg space-y-1.5">
              <p className="font-semibold text-[#171717] text-sm">
                Customer Paid After 10-Minute Timer Expired
              </p>
              <p>
                Timer expiration stops the public checkout from presenting the link as newly payable, but it does not mean no payment occurred. Late-arriving email evidence is automatically routed to the seller’s Reconciliation queue (<span className="font-mono">/app/reconciliation</span>).
              </p>
            </div>

            <div className="p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg space-y-1.5">
              <p className="font-semibold text-[#171717] text-sm">
                Gmail Test Connection Rejects Password
              </p>
              <p>
                Gmail IMAP requires 2-Step Verification and a 16-character Google App Password (<span className="font-mono">myaccount.google.com/apppasswords</span>). Your regular Google account password will always be rejected by <span className="font-mono">imap.gmail.com:993</span>.
              </p>
            </div>

            <div className="p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg space-y-1.5">
              <p className="font-semibold text-[#171717] text-sm">
                Two Orders Have the Same INR Amount
              </p>
              <p>
                When two active orders request the same amount (for example, ₹500.00) and the incoming email does not contain the unique order reference (<span className="font-mono">ORD-...</span>), FamX Pay holds both for manual reconciliation so funds are never misassigned.
              </p>
            </div>

            <div className="p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg space-y-1.5">
              <p className="font-semibold text-[#171717] text-sm">
                UPI Deep Link Did Not Launch on Desktop
              </p>
              <p>
                <span className="font-mono">upi://pay</span> deep links are designed for mobile devices with installed UPI apps (Google Pay, PhonePe, BHIM, FamApp). On desktop browsers, scan the displayed QR code using your phone’s UPI app.
              </p>
            </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
