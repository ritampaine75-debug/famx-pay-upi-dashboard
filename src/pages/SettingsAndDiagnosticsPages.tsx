import React, { useEffect, useState, useCallback } from 'react';
import { ref, get as rtdbGet, set as rtdbSet } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import {
  Mail,
  RefreshCw,
  Trash2,
  PauseCircle,
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import {
  formatInrFromPaise,
  inrToPaise,
  paiseToInrDecimal,
  validateUpiVpa,
} from '../lib/domain';
import { firebaseInitError, firestoreDb, realtimeDb } from '../lib/firebase';
import type {
  GmailTestConnectionResponse,
  PaymentOrder,
  VerificationMode,
} from '../types/domain';

export function GmailSettingsPage() {
  const { gmailState, refreshSellerData } = useAuth();

  const [gmailAddress, setGmailAddress] = useState(gmailState?.gmailAddress || '');
  const [appPassword, setAppPassword] = useState('');
  const [scanIntervalSeconds, setScanIntervalSeconds] = useState<number>(
    gmailState?.scanIntervalSeconds || 60
  );
  const [lookbackDays, setLookbackDays] = useState<number>(gmailState?.lookbackDays || 90);
  const [enableMonitoring, setEnableMonitoring] = useState<boolean>(
    Boolean(gmailState?.monitoringEnabled)
  );

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [polling, setPolling] = useState(false);
  const [testResult, setTestResult] = useState<GmailTestConnectionResponse | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Test Fixture Simulator state
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [simSubject, setSimSubject] = useState('FamPay: You received ₹250.00 via UPI');
  const [simFrom, setSimFrom] = useState('no-reply@fampay.in');
  const [simBody, setSimBody] = useState(
    'Money received! ₹250.00 has been credited to your FamX account from Rohan Sharma. UPI Ref No: 429811223344. Remarks: ORD-PREVIEW'
  );
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<string | null>(null);

  useEffect(() => {
    if (gmailState) {
      setGmailAddress(gmailState.gmailAddress || '');
      setScanIntervalSeconds(gmailState.scanIntervalSeconds || 60);
      setLookbackDays(gmailState.lookbackDays || 90);
      setEnableMonitoring(gmailState.monitoringEnabled);
    }
  }, [gmailState]);

  useEffect(() => {
    apiRequest<{ orders: PaymentOrder[] }>('/api/payment-orders')
      .then((res) => {
        setOrders(res.orders);
        const pending = res.orders.find((o) => o.status === 'pending');
        if (pending) {
          const inrStr = paiseToInrDecimal(pending.amountPaise);
          setSimSubject(`FamPay: You received ₹${inrStr} via UPI`);
          setSimBody(
            `Money received! ₹${inrStr} has been credited to your FamX account from Customer. UPI Ref No: ${Math.floor(
              100000000000 + Math.random() * 899999999999
            )}. Remarks: ${pending.orderId}`
          );
        }
      })
      .catch(() => {});
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setStatusMessage(null);
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
      setTestResult(res);
      await refreshSellerData();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Connection test failed.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      await apiRequest('/api/gmail/save-configuration', {
        method: 'POST',
        body: JSON.stringify({
          gmailAddress: gmailAddress.trim(),
          appPassword: appPassword.trim() || undefined,
          scanIntervalSeconds,
          lookbackDays,
          enableMonitoring,
        }),
      });
      setAppPassword('');
      await refreshSellerData();
      setStatusMessage({
        type: 'success',
        text: 'Gmail configuration saved. App Password encrypted in server runtime vault.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save configuration.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDisableMonitoring = async (removeCredential: boolean) => {
    setSaving(true);
    setStatusMessage(null);
    try {
      await apiRequest('/api/gmail/disable-monitoring', {
        method: 'POST',
        body: JSON.stringify({ removeCredential }),
      });
      if (removeCredential) {
        setAppPassword('');
      }
      await refreshSellerData();
      setStatusMessage({
        type: 'success',
        text: removeCredential
          ? 'Monitoring stopped and stored App Password purged from server runtime vault.'
          : 'Background Gmail monitoring paused.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update monitoring state.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePollNow = async () => {
    setPolling(true);
    setStatusMessage(null);
    try {
      const res = await apiRequest<{ scanResult: GmailTestConnectionResponse }>(
        '/api/gmail/poll-now',
        { method: 'POST' }
      );
      setTestResult(res.scanResult);
      await refreshSellerData();
      setStatusMessage({
        type: 'success',
        text: 'Immediate IMAP mailbox scan completed.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Manual poll failed.',
      });
    } finally {
      setPolling(false);
    }
  };

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    setSimResult(null);
    try {
      const res = await apiRequest<{
        evaluation: { outcome: string; reason: string; transaction?: { transactionId: string } };
      }>('/api/gmail/simulate-evidence', {
        method: 'POST',
        body: JSON.stringify({
          from: simFrom,
          subject: simSubject,
          bodyText: simBody,
        }),
      });
      await refreshSellerData();
      setSimResult(
        `Outcome: ${res.evaluation.outcome.toUpperCase()} — ${res.evaluation.reason}`
      );
    } catch (err) {
      setSimResult(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#171717] font-display">
          Gmail IMAP Connection & Monitoring Settings
        </h1>
        <p className="mt-0.5 text-xs text-[#666666]">
          Server-only TLS 993 connection to <span className="font-mono">imap.gmail.com</span> · App Passwords are never stored in Firebase or browser storage.
        </p>
      </div>

      {/* Current Monitoring Status Bar */}
      <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div>
          <div className="text-[#666666]">Monitor Worker Status</div>
          <div className="mt-1 font-semibold text-[#171717]">
            {gmailState?.monitoringEnabled ? 'Active (Polling)' : 'Disabled / Paused'}
          </div>
        </div>
        <div>
          <div className="text-[#666666]">Credential Provisioning</div>
          <div className="mt-1 font-mono text-[#171717]">
            {gmailState?.hasProvisionedCredential
              ? 'Provisioned (Encrypted RAM Vault)'
              : 'Not Provisioned'}
          </div>
        </div>
        <div>
          <div className="text-[#666666]">Last Successful IMAP Auth</div>
          <div className="mt-1 font-mono tabular-nums text-[#171717]">
            {gmailState?.lastSuccessfulConnectionAt
              ? new Date(gmailState.lastSuccessfulConnectionAt).toLocaleString('en-IN')
              : 'Never'}
          </div>
        </div>
        <div>
          <div className="text-[#666666]">Recent Scan Time</div>
          <div className="mt-1 font-mono tabular-nums text-[#171717]">
            {gmailState?.lastScanAt
              ? new Date(gmailState.lastScanAt).toLocaleString('en-IN')
              : 'Never'}
          </div>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl border text-xs ${
            statusMessage.type === 'success'
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Main Credential & Monitoring Configuration Card */}
      <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-5">
        <h2 className="text-base font-bold text-[#171717] font-display">
          IMAP Credentials & Scan Parameters
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              {gmailState?.hasProvisionedCredential
                ? 'Replace 16-Character App Password (Optional)'
                : '16-Character Gmail App Password (Masked)'}
            </label>
            <input
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder={
                gmailState?.hasProvisionedCredential
                  ? 'Leave blank to use stored vault credential'
                  : 'xxxx xxxx xxxx xxxx'
              }
              autoComplete="off"
              className="mt-1.5 w-full px-3.5 py-2.5 text-sm font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#171717]">
              Scan Interval (Seconds, Bounded 45s–600s)
            </label>
            <input
              type="number"
              min={45}
              max={600}
              value={scanIntervalSeconds}
              onChange={(e) => setScanIntervalSeconds(Number(e.target.value))}
              className="mt-1.5 w-full px-3.5 py-2 text-sm font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#171717]">
              Lookback Window (Days, Default 90)
            </label>
            <input
              type="number"
              min={1}
              max={180}
              value={lookbackDays}
              onChange={(e) => setLookbackDays(Number(e.target.value))}
              className="mt-1.5 w-full px-3.5 py-2 text-sm font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
            />
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-xs text-[#171717] cursor-pointer">
          <input
            type="checkbox"
            checked={enableMonitoring}
            onChange={(e) => setEnableMonitoring(e.target.checked)}
            className="rounded border-[#E5E2DC]"
          />
          <span>Enable continuous background polling worker</span>
        </label>

        {/* Action Buttons */}
        <div className="pt-3 border-t border-[#E5E2DC] flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2.5 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
            <span>{testing ? 'Testing TLS IMAP...' : 'Test Connection'}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={saving}
            className="px-4 py-2.5 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>
              {gmailState?.hasProvisionedCredential ? 'Save / Replace Credential' : 'Save Configuration'}
            </span>
          </button>

          {gmailState?.hasProvisionedCredential && (
            <button
              type="button"
              onClick={handlePollNow}
              disabled={polling}
              className="px-4 py-2.5 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{polling ? 'Polling...' : 'Poll Mailbox Now'}</span>
            </button>
          )}

          {gmailState?.monitoringEnabled && (
            <button
              type="button"
              onClick={() => handleDisableMonitoring(false)}
              disabled={saving}
              className="px-4 py-2.5 text-xs font-medium bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A] rounded-lg hover:bg-[#FEF3C7] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <PauseCircle className="w-3.5 h-3.5" />
              <span>Disable Monitoring</span>
            </button>
          )}

          {gmailState?.hasProvisionedCredential && (
            <button
              type="button"
              onClick={() => handleDisableMonitoring(true)}
              disabled={saving}
              className="px-4 py-2.5 text-xs font-medium bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA] rounded-lg hover:bg-[#FEE2E2] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove Stored Credential</span>
            </button>
          )}
        </div>
      </div>

      {/* Structured 8-Part Test Connection Report */}
      {testResult && (
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#171717] font-display">
              Structured IMAP Diagnostic Report
            </h2>
            <span className="text-xs font-mono text-[#666666]">
              Overall: <strong className="text-[#171717]">{testResult.overallStatus}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {[
              { label: '1. Input Validation', item: testResult.inputValidation },
              { label: '2. IMAP TLS Connection', item: testResult.imapConnection },
              { label: '3. Authentication', item: testResult.authentication },
              { label: '4. Relevant Email Discovery', item: testResult.emailDiscovery },
              {
                label: '5. Incoming Detection',
                item: {
                  status: testResult.classification.incomingCandidateCount > 0 ? 'pass' : 'warn',
                  detail: `${testResult.classification.incomingCandidateCount} incoming candidates detected.`,
                },
              },
              {
                label: '6. Outgoing Detection',
                item: {
                  status: 'pass',
                  detail: `${testResult.classification.outgoingCandidateCount} outgoing alerts (excluded from received funds).`,
                },
              },
              { label: '7. Parsing Completeness', item: testResult.parsingSummary },
              { label: '8. Credential & Worker', item: testResult.credentialProvisioning },
            ].map((stage) => (
              <div
                key={stage.label}
                className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg space-y-1"
              >
                <div className="flex items-center justify-between font-semibold text-[#171717]">
                  <span>{stage.label}</span>
                  <span className="font-mono uppercase text-[10px]">{stage.item.status}</span>
                </div>
                <p className="text-[#666666] leading-relaxed">{stage.item.detail}</p>
              </div>
            ))}
          </div>

          {testResult.parsingSummary.sampleCandidates.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#171717]">
                Parsed Candidate Messages (Bounded Sample)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E5E2DC] text-[#666666]">
                      <th className="py-2 pr-3">Direction</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                      <th className="py-2 px-3">Txn Ref</th>
                      <th className="py-2 px-3">Order Ref</th>
                      <th className="py-2 pl-3">Subject Snippet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E2DC]">
                    {testResult.parsingSummary.sampleCandidates.map((cand) => (
                      <tr key={cand.messageIdHash}>
                        <td className="py-2 pr-3 font-mono">{cand.direction}</td>
                        <td className="py-2 px-3 font-mono text-right">
                          {cand.amountPaise ? formatInrFromPaise(cand.amountPaise) : 'Missing'}
                        </td>
                        <td className="py-2 px-3 font-mono">{cand.transactionReference || '—'}</td>
                        <td className="py-2 px-3 font-mono">{cand.orderReference || '—'}</td>
                        <td className="py-2 pl-3 text-[#666666] truncate max-w-xs">
                          {cand.redactedSubject}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Test Environment Email Evidence Simulator (Section 18 E2E Testing Support) */}
      <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#171717] font-display">
              Verification Sandbox: Simulate Incoming Email Evidence
            </h2>
            <p className="mt-0.5 text-xs text-[#666666]">
              Test how the backend parser and matching engine handle unambiguous matches, same-amount ambiguity, and outgoing payments without using real customer transactions. Records created here are explicitly labeled <span className="font-mono">simulated_test_fixture</span>.
            </p>
          </div>
        </div>

        {/* Preset Scenario Buttons */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[#666666] font-medium">Load Preset Fixture:</span>
          <button
            type="button"
            onClick={() => {
              const target = orders.find((o) => o.status === 'pending') || orders[0];
              const inr = target ? paiseToInrDecimal(target.amountPaise) : '250.00';
              const refId = target ? target.orderId : 'ORD-DEMO01';
              setSimSubject(`FamPay: You received ₹${inr} via UPI`);
              setSimBody(
                `Money received! ₹${inr} has been credited to your FamX account from Customer. UPI Ref No: ${Math.floor(
                  100000000000 + Math.random() * 899999999999
                )}. Remarks: ${refId}`
              );
            }}
            className="px-3 py-1.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-md hover:bg-[#ECEAE3] cursor-pointer"
          >
            1. Strong Unambiguous Incoming Match
          </button>

          <button
            type="button"
            onClick={() => {
              const target = orders.find((o) => o.status === 'pending') || orders[0];
              const inr = target ? paiseToInrDecimal(target.amountPaise) : '250.00';
              setSimSubject(`FamPay: Money received ₹${inr}`);
              setSimBody(
                `₹${inr} received in your FamX account from Sneha Patel. UPI Ref No: ${Math.floor(
                  100000000000 + Math.random() * 899999999999
                )}. (No order reference included)`
              );
            }}
            className="px-3 py-1.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-md hover:bg-[#ECEAE3] cursor-pointer"
          >
            2. Ambiguous (Missing Order Reference)
          </button>

          <button
            type="button"
            onClick={() => {
              setSimSubject('FamPay: You paid ₹250.00 to Swiggy');
              setSimBody(
                `₹250.00 debited from your FamX account. Paid to Swiggy. UPI Ref No: ${Math.floor(
                  100000000000 + Math.random() * 899999999999
                )}.`
              );
            }}
            className="px-3 py-1.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-md hover:bg-[#ECEAE3] cursor-pointer"
          >
            3. Outgoing Receipt (Must Exclude)
          </button>
        </div>

        <form onSubmit={handleRunSimulation} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#171717] mb-1">Sender Header</label>
              <input
                type="text"
                value={simFrom}
                onChange={(e) => setSimFrom(e.target.value)}
                className="w-full px-3 py-2 font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#171717] mb-1">Subject Header</label>
              <input
                type="text"
                value={simSubject}
                onChange={(e) => setSimSubject(e.target.value)}
                className="w-full px-3 py-2 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#171717] mb-1">Notification Body Text</label>
            <textarea
              rows={3}
              value={simBody}
              onChange={(e) => setSimBody(e.target.value)}
              className="w-full px-3 py-2 font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
            />
          </div>

          <button
            type="submit"
            disabled={simulating}
            className="px-4 py-2 bg-[#242424] text-white font-medium rounded-lg hover:bg-[#171717] disabled:opacity-50 cursor-pointer"
          >
            {simulating ? 'Evaluating Fixture...' : 'Evaluate Email Fixture Against Open Orders'}
          </button>
        </form>

        {simResult && (
          <div className="p-3.5 bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-xs font-mono text-[#171717]">
            {simResult}
          </div>
        )}
      </div>
    </div>
  );
}

export function SellerSettingsPage() {
  const { profile, settings, authMode, refreshSellerData } = useAuth();

  const [displayName, setDisplayName] = useState(settings?.sellerDisplayName || '');
  const [upiId, setUpiId] = useState(settings?.sellerUpiId || '');
  const [supportEmail, setSupportEmail] = useState(settings?.supportEmail || '');
  const [minInr, setMinInr] = useState(
    settings ? paiseToInrDecimal(settings.minimumAmountPaise) : '1.00'
  );
  const [maxInr, setMaxInr] = useState(
    settings ? paiseToInrDecimal(settings.maximumAmountPaise) : '100000.00'
  );
  const [verificationMode, setVerificationMode] = useState<VerificationMode>(
    settings?.verificationMode || 'strict_reference_or_reconcile'
  );
  const [destinationConfirmed, setDestinationConfirmed] = useState(
    Boolean(settings?.destinationConfirmed)
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    if (settings) {
      setDisplayName(settings.sellerDisplayName);
      setUpiId(settings.sellerUpiId);
      setSupportEmail(settings.supportEmail);
      setMinInr(paiseToInrDecimal(settings.minimumAmountPaise));
      setMaxInr(paiseToInrDecimal(settings.maximumAmountPaise));
      setVerificationMode(settings.verificationMode);
      setDestinationConfirmed(settings.destinationConfirmed);
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const vpaCheck = validateUpiVpa(upiId);
    if (!vpaCheck.valid) {
      setFeedback({ type: 'error', text: vpaCheck.error || 'Invalid UPI VPA.' });
      return;
    }

    let minPaise: number;
    let maxPaise: number;
    try {
      minPaise = inrToPaise(minInr);
      maxPaise = inrToPaise(maxInr);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Invalid amount limits.',
      });
      return;
    }

    setSaving(true);
    try {
      await apiRequest('/api/me/settings', {
        method: 'PUT',
        body: JSON.stringify({
          sellerDisplayName: displayName.trim(),
          sellerUpiId: vpaCheck.normalized,
          supportEmail: supportEmail.trim(),
          minimumAmountPaise: minPaise,
          maximumAmountPaise: maxPaise,
          verificationMode,
          destinationConfirmed,
        }),
      });
      await refreshSellerData();
      setFeedback({
        type: 'success',
        text: 'Seller profile and UPI payment settings updated.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#171717] font-display">
          Seller Profile & Payment Settings
        </h1>
        <p className="mt-0.5 text-xs text-[#666666]">
          Authorized updates to your merchant display name, receiving UPI VPA, and order amount limits.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs ${
            feedback.type === 'success'
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSave}
          className="lg:col-span-8 bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#171717]">
                Merchant Display Name
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#171717]">
                UPI ID / VPA
              </label>
              <input
                type="text"
                required
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="merchant@fam"
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#171717]">
                Support Contact Email
              </label>
              <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#171717]">
                Account Email (Read-Only)
              </label>
              <input
                type="email"
                disabled
                value={profile?.email || ''}
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm font-mono bg-[#ECEAE3] border border-[#E5E2DC] rounded-lg text-[#666666]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#171717]">
                Minimum Order Amount (INR)
              </label>
              <input
                type="text"
                value={minInr}
                onChange={(e) => setMinInr(e.target.value)}
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#171717]">
                Maximum Order Amount (INR)
              </label>
              <input
                type="text"
                value={maxInr}
                onChange={(e) => setMaxInr(e.target.value)}
                className="mt-1.5 w-full px-3.5 py-2.5 text-sm font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
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
                Single Open Window Policy (Auto-verify when 1 active order matches exact amount)
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
              I confirm that <strong className="font-mono">{upiId || 'this VPA'}</strong> is my intended receiving UPI destination.
            </span>
          </label>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving Settings...' : 'Save Seller Settings'}
            </button>
          </div>
        </form>

        <div className="lg:col-span-4 bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-3 text-xs">
          <h2 className="text-base font-bold text-[#171717] font-display">
            Session & Security Context
          </h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-[#666666]">Seller UID</span>
              <span className="font-mono text-[#171717]">{profile?.uid}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666666]">Server-Assigned Role</span>
              <span className="font-mono font-semibold text-[#171717]">{profile?.role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666666]">Auth Provider Mode</span>
              <span className="font-mono text-[#171717]">{authMode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666666]">Account Status</span>
              <span className="font-mono text-[#166534]">{profile?.accountStatus}</span>
            </div>
          </div>
          <p className="pt-2 border-t border-[#E5E2DC] text-[11px] text-[#666666] leading-relaxed">
            Role and seller ownership cannot be modified from the browser.
          </p>
        </div>
      </div>
    </div>
  );
}

export function DiagnosticsPage() {
  const { profile, authMode, gmailState, refreshSellerData } = useAuth();

  const [probing, setProbing] = useState(false);
  const [rtdbDiag, setRtdbDiag] = useState<{
    readOk: boolean;
    writeOk: boolean;
    publicWriteWarning: boolean;
    detail: string;
  } | null>(null);
  const [firestoreDiag, setFirestoreDiag] = useState<{
    readOk: boolean;
    detail: string;
  } | null>(null);
  const [backendHealth, setBackendHealth] = useState<Record<string, unknown> | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);

  // Admin bootstrap state
  const [bootstrapText, setBootstrapText] = useState('');
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapMsg, setBootstrapMsg] = useState<string | null>(null);

  const runFullDiagnostics = useCallback(async () => {
    setProbing(true);
    try {
      // 1. Backend Health
      const health = await apiRequest<Record<string, unknown>>('/api/health');
      setBackendHealth(health);
    } catch (err) {
      setBackendHealth({ status: 'error', message: err instanceof Error ? err.message : 'Unreachable' });
    }

    // 2. RTDB Read & Write Probe
    try {
      const uid = profile?.uid || 'diag_probe';
      const probeRef = ref(realtimeDb, `diagnosticsProbe/${uid}`);
      await rtdbGet(probeRef);
      let writeOk = false;
      try {
        await rtdbSet(probeRef, { testedAt: new Date().toISOString() });
        writeOk = true;
      } catch {
        writeOk = false;
      }
      setRtdbDiag({
        readOk: true,
        writeOk,
        publicWriteWarning: writeOk && authMode !== 'firebase',
        detail: writeOk
          ? authMode !== 'firebase'
            ? 'RTDB allowed unauthenticated client write. Development public rules (.write: true) appear active on hiiii-72d78. Deploy database.rules.json before production!'
            : 'RTDB authenticated read and diagnosticsProbe write succeeded.'
          : 'RTDB read succeeded; unauthenticated client write blocked by rules.',
      });
    } catch (err) {
      setRtdbDiag({
        readOk: false,
        writeOk: false,
        publicWriteWarning: false,
        detail: err instanceof Error ? err.message : 'RTDB client access denied or unreachable.',
      });
    }

    // 3. Firestore Read Probe
    try {
      const uid = profile?.uid || 'diag_probe';
      await getDoc(doc(firestoreDb, 'users', uid));
      setFirestoreDiag({
        readOk: true,
        detail: 'Cloud Firestore document read succeeded.',
      });
    } catch (err) {
      setFirestoreDiag({
        readOk: false,
        detail:
          err instanceof Error
            ? `Firestore client read returned: ${err.message}. Deploy firestore.rules via Firebase CLI.`
            : 'Firestore client read failed.',
      });
    } finally {
      setProbing(false);
    }
  }, [profile?.uid, authMode]);

  useEffect(() => {
    void runFullDiagnostics();
  }, [runFullDiagnostics]);

  const diagnosticReportObject = {
    generatedAt: new Date().toISOString(),
    firebaseAppInitialized: !firebaseInitError,
    firebaseProjectId: 'hiiii-72d78',
    authMode,
    sellerRole: profile?.role || 'none',
    rtdbClientProbe: rtdbDiag,
    firestoreClientProbe: firestoreDiag,
    backendHealth,
    gmailMonitor: {
      hasProvisionedCredential: gmailState?.hasProvisionedCredential || false,
      credentialStorageMode: gmailState?.credentialStorageMode || 'none',
      monitoringEnabled: gmailState?.monitoringEnabled || false,
      lastScanAt: gmailState?.lastScanAt || null,
      lastSuccessfulConnectionAt: gmailState?.lastSuccessfulConnectionAt || null,
      lastErrorCode: gmailState?.lastErrorCode || null,
    },
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnosticReportObject, null, 2));
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleAdminBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setBootstrapping(true);
    setBootstrapMsg(null);
    try {
      await apiRequest('/api/admin/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ bootstrapConfirmation: bootstrapText.trim() }),
      });
      await refreshSellerData();
      setBootstrapMsg('Account elevated to server-verified admin role.');
      setBootstrapText('');
    } catch (err) {
      setBootstrapMsg(err instanceof Error ? err.message : 'Bootstrap failed.');
    } finally {
      setBootstrapping(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#171717] font-display">
            System & Security Diagnostics
          </h1>
          <p className="mt-0.5 text-xs text-[#666666]">
            Live verification of Firebase SDK, RTDB, Firestore, Backend API, Secret Vault, and Gmail Worker.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={runFullDiagnostics}
            disabled={probing}
            className="px-3.5 py-2 text-xs font-medium bg-white text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
            <span>Re-run Probes</span>
          </button>
          <button
            type="button"
            onClick={handleCopyReport}
            className="px-3.5 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] inline-flex items-center gap-1.5 cursor-pointer"
          >
            {copiedReport ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedReport ? 'Copied JSON' : 'Copy Diagnostic Report'}</span>
          </button>
        </div>
      </div>

      {rtdbDiag?.publicWriteWarning && (
        <div className="p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl text-xs text-[#92400E] space-y-1">
          <div className="font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Development Public RTDB Rules Detected</span>
          </div>
          <p className="leading-relaxed">
            {rtdbDiag.detail} Broad rules like <span className="font-mono">".write": true</span> allow any unauthenticated visitor to overwrite live signals. Deploy the repository’s <span className="font-mono">database.rules.json</span> using <span className="font-mono">firebase deploy --only database</span> before production use.
          </p>
        </div>
      )}

      {/* Diagnostic Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-2">
          <div className="font-semibold text-[#171717]">1. Firebase App Initialization</div>
          <div className="font-mono text-[#166534]">
            {firebaseInitError ? `Failed: ${firebaseInitError}` : 'OK (Project: hiiii-72d78)'}
          </div>
          <p className="text-[#666666]">
            Centralized initialization in <span className="font-mono">src/lib/firebase.ts</span> without requiring a manual <span className="font-mono">.env</span> file.
          </p>
        </div>

        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-2">
          <div className="font-semibold text-[#171717]">2. Authentication State</div>
          <div className="font-mono text-[#171717]">
            Mode: {authMode} · Role: {profile?.role}
          </div>
          <p className="text-[#666666]">
            {authMode === 'firebase'
              ? 'Signed in with live Firebase Auth ID token.'
              : 'Using Local Development Session token. Enable Email/Password provider in Firebase Console for production Firebase Auth.'}
          </p>
        </div>

        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-2">
          <div className="font-semibold text-[#171717]">3. Realtime Database (RTDB)</div>
          <div className="font-mono text-[#171717]">
            Client Read: {rtdbDiag?.readOk ? 'PASS' : 'WARN'} · Client Write:{' '}
            {rtdbDiag?.writeOk ? 'OPEN' : 'RESTRICTED'}
          </div>
          <p className="text-[#666666]">{rtdbDiag?.detail}</p>
        </div>

        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-2">
          <div className="font-semibold text-[#171717]">4. Cloud Firestore Probe</div>
          <div className="font-mono text-[#171717]">
            Client Read: {firestoreDiag?.readOk ? 'PASS' : 'WARN'}
          </div>
          <p className="text-[#666666]">{firestoreDiag?.detail}</p>
        </div>

        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-2">
          <div className="font-semibold text-[#171717]">5. Backend & Secret Provisioning</div>
          <div className="font-mono text-[#171717]">
            Vault: {gmailState?.credentialStorageMode || 'none'}
          </div>
          <p className="text-[#666666]">
            App Passwords are encrypted with AES-256-GCM in server RAM. Set <span className="font-mono">GOOGLE_CLOUD_SECRET_MANAGER_ENABLED=true</span> when deploying to Cloud Run for cross-restart persistence.
          </p>
        </div>

        <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-2">
          <div className="font-semibold text-[#171717]">6. Gmail Worker & Last Scan</div>
          <div className="font-mono text-[#171717]">
            Worker: {gmailState?.monitoringEnabled ? 'ACTIVE' : 'IDLE'}
          </div>
          <p className="text-[#666666]">
            Last Scan: {gmailState?.lastScanAt || 'None'} · Last Error:{' '}
            {gmailState?.lastErrorCode || 'None'}
          </p>
        </div>
      </div>

      {/* Documented Admin Bootstrap Procedure */}
      <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4 text-xs">
        <div className="flex items-center gap-2 font-bold text-sm text-[#171717] font-display">
          <Terminal className="w-4 h-4" />
          <span>Administrator Role Bootstrap Procedure</span>
        </div>
        <p className="text-[#666666] leading-relaxed">
          FamX Pay does not use an insecure default administrator password. The first seller account registered on the server is assigned the <span className="font-mono">admin</span> role automatically, or an authenticated developer can elevate their session by entering <span className="font-mono">CONFIRM_ADMIN_BOOTSTRAP</span> below (all elevations are recorded in <span className="font-mono">/admin/audit-logs</span>).
        </p>

        {profile?.role === 'admin' ? (
          <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-[#166534] font-medium">
            Your account ({profile.email}) already holds the server-verified administrator role.
          </div>
        ) : (
          <form onSubmit={handleAdminBootstrap} className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={bootstrapText}
              onChange={(e) => setBootstrapText(e.target.value)}
              placeholder="Type CONFIRM_ADMIN_BOOTSTRAP"
              className="px-3.5 py-2 font-mono bg-[#F7F6F2] border border-[#E5E2DC] rounded-lg text-[#171717]"
            />
            <button
              type="submit"
              disabled={bootstrapping}
              className="px-4 py-2 bg-[#242424] text-white font-medium rounded-lg hover:bg-[#171717] cursor-pointer"
            >
              {bootstrapping ? 'Elevating...' : 'Elevate to Administrator'}
            </button>
          </form>
        )}

        {bootstrapMsg && <p className="font-mono text-[#171717]">{bootstrapMsg}</p>}
      </div>
    </div>
  );
}
