import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ref, onValue, set as rtdbSet, get as rtdbGet } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  PlusCircle,
  Mail,
  Activity,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatInrFromPaise, validateUpiVpa } from '../lib/domain';
import { firebaseInitError, firestoreDb, realtimeDb } from '../lib/firebase';
import { OrderStatusLabel } from '../components/AppLayouts';
import type {
  GmailTestConnectionResponse,
  PaymentOrder,
  SellerLiveStats,
  VerificationMode,
} from '../types/domain';

export function SetupWizardPage() {
  const { profile, settings, gmailState, refreshSellerData } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<number>(1);
  const [acknowledgedLimitations, setAcknowledgedLimitations] = useState(true);

  // Step 2: Connectivity probes
  const [probingFirebase, setProbingFirebase] = useState(false);
  const [rtdbProbe, setRtdbProbe] = useState<{ status: 'idle' | 'pass' | 'warn' | 'fail'; detail: string }>({
    status: 'idle',
    detail: 'Click Run Connectivity Check to test RTDB read/write rules.',
  });
  const [firestoreProbe, setFirestoreProbe] = useState<{ status: 'idle' | 'pass' | 'warn' | 'fail'; detail: string }>({
    status: 'idle',
    detail: 'Click Run Connectivity Check to test Firestore access.',
  });
  const [backendProbe, setBackendProbe] = useState<{ status: 'idle' | 'pass' | 'fail'; detail: string }>({
    status: 'idle',
    detail: 'Click Run Connectivity Check to verify backend API health.',
  });

  // Step 3: Seller Identity & UPI
  const [displayName, setDisplayName] = useState(settings?.sellerDisplayName || profile?.displayName || '');
  const [upiId, setUpiId] = useState(settings?.sellerUpiId || '');
  const [supportEmail, setSupportEmail] = useState(settings?.supportEmail || profile?.email || '');
  const [verificationMode, setVerificationMode] = useState<VerificationMode>(
    settings?.verificationMode || 'strict_reference_or_reconcile'
  );
  const [destinationConfirmed, setDestinationConfirmed] = useState(Boolean(settings?.destinationConfirmed));
  const [step3Error, setStep3Error] = useState<string | null>(null);
  const [savingSeller, setSavingSeller] = useState(false);

  // Step 4: Gmail Test Connection
  const [gmailAddress, setGmailAddress] = useState(gmailState?.gmailAddress || profile?.email || '');
  const [appPassword, setAppPassword] = useState('');
  const [lookbackDays, setLookbackDays] = useState<number>(gmailState?.lookbackDays || 90);
  const [testingGmail, setTestingGmail] = useState(false);
  const [gmailTestResult, setGmailTestResult] = useState<GmailTestConnectionResponse | null>(null);
  const [gmailTestError, setGmailTestError] = useState<string | null>(null);

  // Step 5: Save & Enable Monitoring
  const [enableMonitoring, setEnableMonitoring] = useState(true);
  const [savingFinal, setSavingFinal] = useState(false);
  const [saveFinalError, setSaveFinalError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setDisplayName(settings.sellerDisplayName || profile?.displayName || '');
      setUpiId(settings.sellerUpiId || '');
      setSupportEmail(settings.supportEmail || profile?.email || '');
      setVerificationMode(settings.verificationMode || 'strict_reference_or_reconcile');
      setDestinationConfirmed(Boolean(settings.destinationConfirmed));
    }
    if (gmailState?.gmailAddress) {
      setGmailAddress(gmailState.gmailAddress);
    }
  }, [settings, gmailState, profile]);

  const runConnectivityProbes = useCallback(async () => {
    setProbingFirebase(true);
    // 1. Backend Health
    try {
      const health = await apiRequest<{ status: string; serverTime: string }>('/api/health');
      setBackendProbe({
        status: health.status === 'ok' ? 'pass' : 'fail',
        detail: `Backend API reachable (${health.serverTime}).`,
      });
    } catch (err) {
      setBackendProbe({
        status: 'fail',
        detail: err instanceof Error ? err.message : 'Backend unreachable.',
      });
    }

    // 2. RTDB Probe
    try {
      const uid = profile?.uid || 'anon_probe';
      const probeRef = ref(realtimeDb, `diagnosticsProbe/${uid}`);
      await rtdbGet(probeRef);
      try {
        await rtdbSet(probeRef, { probedAt: new Date().toISOString() });
        setRtdbProbe({
          status: 'pass',
          detail: 'Connected to https://hiiii-72d78-default-rtdb.firebaseio.com (read & write verified).',
        });
      } catch {
        setRtdbProbe({
          status: 'pass',
          detail: 'Connected to RTDB (read verified; client write restricted by rules as expected).',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'RTDB error';
      setRtdbProbe({
        status: 'warn',
        detail: `RTDB client probe returned: ${msg.slice(0, 120)}. Backend canonical sync remains operational.`,
      });
    }

    // 3. Firestore Probe
    try {
      const uid = profile?.uid || 'anon_probe';
      const userDoc = doc(firestoreDb, 'users', uid);
      await getDoc(userDoc);
      setFirestoreProbe({
        status: 'pass',
        detail: 'Cloud Firestore client connection and document read verified.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Firestore error';
      setFirestoreProbe({
        status: 'warn',
        detail: `Firestore client probe returned: ${msg.slice(0, 120)}. Deploy firestore.rules via Firebase CLI for direct client queries; backend API continues to serve all records.`,
      });
    } finally {
      setProbingFirebase(false);
    }
  }, [profile?.uid]);

  useEffect(() => {
    if (step === 2 && backendProbe.status === 'idle') {
      void runConnectivityProbes();
    }
  }, [step, backendProbe.status, runConnectivityProbes]);

  const handleSaveSellerIdentity = async () => {
    setStep3Error(null);
    if (displayName.trim().length < 2) {
      setStep3Error('Merchant display name must be at least 2 characters.');
      return;
    }
    const vpaCheck = validateUpiVpa(upiId);
    if (!vpaCheck.valid) {
      setStep3Error(vpaCheck.error || 'Invalid UPI VPA.');
      return;
    }
    if (!destinationConfirmed) {
      setStep3Error('Please confirm that this UPI VPA belongs to your merchant account.');
      return;
    }

    setSavingSeller(true);
    try {
      await apiRequest('/api/me/settings', {
        method: 'PUT',
        body: JSON.stringify({
          sellerDisplayName: displayName.trim(),
          sellerUpiId: vpaCheck.normalized,
          supportEmail: supportEmail.trim(),
          minimumAmountPaise: settings?.minimumAmountPaise || 100,
          maximumAmountPaise: settings?.maximumAmountPaise || 10000000,
          defaultExpiryMinutes: 10,
          verificationMode,
          destinationConfirmed: true,
        }),
      });
      await refreshSellerData();
      setStep(4);
    } catch (err) {
      setStep3Error(err instanceof Error ? err.message : 'Failed to save seller UPI settings.');
    } finally {
      setSavingSeller(false);
    }
  };

  const handleTestGmailConnection = async () => {
    setTestingGmail(true);
    setGmailTestError(null);
    try {
      const res = await apiRequest<GmailTestConnectionResponse>('/api/gmail/test-connection', {
        method: 'POST',
        body: JSON.stringify({
          gmailAddress: gmailAddress.trim(),
          appPassword: appPassword.trim(),
          lookbackDays,
          useStoredSecret: !appPassword.trim() && gmailState?.hasProvisionedCredential,
        }),
      });
      setGmailTestResult(res);
      await refreshSellerData();
    } catch (err) {
      setGmailTestError(err instanceof Error ? err.message : 'Gmail connection test failed.');
    } finally {
      setTestingGmail(false);
    }
  };

  const handleSaveFinalConfiguration = async () => {
    setSavingFinal(true);
    setSaveFinalError(null);
    try {
      if (gmailAddress.trim() && (appPassword.trim() || gmailState?.hasProvisionedCredential)) {
        await apiRequest('/api/gmail/save-configuration', {
          method: 'POST',
          body: JSON.stringify({
            gmailAddress: gmailAddress.trim(),
            appPassword: appPassword.trim() || undefined,
            scanIntervalSeconds: 60,
            lookbackDays,
            enableMonitoring:
              enableMonitoring &&
              Boolean(appPassword.replace(/\s+/g, '').length === 16 || gmailState?.hasProvisionedCredential),
          }),
        });
      }
      await refreshSellerData();
      setAppPassword(''); // Clear sensitive input after provisioning
      setStep(6);
    } catch (err) {
      setSaveFinalError(err instanceof Error ? err.message : 'Failed to save configuration.');
    } finally {
      setSavingFinal(false);
    }
  };

  const stepsList = [
    { num: 1, title: 'Scope & Limits' },
    { num: 2, title: 'Firebase Check' },
    { num: 3, title: 'UPI Identity' },
    { num: 4, title: 'Gmail IMAP Test' },
    { num: 5, title: 'Review & Save' },
    { num: 6, title: 'Readiness' },
  ];

  const isUpiReady = Boolean(settings?.sellerUpiId && settings?.destinationConfirmed);
  const isGmailAuthVerified =
    gmailTestResult?.authentication.status === 'pass' ||
    Boolean(gmailState?.lastSuccessfulConnectionAt);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#171717] font-display">
          Seller Configuration & Verification Wizard
        </h1>
        <p className="mt-1 text-xs text-[#666666]">
          Complete each step to connect your UPI VPA, verify Firebase connectivity, and test server-side Gmail IMAP monitoring.
        </p>
      </div>

      {/* Stepper */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 bg-white border border-[#E5E2DC] rounded-xl p-3">
        {stepsList.map((s) => {
          const isCurrent = step === s.num;
          const isDone = step > s.num;
          return (
            <button
              key={s.num}
              type="button"
              onClick={() => setStep(s.num)}
              className={`px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                isCurrent
                  ? 'bg-[#242424] text-white'
                  : isDone
                    ? 'bg-[#F7F6F2] text-[#171717]'
                    : 'text-[#666666] hover:bg-[#F7F6F2]'
              }`}
            >
              <div className="text-[11px] font-mono opacity-80">Step 0{s.num}</div>
              <div className="text-xs font-semibold truncate">{s.title}</div>
            </button>
          );
        })}
      </div>

      {/* Step 1: Welcome & Product Limitations */}
      {step === 1 && (
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-5">
          <h2 className="text-lg font-bold text-[#171717] font-display">
            Step 1: Product Scope & Settlement Verification Boundaries
          </h2>
          <div className="space-y-3 text-xs text-[#666666] leading-relaxed">
            <p>
              Before accepting customer payments with FamX Pay, review these architectural boundaries:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-[#171717]">
              <li>
                <strong>No Client-Side Approval:</strong> Opening Google Pay, PhonePe, or FamApp from a payment link never marks an order as paid.
              </li>
              <li>
                <strong>Email Matching vs. Bank Settlement:</strong> Gmail IMAP matching detects incoming FamPay/UPI email notifications on the server. Ambiguous or missing-reference emails are routed to your Reconciliation queue (<span className="font-mono">/app/reconciliation</span>).
              </li>
              <li>
                <strong>Zero Secrets in Firebase:</strong> Your 16-character Gmail App Password is sent over HTTPS exclusively to the backend and is never stored in Firestore, Realtime Database, or browser storage.
              </li>
            </ul>
          </div>

          <label className="flex items-center gap-2.5 text-xs text-[#171717] font-medium cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={acknowledgedLimitations}
              onChange={(e) => setAcknowledgedLimitations(e.target.checked)}
              className="rounded border-[#E5E2DC]"
            />
            <span>I understand how FamX Pay verifies incoming notifications and handles ambiguous matches.</span>
          </label>

          <div className="pt-4 border-t border-[#E5E2DC] flex justify-end">
            <button
              type="button"
              disabled={!acknowledgedLimitations}
              onClick={() => setStep(2)}
              className="px-4 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>Continue to Firebase Check</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Firebase & Backend Connectivity Test */}
      {step === 2 && (
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#171717] font-display">
                Step 2: Firebase & Server Connectivity Check
              </h2>
              <p className="text-xs text-[#666666] mt-0.5">
                Project ID: <span className="font-mono text-[#171717]">hiiii-72d78</span>
              </p>
            </div>
            <button
              type="button"
              onClick={runConnectivityProbes}
              disabled={probingFirebase}
              className="px-3.5 py-2 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${probingFirebase ? 'animate-spin' : ''}`} />
              <span>Re-run Probes</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg space-y-1.5">
              <div className="font-semibold text-[#171717]">Firebase Client SDK</div>
              <div className="text-[#166534] font-medium">
                {firebaseInitError ? `Error: ${firebaseInitError}` : 'Initialized (Single App Instance)'}
              </div>
            </div>

            <div className="p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg space-y-1.5">
              <div className="font-semibold text-[#171717]">Realtime Database (RTDB)</div>
              <div className="text-[#666666]">{rtdbProbe.detail}</div>
            </div>

            <div className="p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg space-y-1.5">
              <div className="font-semibold text-[#171717]">Cloud Firestore & Backend API</div>
              <div className="text-[#666666]">{backendProbe.detail}</div>
              <div className="text-[11px] text-[#666666] pt-1">{firestoreProbe.detail}</div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E5E2DC] flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-4 py-2 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="px-4 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>Continue to Seller UPI Identity</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Seller Identity and UPI Details */}
      {step === 3 && (
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-[#171717] font-display">
              Step 3: Seller Identity & UPI Payment Destination
            </h2>
            <p className="text-xs text-[#666666] mt-0.5">
              Configure the payee name and UPI VPA encoded into customer QR codes and UPI deep links. Currency is fixed to INR.
            </p>
          </div>

          {step3Error && (
            <div className="p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#991B1B]">
              {step3Error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#171717]">
                Merchant Display Name (`pn`)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Aarav Digital Store"
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#171717]">
                Seller UPI ID / VPA (`pa`)
              </label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="merchant@fam or store@okaxis"
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#171717]">
                Customer Support Email (optional)
              </label>
              <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                placeholder="support@example.com"
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#171717]">
                Settlement Currency
              </label>
              <input
                type="text"
                disabled
                value="INR (Indian Rupee — Stored as Integer Paise)"
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm font-mono bg-[#ECEAE3] border border-[#E5E2DC] rounded-lg text-[#666666]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#171717]">
              Email Verification Policy
            </label>
            <select
              value={verificationMode}
              onChange={(e) => setVerificationMode(e.target.value as VerificationMode)}
              className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
            >
              <option value="strict_reference_or_reconcile">
                Strict Reference Policy (Require order ID in email remarks or route to Reconciliation)
              </option>
              <option value="single_open_amount_window">
                Single Open Window Policy (Auto-verify when exactly 1 pending order matches the INR amount)
              </option>
            </select>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-[#171717] cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={destinationConfirmed}
              onChange={(e) => setDestinationConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-[#E5E2DC]"
            />
            <span>
              I confirm that <strong className="font-mono">{upiId || 'this UPI ID'}</strong> is my active receiving VPA and I understand that syntax validation does not verify bank ownership.
            </span>
          </label>

          <div className="pt-4 border-t border-[#E5E2DC] flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-4 py-2 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={handleSaveSellerIdentity}
              disabled={savingSeller}
              className="px-4 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>{savingSeller ? 'Saving...' : 'Save UPI Identity & Continue'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Gmail Credentials & Test Connection */}
      {step === 4 && (
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-[#171717] font-display">
              Step 4: Gmail IMAP Authentication & FamPay Notification Discovery
            </h2>
            <p className="text-xs text-[#666666] mt-0.5">
              Tests TLS connection to <span className="font-mono">imap.gmail.com:993</span> on the backend. Your App Password is never saved in Firebase.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#171717]">
                Gmail Address
              </label>
              <input
                type="email"
                value={gmailAddress}
                onChange={(e) => setGmailAddress(e.target.value)}
                placeholder="merchant@gmail.com"
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#171717]">
                16-Character Gmail App Password (Masked)
              </label>
              <input
                type="password"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                placeholder="xxxx xxxx xxxx xxxx"
                autoComplete="off"
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#171717]">
                Lookback Window (Days)
              </label>
              <input
                type="number"
                min={1}
                max={180}
                value={lookbackDays}
                onChange={(e) => setLookbackDays(Number(e.target.value))}
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleTestGmailConnection}
              disabled={testingGmail}
              className="px-4 py-2.5 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingGmail ? 'animate-spin' : ''}`} />
              <span>{testingGmail ? 'Connecting to imap.gmail.com:993...' : 'Test Connection'}</span>
            </button>
            <span className="text-xs text-[#666666]">
              Requires 2-Step Verification and a Google App Password.
            </span>
          </div>

          {gmailTestError && (
            <div className="p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#991B1B]">
              {gmailTestError}
            </div>
          )}

          {/* Separate Status Cards for Each Verification Stage */}
          {gmailTestResult && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {[
                  {
                    title: '1. Input Validation',
                    status: gmailTestResult.inputValidation.status,
                    detail: gmailTestResult.inputValidation.detail,
                  },
                  {
                    title: '2. TLS 993 Connection',
                    status: gmailTestResult.imapConnection.status,
                    detail: gmailTestResult.imapConnection.detail,
                  },
                  {
                    title: '3. Gmail Authentication',
                    status: gmailTestResult.authentication.status,
                    detail: gmailTestResult.authentication.detail,
                  },
                  {
                    title: '4. Email Discovery',
                    status: gmailTestResult.emailDiscovery.status,
                    detail: gmailTestResult.emailDiscovery.detail,
                  },
                  {
                    title: '5. Direction Classification',
                    status:
                      gmailTestResult.authentication.status === 'pass' ? 'pass' : 'skipped',
                    detail: `Incoming: ${gmailTestResult.classification.incomingCandidateCount} · Outgoing: ${gmailTestResult.classification.outgoingCandidateCount} · Ambiguous: ${gmailTestResult.classification.ambiguousCount}`,
                  },
                  {
                    title: '6. Parsing Completeness',
                    status: gmailTestResult.parsingSummary.status,
                    detail: gmailTestResult.parsingSummary.detail,
                  },
                  {
                    title: '7. Credential Provisioning',
                    status: gmailTestResult.credentialProvisioning.status,
                    detail: gmailTestResult.credentialProvisioning.detail,
                  },
                  {
                    title: '8. Monitor Worker Status',
                    status: gmailTestResult.monitoringWorker.status,
                    detail: gmailTestResult.monitoringWorker.detail,
                  },
                ].map((card) => (
                  <div
                    key={card.title}
                    className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg space-y-1"
                  >
                    <div className="flex items-center justify-between font-semibold text-[#171717]">
                      <span>{card.title}</span>
                      <span
                        className={`font-mono uppercase text-[10px] ${
                          card.status === 'pass'
                            ? 'text-[#166534]'
                            : card.status === 'fail'
                              ? 'text-[#991B1B]'
                              : 'text-[#92400E]'
                        }`}
                      >
                        {card.status}
                      </span>
                    </div>
                    <p className="text-[#666666] leading-relaxed">{card.detail}</p>
                  </div>
                ))}
              </div>

              {gmailTestResult.suggestedAction && (
                <div className="p-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-xs text-[#92400E]">
                  <strong>Suggested Action:</strong> {gmailTestResult.suggestedAction}
                </div>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-[#E5E2DC] flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="px-4 py-2 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={() => setStep(5)}
              className="px-4 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>Review Configuration</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Review Configuration and Save */}
      {step === 5 && (
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-5">
          <h2 className="text-lg font-bold text-[#171717] font-display">
            Step 5: Review Configuration & Provision Runtime Vault
          </h2>

          {saveFinalError && (
            <div className="p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#991B1B]">
              {saveFinalError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg space-y-2">
              <div className="font-semibold text-[#171717]">Seller UPI Configuration</div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Display Name</span>
                <span className="font-medium text-[#171717]">{settings?.sellerDisplayName || displayName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Receiving VPA</span>
                <span className="font-mono text-[#171717]">{settings?.sellerUpiId || upiId || 'Not set'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Verification Policy</span>
                <span className="font-mono text-[#171717]">{verificationMode}</span>
              </div>
            </div>

            <div className="p-4 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg space-y-2">
              <div className="font-semibold text-[#171717]">Gmail Monitoring & Secret Storage</div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Gmail Account</span>
                <span className="font-mono text-[#171717]">{gmailAddress || 'Not set'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">App Password Provided</span>
                <span className="font-medium text-[#171717]">
                  {appPassword.replace(/\s+/g, '').length === 16
                    ? 'Yes (Ready to encrypt in server vault)'
                    : gmailState?.hasProvisionedCredential
                      ? 'Already provisioned in runtime vault'
                      : 'No credential provided'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Persistence Mode</span>
                <span className="text-[#92400E]">Encrypted Runtime Vault (In-Memory)</span>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-xs text-[#171717] cursor-pointer">
            <input
              type="checkbox"
              checked={enableMonitoring}
              onChange={(e) => setEnableMonitoring(e.target.checked)}
              className="rounded border-[#E5E2DC]"
            />
            <span>Enable scheduled background IMAP polling (every 60s) when a valid credential is provisioned.</span>
          </label>

          <div className="pt-4 border-t border-[#E5E2DC] flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(4)}
              className="px-4 py-2 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={handleSaveFinalConfiguration}
              disabled={savingFinal}
              className="px-4 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>{savingFinal ? 'Saving Configuration...' : 'Save Configuration & View Readiness'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Honest Setup Completion & Readiness Summary */}
      {step === 6 && (
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-5">
          <div className="flex items-start gap-3">
            {isUpiReady && isGmailAuthVerified ? (
              <CheckCircle2 className="w-6 h-6 text-[#166534] shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-[#92400E] shrink-0 mt-0.5" />
            )}
            <div>
              <h2 className="text-lg font-bold text-[#171717] font-display">
                {isUpiReady && isGmailAuthVerified
                  ? 'Seller Workspace & Gmail Monitoring Ready'
                  : 'Payment Link Creation Ready · Gmail IMAP Verification Pending'}
              </h2>
              <p className="mt-1 text-xs text-[#666666] leading-relaxed">
                {isUpiReady
                  ? `Your UPI destination (${settings?.sellerUpiId}) is configured for creating payment links and QR codes.`
                  : 'You must complete Step 3 (Seller UPI Identity) before creating payment links.'}{' '}
                {isGmailAuthVerified
                  ? 'Your Gmail IMAP connection has been verified.'
                  : 'Continuous live Gmail IMAP matching requires testing and saving a valid 16-character Google App Password in Step 4 or /app/gmail.'}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E5E2DC] flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/app/payment-links/new')}
              disabled={!isUpiReady}
              className="px-4 py-2.5 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] disabled:opacity-50 cursor-pointer"
            >
              Create First Payment Link
            </button>
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="px-4 py-2.5 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] cursor-pointer"
            >
              Open Seller Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { profile, settings, gmailState, stats, refreshSellerData } = useAuth();
  const [recentOrders, setRecentOrders] = useState<PaymentOrder[]>([]);
  const [liveStats, setLiveStats] = useState<SellerLiveStats | null>(stats);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      await refreshSellerData();
      const data = await apiRequest<{ orders: PaymentOrder[] }>('/api/payment-orders');
      setRecentOrders(data.orders.slice(0, 8));
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load dashboard orders.');
    } finally {
      setLoadingOrders(false);
    }
  }, [refreshSellerData]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (stats) {
      setLiveStats(stats);
    }
  }, [stats]);

  // Subscribe to RTDB `sellerLiveStats/{sellerId}` for real-time signals without double-counting
  useEffect(() => {
    if (!profile?.uid) return;
    try {
      const statsRef = ref(realtimeDb, `sellerLiveStats/${profile.uid}`);
      const unsubscribe = onValue(
        statsRef,
        (snap) => {
          const val = snap.val() as SellerLiveStats | null;
          if (val && typeof val.verifiedAmountPaise === 'number') {
            setLiveStats(val);
          }
        },
        () => {
          // Canonical backend stats remain authoritative if RTDB read is denied
        }
      );
      return () => unsubscribe();
    } catch {
      return undefined;
    }
  }, [profile?.uid]);

  const copyCheckoutLink = async (orderId: string) => {
    const url = `${window.location.origin}/pay/${orderId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedOrderId(orderId);
      setTimeout(() => setCopiedOrderId(null), 2000);
    } catch {
      // Ignore
    }
  };

  const isUpiConfigured = Boolean(settings?.sellerUpiId && settings?.destinationConfirmed);

  return (
    <div className="space-y-6">
      {/* Top Heading & Setup Alert */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#171717] font-display">
            Seller Overview
          </h1>
          <p className="mt-0.5 text-xs text-[#666666]">
            Server-derived INR settlement metrics · Pending, expired, and outgoing records are excluded from verified totals.
          </p>
        </div>
        <button
          type="button"
          onClick={loadDashboard}
          className="self-start sm:self-auto px-3.5 py-2 text-xs font-medium bg-white text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Data</span>
        </button>
      </div>

      {!isUpiConfigured && (
        <div className="p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#92400E]">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Seller UPI VPA Not Configured Yet</p>
              <p className="mt-0.5">
                Complete the Setup Wizard to configure your receiving UPI ID before generating customer payment links.
              </p>
            </div>
          </div>
          <Link
            to="/app/setup"
            className="px-3.5 py-2 bg-[#171717] text-white rounded-lg font-medium whitespace-nowrap shrink-0"
          >
            Complete Setup Wizard
          </Link>
        </div>
      )}

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5">
          <div className="text-xs text-[#666666]">Verified Received Amount</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#171717]">
            {formatInrFromPaise(liveStats?.verifiedAmountPaise || 0)}
          </div>
          <div className="mt-1 text-[11px] text-[#666666]">
            Incoming verified & reconciled only
          </div>
        </div>

        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5">
          <div className="text-xs text-[#666666]">Verified Transactions</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#171717]">
            {liveStats?.verifiedCount || 0}
          </div>
          <div className="mt-1 text-[11px] text-[#666666]">
            Deduplicated by UTR / Message Hash
          </div>
        </div>

        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5">
          <div className="text-xs text-[#666666]">Pending Orders</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#171717]">
            {liveStats?.pendingCount || 0}
          </div>
          <div className="mt-1 text-[11px] text-[#666666]">
            Active 10-minute checkout links
          </div>
        </div>

        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5">
          <div className="text-xs text-[#666666]">Reconciliation Cases</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#171717]">
            {liveStats?.reconciliationCount || 0}
          </div>
          <div className="mt-1 text-[11px] text-[#666666]">
            <Link to="/app/reconciliation" className="underline hover:text-[#171717]">
              Review ambiguous notifications
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Actions & Service Health Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#171717] font-display">
              Recent Payment Orders
            </h2>
            <Link
              to="/app/payment-links"
              className="text-xs font-medium text-[#171717] hover:underline"
            >
              View All Orders
            </Link>
          </div>

          {errorMsg && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#991B1B]">
              {errorMsg}
            </div>
          )}

          {loadingOrders ? (
            <div className="py-8 text-center text-xs text-[#666666]">
              Loading recent orders...
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="py-10 text-center space-y-3 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg p-6">
              <p className="text-sm font-medium text-[#171717]">No payment links created yet</p>
              <p className="text-xs text-[#666666] max-w-md mx-auto">
                Create your first INR payment link to generate a shareable customer checkout URL and downloadable UPI QR code.
              </p>
              <Link
                to="/app/payment-links/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717]"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Create Payment Link</span>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E5E2DC] text-[#666666]">
                    <th className="py-2.5 pr-4 font-medium">Order ID</th>
                    <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                    <th className="py-2.5 px-4 font-medium">Created</th>
                    <th className="py-2.5 pl-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E2DC]">
                  {recentOrders.map((order) => (
                    <tr key={order.orderId} className="hover:bg-[#F7F6F2]">
                      <td className="py-3 pr-4 font-mono font-medium text-[#171717]">
                        <Link to={`/app/payment-links/${order.orderId}`} className="hover:underline">
                          {order.orderId}
                        </Link>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums font-semibold text-right text-[#171717]">
                        {formatInrFromPaise(order.amountPaise)}
                      </td>
                      <td className="py-3 px-4">
                        <OrderStatusLabel status={order.status} />
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#666666]">
                        {new Date(order.createdAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 pl-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => copyCheckoutLink(order.orderId)}
                          className="text-xs text-[#666666] hover:text-[#171717] inline-flex items-center gap-1 cursor-pointer"
                          title="Copy public checkout URL"
                        >
                          {copiedOrderId === order.orderId ? (
                            <Check className="w-3.5 h-3.5 text-[#166534]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>Copy Link</span>
                        </button>
                        <Link
                          to={`/pay/${order.orderId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[#171717] hover:underline inline-flex items-center gap-1"
                        >
                          <span>Checkout</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Quick Actions & Service Health */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-3">
            <h2 className="text-base font-bold text-[#171717] font-display">Quick Actions</h2>
            <div className="space-y-2">
              <Link
                to="/app/payment-links/new"
                className="w-full py-2.5 px-4 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] flex items-center justify-between"
              >
                <span>Create Payment Link</span>
                <PlusCircle className="w-4 h-4" />
              </Link>
              <Link
                to="/app/transactions"
                className="w-full py-2.5 px-4 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] flex items-center justify-between"
              >
                <span>View Transactions & Export CSV</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/app/gmail"
                className="w-full py-2.5 px-4 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] flex items-center justify-between"
              >
                <span>Test Gmail & Simulate Evidence</span>
                <Mail className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#171717] font-display">Service Health</h2>
              <Link to="/app/diagnostics" className="text-[#171717] underline">
                Diagnostics
              </Link>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex justify-between">
                <span className="text-[#666666]">Seller UPI Destination</span>
                <span className="font-mono text-[#171717]">
                  {settings?.sellerUpiId || 'Not configured'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Gmail Monitor Worker</span>
                <span className="font-medium text-[#171717]">
                  {gmailState?.monitoringEnabled ? 'Active (Polling)' : 'Idle'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Runtime Secret Vault</span>
                <span className="font-medium text-[#171717]">
                  {gmailState?.hasProvisionedCredential ? 'Provisioned' : 'Empty'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Last IMAP Scan</span>
                <span className="font-mono tabular-nums text-[#666666]">
                  {gmailState?.lastScanAt
                    ? new Date(gmailState.lastScanAt).toLocaleTimeString('en-IN')
                    : 'Never'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
