import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, AlertTriangle, Loader2, Clock, Calendar as CalendarIcon, XCircle, ArrowRight } from 'lucide-react';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';

/**
 * RESCHEDULE RESPONSE PAGE — /reschedule/:token
 *
 * The public-facing landing page patients reach from the apology SMS/email.
 * Shows:
 *   - What went wrong (conflict on their original date/time)
 *   - The $25 apology credit already on their account
 *   - 3 suggested alternative slots (one-tap approval)
 *   - "None of these work — call me" decline option
 *
 * Calls process-reschedule-response edge function on submit.
 * No login required — the token IS the authentication.
 */

interface Alt { date: string; time: string; label: string }

interface TokenState {
  status: string;
  originalDate: string;
  originalTime: string;
  alternatives: Alt[];
  patientName: string | null;
  expired: boolean;
  alreadyProcessed: boolean;
  approvedDate?: string;
  approvedTime?: string;
}

const RescheduleResponse: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<TokenState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAlt, setSelectedAlt] = useState<Alt | null>(null);

  // Fetch token info on mount
  useEffect(() => {
    if (!token) {
      setError('No token provided.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data } = await supabase
          .from('reschedule_tokens' as any)
          .select('*, appointments!inner(patient_name)')
          .eq('token', token)
          .maybeSingle();

        if (!data) {
          setError('This reschedule link is invalid or no longer available.');
          setLoading(false);
          return;
        }

        const row: any = data;
        const expired = new Date(row.expires_at) < new Date();

        setState({
          status: row.status,
          originalDate: row.original_date,
          originalTime: row.original_time,
          alternatives: (row.suggested_alternatives || []) as Alt[],
          patientName: row.appointments?.patient_name || null,
          expired,
          alreadyProcessed: row.status !== 'pending',
          approvedDate: row.approved_date,
          approvedTime: row.approved_time,
        });
      } catch (e: any) {
        setError(e.message || 'Unable to load your reschedule details.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const submit = async (action: 'approve' | 'decline', alt?: Alt) => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('process-reschedule-response', {
        body: {
          token,
          action,
          ...(alt ? { selectedDate: alt.date, selectedTime: alt.time } : {}),
        },
      });

      if (invokeErr) throw new Error(invokeErr.message);
      if (!data?.success) throw new Error(data?.error || 'Something went wrong. Please call us.');

      // Redirect to success page with state
      if (action === 'approve') {
        navigate(`/reschedule/confirmed?date=${encodeURIComponent(alt?.date || '')}&time=${encodeURIComponent(alt?.time || '')}`);
      } else {
        navigate('/reschedule/declined');
      }
    } catch (e: any) {
      setError(e.message || 'Unable to process your response. Please call (941) 527-9169.');
      setSubmitting(false);
    }
  };

  // ── LOADING ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-conve-red" />
        </div>
        <Footer />
      </>
    );
  }

  // ── ERROR / INVALID ─────────────────────────────────────────────
  if (error || !state) {
    return (
      <>
        <Helmet><title>Reschedule | ConveLabs</title></Helmet>
        <Header />
        <div className="container mx-auto px-4 py-16 max-w-xl">
          <Card className="border-red-200">
            <CardContent className="p-8 text-center">
              <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">Link no longer valid</h1>
              <p className="text-muted-foreground mb-6">{error || 'This reschedule link has expired or been used.'}</p>
              <p className="text-sm text-muted-foreground mb-6">If you still need to reschedule, please call us directly.</p>
              <a href="tel:+19415279169">
                <Button className="bg-conve-red hover:bg-conve-red-dark text-white">
                  Call (941) 527-9169
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </>
    );
  }

  // ── EXPIRED ─────────────────────────────────────────────────────
  if (state.expired) {
    return (
      <>
        <Helmet><title>Reschedule Expired | ConveLabs</title></Helmet>
        <Header />
        <div className="container mx-auto px-4 py-16 max-w-xl">
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-8 text-center">
              <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">This link has expired</h1>
              <p className="text-muted-foreground mb-6">Reschedule links are valid for 48 hours. Please call us to set up a new time.</p>
              <a href="tel:+19415279169">
                <Button className="bg-conve-red hover:bg-conve-red-dark text-white">
                  Call (941) 527-9169
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </>
    );
  }

  // ── ALREADY PROCESSED ───────────────────────────────────────────
  if (state.alreadyProcessed) {
    return (
      <>
        <Helmet><title>Reschedule Complete | ConveLabs</title></Helmet>
        <Header />
        <div className="container mx-auto px-4 py-16 max-w-xl">
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="p-8 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">You're all set</h1>
              <p className="text-muted-foreground mb-4">This reschedule has already been processed.</p>
              {state.approvedDate && state.approvedTime && (
                <div className="bg-white border border-gray-200 rounded-lg p-4 my-6 text-left">
                  <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Your appointment</p>
                  <p className="text-lg font-semibold">
                    {new Date(state.approvedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                  <p className="text-conve-red font-semibold">{state.approvedTime}</p>
                </div>
              )}
              <a href="/">
                <Button variant="outline">Back to ConveLabs</Button>
              </a>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </>
    );
  }

  // ── PENDING: show options ───────────────────────────────────────
  const originalDisplay = new Date((state.originalDate || '').slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <>
      <Helmet><title>Reschedule Your Visit | ConveLabs</title></Helmet>
      <Header />
      <div className="container mx-auto px-4 py-10 md:py-16 max-w-2xl">
        {/* Apology header */}
        <div className="text-center mb-8">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-conve-red mb-2">
            Sincerest apologies, {state.patientName?.split(' ')[0] || 'there'}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Let's find a better time.</h1>
          <p className="text-muted-foreground leading-relaxed">
            We caught a scheduling conflict with your appointment on{' '}
            <strong className="text-gray-900">{originalDisplay}</strong> at{' '}
            <strong className="text-gray-900">{state.originalTime}</strong>. One of our team will be serving another patient at that exact time, so we need to move yours.
          </p>
        </div>

        {/* Apology credit */}
        <Card className="mb-6 border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-50/50">
          <CardContent className="p-5 flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <span className="text-xl">💚</span>
            </div>
            <div>
              <p className="font-semibold text-emerald-900">$25 credit added to your account</p>
              <p className="text-sm text-emerald-700 mt-0.5">Applies automatically to this visit or any future one. No action needed.</p>
            </div>
          </CardContent>
        </Card>

        {/* Alternatives */}
        {state.alternatives.length > 0 ? (
          <>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">
              Pick a new time — one tap to confirm
            </h2>
            <div className="space-y-2 mb-6">
              {state.alternatives.map((alt, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedAlt(alt)}
                  disabled={submitting}
                  className={`w-full text-left p-4 md:p-5 rounded-xl border-2 transition-all ${
                    selectedAlt?.time === alt.time && selectedAlt?.date === alt.date
                      ? 'border-conve-red bg-conve-red/5 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                        <CalendarIcon className="h-4 w-4" />
                        <span>{new Date(alt.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      </div>
                      <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                        <Clock className="h-4 w-4 text-conve-red" />
                        {alt.label || alt.time}
                      </div>
                    </div>
                    {selectedAlt?.time === alt.time && selectedAlt?.date === alt.date && (
                      <CheckCircle className="h-5 w-5 text-conve-red" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Confirm button */}
            <Button
              onClick={() => selectedAlt && submit('approve', selectedAlt)}
              disabled={!selectedAlt || submitting}
              size="lg"
              className="w-full h-14 bg-conve-red hover:bg-conve-red-dark text-white font-semibold text-base rounded-xl mb-4"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Confirming…</>
              ) : selectedAlt ? (
                <>Confirm {selectedAlt.label} <ArrowRight className="ml-2 h-4 w-4" /></>
              ) : (
                'Select a time above'
              )}
            </Button>
          </>
        ) : (
          <Card className="mb-6 border-amber-200 bg-amber-50/50">
            <CardContent className="p-5">
              <p className="text-sm text-amber-800">
                The schedule is full for this day. Tap below and we'll call you within the hour to find a time that works.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Decline / call-me option */}
        <div className="text-center pt-4 border-t border-gray-100">
          <button
            onClick={() => submit('decline')}
            disabled={submitting}
            className="text-sm text-gray-500 hover:text-gray-900 underline transition-colors"
          >
            None of these work — please call me
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Or call us directly: <a href="tel:+19415279169" className="text-conve-red">(941) 527-9169</a>
          </p>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default RescheduleResponse;
