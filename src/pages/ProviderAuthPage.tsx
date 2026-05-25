/**
 * ProviderAuthPage — claims a magic-link token, stores it in sessionStorage,
 * redirects to /provider/dashboard. Same UX pattern as the patient-side
 * appt/:token/upload-order claim. No password, no signup, no auth wall.
 *
 * Token lives in sessionStorage so it survives navigation within the tab
 * but doesn't persist after browser close — protects against stolen-cookie
 * lifetime access. Session also expires server-side 24h after first claim.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://yluyonhrxxtyuiyrdixl.supabase.co';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

const ProviderAuthPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating');
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No token provided in link.');
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/validate-provider-login-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify({ token }),
        });
        const j = await r.json();
        if (!r.ok || !j?.ok) {
          setStatus('error');
          setError(j?.error || `Token validation failed (${r.status})`);
          return;
        }
        // Store in sessionStorage (not localStorage — closes on tab close)
        sessionStorage.setItem('convelabs_provider_token', token);
        sessionStorage.setItem('convelabs_provider_org', JSON.stringify(j.organization || {}));
        setOrgName(j.organization?.name || 'your practice');
        setStatus('success');
        setTimeout(() => navigate('/provider/dashboard'), 900);
      } catch (e: any) {
        setStatus('error');
        setError(e?.message || 'Network error');
      }
    })();
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-white p-4">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl shadow-sm p-8 text-center">
        {status === 'validating' && (
          <>
            <Loader2 className="h-10 w-10 mx-auto text-[#B91C1C] animate-spin mb-3" />
            <h1 className="text-lg font-semibold text-gray-900">Logging you in…</h1>
            <p className="text-sm text-gray-500 mt-1">Verifying your provider access link.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600 mb-3" />
            <h1 className="text-lg font-semibold text-gray-900">Welcome, {orgName}.</h1>
            <p className="text-sm text-gray-500 mt-1">Loading your dashboard…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertTriangle className="h-10 w-10 mx-auto text-amber-600 mb-3" />
            <h1 className="text-lg font-semibold text-gray-900">Link couldn't be verified</h1>
            <p className="text-sm text-gray-600 mt-2">{error}</p>
            <p className="text-xs text-gray-500 mt-4">If your access link has expired, reply to the email we sent or call <a href="tel:+19415279169" className="text-[#B91C1C] font-semibold">(941) 527-9169</a> and we'll send a fresh one.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default ProviderAuthPage;
