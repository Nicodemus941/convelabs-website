/**
 * /book/resume/:token — the landing page behind every abandoned-booking
 * nudge. Resolves the token, tells the patient whether their original time
 * is still open (and offers the next ones if not), then hands the draft to
 * BookingFlow via sessionStorage and sends them to /book-now.
 *
 * Expired / already-booked / unknown tokens get a plain explanation and a
 * way forward, never a dead end.
 */
import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, CalendarCheck, CalendarX, CheckCircle, Phone, ArrowRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/home/Header';
import { resolveBookingDraft, stashResume, TRUST_CLAIMS, type ResolvedDraft } from '@/lib/bookingDraft';
import { analytics } from '@/utils/analytics';

const SUPPORT_TEL = 'tel:+19415279169';

const whenLabel = (date: string | null | undefined, time: string | null | undefined): string | null => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const day = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return time && /\d/.test(time) ? `${day} at ${time}` : day;
};

const BookResume: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<ResolvedDraft | null>(null);
  const [picked, setPicked] = useState<{ date: string; time: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await resolveBookingDraft(token);
      if (!alive) return;
      setResult(r);
      analytics.trackFunnelStage('booking_resume_opened', 1, {
        ok: r.ok, expired: !!r.expired, booked: !!r.booked, slotAvailable: !!r.slot?.available, step: r.draft?.step_key || null,
      });
    })();
    return () => { alive = false; };
  }, [token]);

  const go = (opts: { override?: { date: string; time: string } | null; pickNewTime?: boolean }) => {
    if (!result?.draft) return;
    stashResume({ draft: result.draft, override: opts.override || null, pickNewTime: !!opts.pickNewTime });
    navigate('/book-now?source=resume', { replace: true });
  };

  const first = (result?.draft?.first_name || '').trim();
  const requested = result?.slot?.requested ? whenLabel(result.slot.requested.date, result.slot.requested.time) : null;

  return (
    <>
      <Helmet>
        <title>Finish your booking | ConveLabs</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Header />
      <div className="min-h-[100dvh] bg-gradient-to-b from-gray-50/50 to-background">
        <div className="container mx-auto px-4 py-10 md:py-16 max-w-lg">

          {!result && (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-conve-red" />
              <p className="text-muted-foreground">Finding your booking…</p>
            </div>
          )}

          {result && !result.ok && (
            <div className="bg-white border rounded-2xl shadow-sm p-6 md:p-8 text-center space-y-4">
              {result.booked ? (
                <>
                  <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto" />
                  <h1 className="font-playfair text-2xl md:text-3xl text-conve-black">You're already booked</h1>
                  <p className="text-muted-foreground">This link belonged to a booking you have since completed. Your confirmation is in your inbox.</p>
                </>
              ) : result.expired ? (
                <>
                  <Clock className="h-12 w-12 text-amber-500 mx-auto" />
                  <h1 className="font-playfair text-2xl md:text-3xl text-conve-black">That link has expired</h1>
                  <p className="text-muted-foreground">Resume links last 7 days. Booking fresh takes about two minutes, and same-day visits are often available.</p>
                </>
              ) : (
                <>
                  <CalendarX className="h-12 w-12 text-gray-400 mx-auto" />
                  <h1 className="font-playfair text-2xl md:text-3xl text-conve-black">We couldn't find that booking</h1>
                  <p className="text-muted-foreground">The link may be incomplete. You can start a new booking, or call us and we'll book it with you.</p>
                </>
              )}
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button onClick={() => navigate('/book-now?source=resume_fallback')} className="bg-conve-red hover:bg-conve-red-dark text-white rounded-xl">
                  Book a visit <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
                <a href={SUPPORT_TEL} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-border rounded-xl font-medium text-foreground">
                  <Phone className="h-4 w-4" /> (941) 527-9169
                </a>
              </div>
            </div>
          )}

          {result?.ok && result.draft && (
            <div className="bg-white border rounded-2xl shadow-sm p-6 md:p-8 space-y-5">
              <div className="text-center">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <span className="h-px w-8 bg-brand-gold/50" />
                  <p className="text-xs font-medium tracking-[0.24em] uppercase text-brand-gold-deep">Pick up where you left off</p>
                  <span className="h-px w-8 bg-brand-gold/50" />
                </div>
                <h1 className="font-playfair text-2xl md:text-3xl text-conve-black">
                  Welcome back{first ? `, ${first}` : ''}.
                </h1>
                <p className="text-brand-gray-warm mt-2">Your details are saved. {TRUST_CLAIMS.duration}</p>
              </div>

              {result.slot?.available && requested ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
                  <CalendarCheck className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-900 text-sm">Your {requested} time is still open.</p>
                    <p className="text-xs text-emerald-700 mt-0.5">Finish in a minute and it's yours.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                    <CalendarX className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-900 text-sm">
                        {requested ? `Your ${requested} time has been taken.` : 'You hadn\'t picked a time yet.'}
                      </p>
                      <p className="text-xs text-amber-800 mt-0.5">
                        {result.slot?.alternatives?.length ? 'Here are the next open times — tap one to take it.' : 'Pick any open time on the next page.'}
                      </p>
                    </div>
                  </div>
                  {!!result.slot?.alternatives?.length && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {result.slot.alternatives.map(alt => {
                        const active = picked?.date === alt.date && picked?.time === alt.time;
                        return (
                          <button
                            key={`${alt.date}-${alt.time}`}
                            type="button"
                            onClick={() => setPicked({ date: alt.date, time: alt.time })}
                            aria-pressed={active}
                            className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${active ? 'border-conve-red bg-conve-red/5 text-conve-red ring-2 ring-conve-red/20' : 'border-gray-200 bg-white hover:border-conve-red/50'}`}
                          >
                            {alt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2 pt-1">
                {result.slot?.available ? (
                  <Button onClick={() => go({})} className="bg-conve-red hover:bg-conve-red-dark text-white rounded-xl h-12 text-base">
                    Continue booking <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={() => go({ override: picked })}
                      disabled={!picked && !!result.slot?.alternatives?.length}
                      className="bg-conve-red hover:bg-conve-red-dark text-white rounded-xl h-12 text-base"
                    >
                      {picked ? 'Take this time and continue' : result.slot?.alternatives?.length ? 'Choose a time above' : 'Continue booking'}
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Button>
                    <Button variant="outline" onClick={() => go({ pickNewTime: true })} className="rounded-xl h-11">
                      Pick a different time
                    </Button>
                  </>
                )}
              </div>

              <p className="text-[11px] text-center text-muted-foreground">
                Questions? Call or text <a href={SUPPORT_TEL} className="underline">(941) 527-9169</a>. {TRUST_CLAIMS.tracked} {TRUST_CLAIMS.redraw}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default BookResume;
