/**
 * StripeConnectCard
 *
 * Phleb-dashboard Settings tile that lets the phlebotomist connect their
 * personal Stripe account so a portion of every patient charge auto-routes
 * to them via Stripe Connect (destination charges).
 *
 * State machine:
 *   not_connected   → "Connect your Stripe account" CTA
 *   pending         → "Finish your Stripe setup" (Account Link expired/incomplete)
 *   connected       → "View payouts in Stripe" + auto-rate display
 *
 * Backed by the `connect-onboard` edge function with three actions:
 *   action=onboard   → create/fetch account + return Account Link URL
 *   action=status    → poll Stripe + sync charges/payouts capability flags
 *   action=dashboard → return Express dashboard login link
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, CheckCircle2, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

type Status = 'unknown' | 'not_connected' | 'pending' | 'connected';

const StripeConnectCard: React.FC = () => {
  const [status, setStatus] = useState<Status>('unknown');
  const [isLoading, setIsLoading] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('connect-onboard', {
        body: { action: 'status' },
      });
      if (error) throw error;
      const r = data || {};
      setAccountId(r.account_id || null);
      if (!r.connected && !r.account_id) {
        setStatus('not_connected');
      } else if (r.charges_enabled && r.payouts_enabled) {
        setStatus('connected');
      } else {
        setStatus('pending');
      }
    } catch (err: any) {
      console.warn('[connect-status] failed:', err);
      setStatus('not_connected');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    // Auto-refresh on return from Stripe-hosted onboarding
    if (typeof window !== 'undefined' && window.location.search.includes('connect=success')) {
      // Strip the query param so a manual reload doesn't re-trigger
      const url = new URL(window.location.href);
      url.searchParams.delete('connect');
      window.history.replaceState({}, '', url.pathname + url.search);
      // Give Stripe a beat to propagate capabilities, then refetch
      setTimeout(() => refreshStatus(), 1500);
    }
  }, [refreshStatus]);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('connect-onboard', {
        body: { action: 'onboard' },
      });
      if (error) throw error;
      if (data?.onboarding_url) {
        // Hosted-form redirect — Stripe will return to /dashboard/phlebotomist?connect=success
        window.location.href = data.onboarding_url;
        return;
      }
      toast.error('Could not start Stripe onboarding — please try again.');
    } catch (err: any) {
      console.error('[connect] error:', err);
      toast.error(`Stripe connect failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDashboard = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('connect-onboard', {
        body: { action: 'dashboard' },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
        return;
      }
      toast.error('Could not open Stripe dashboard.');
    } catch (err: any) {
      console.error('[connect-dashboard] error:', err);
      toast.error(`Couldn't open dashboard: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-3">
        <h3 className="font-semibold text-sm text-gray-800 flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Payouts (Stripe Connect)
        </h3>

        {status === 'unknown' && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> Checking your Stripe status…
          </p>
        )}

        {status === 'not_connected' && (
          <>
            <p className="text-xs text-muted-foreground leading-snug">
              Get paid automatically. When a patient pays for a visit you serve, your portion routes to your bank account via Stripe — no manual payouts, no waiting.
            </p>
            <Button
              className="w-full bg-[#635BFF] hover:bg-[#4f46e5] text-white gap-2"
              onClick={handleConnect}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  Connect your Stripe account
                  <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                </>
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Setup takes ~5 min on Stripe (SSN, DOB, bank account). You'll keep your own Stripe dashboard for tax forms (1099-NEC) and bank transfers.
            </p>
          </>
        )}

        {status === 'pending' && (
          <>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Stripe needs more info before payouts can start. Finish your setup to start getting paid automatically.
              </span>
            </p>
            <Button
              className="w-full bg-[#635BFF] hover:bg-[#4f46e5] text-white gap-2"
              onClick={handleConnect}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Finish Stripe setup <ExternalLink className="h-3.5 w-3.5 opacity-80" /></>}
            </Button>
          </>
        )}

        {status === 'connected' && (
          <>
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2 flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>
                <strong>You're all set.</strong> Every patient charge automatically routes your portion (base + 100% of tips) to your bank.
              </span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="text-xs gap-1.5"
                onClick={handleViewDashboard}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><ExternalLink className="h-3.5 w-3.5" /> Stripe Dashboard</>}
              </Button>
              <Button
                variant="outline"
                className="text-xs"
                onClick={refreshStatus}
                disabled={isLoading}
              >
                Refresh
              </Button>
            </div>
            {accountId && (
              <p className="text-[10px] text-muted-foreground font-mono">acct: {accountId.slice(0, 16)}…</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default StripeConnectCard;
