import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import {
  Home, Heart, Building2, Phone, MessageSquare, Star, Shield, Award,
  ShieldCheck, CalendarCheck, FileText, Car, ChevronDown, MapPin, Check,
} from 'lucide-react';
import { analytics } from '@/utils/analytics';
import { trackFunnelEvent } from '@/lib/funnelPixel';
import { useServiceCatalog } from '@/hooks/useServiceCatalog';
import { getServicePrice } from '@/services/pricing/pricingService';
import ReasonPicker from '@/components/booking/ReasonPicker';
import { VISIT_REASONS, VisitReasonId, getVisitReason } from '@/lib/visitReason';
import { TRUST_CLAIMS, HERO_TRUST_ROW, SAMPLE_HANDLING_POINTS } from '@/content/trustClaims';

/**
 * META ADS LANDING PAGE — /mobile-lab-draws (alias /lp/mobile)
 *
 * Why this page exists (30-day funnel, 2026-09): the ad sets sent people
 * straight into /book-now. 1,045 Facebook/Instagram sessions opened the
 * booking wizard and 7 advanced past "Visit Type" (0.7%), against 27% for
 * direct and 71% for Google organic. Those visitors sat on the page a median
 * ~17 s, never tapped a card, and closed the in-app browser. The wizard's
 * first screen asks a cold ad click to pick between seven priced cards it
 * has no context for.
 *
 * This page makes the offer first and turns step 1 into a three-card choice
 * with plain language. The chosen card deep-links to
 * `/book-now?visit=<id>` so BookingFlow starts one step in.
 *
 * Constraints honoured here:
 *  - Mobile-first; renders inside the Instagram/Facebook in-app WebView
 *    (no popups, no window.open, no third-party storage, nothing heavy before
 *    first interaction — Stripe/Maps are only loaded by the booking flow).
 *  - Same analytics session id as the booking flow (shared `analytics`
 *    singleton; navigation is in-SPA so sessionStorage carries over).
 *  - Meta Pixel through the existing funnelPixel helper (no new pixel id).
 *  - noindex — paid landing page, not an SEO surface. Deliberately absent
 *    from STATIC_ROUTES and public/sitemap.xml.
 */

const PHONE_DISPLAY = '(941) 527-9169';
const PHONE_TEL = '+19415279169';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'] as const;

type GuaranteeItem = { icon: React.ComponentType<{ className?: string }>; text: string; wide?: boolean };

type VisitOption = {
  id: 'mobile' | 'senior' | 'in-office';
  title: string;
  subtitle: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  popular?: boolean;
};

// Real visit types + ids from VisitTypeSelector / pricingService.
// Prices come from getServicePrice() (DB-hydrated via useServiceCatalog),
// never typed here, so an admin price edit flows to this page too.
const VISIT_OPTIONS: VisitOption[] = [
  {
    id: 'mobile',
    title: 'At my home or office',
    subtitle: 'We come to you',
    detail: 'A licensed phlebotomist visits your home, office, or hotel anywhere in our Central Florida service area.',
    icon: Home,
    popular: true,
  },
  {
    id: 'senior',
    title: "I'm 65 or older",
    subtitle: 'Discounted home visit',
    detail: 'Same at-home visit at a reduced rate for patients 65 and up.',
    icon: Heart,
  },
  {
    id: 'in-office',
    title: "I'll come to your office",
    subtitle: 'Walk-in draw, lowest price',
    detail: 'Have your labs drawn at our partner office in Orlando. No travel fee.',
    icon: Building2,
  },
];

// slug → /locations/<slug> (src/data/locations.ts). No slug = no city page yet.
const SERVICE_AREAS: { name: string; slug?: string }[] = [
  { name: 'Orlando', slug: 'orlando' }, { name: 'Windermere', slug: 'windermere' },
  { name: 'Winter Garden' }, { name: 'Dr. Phillips', slug: 'doctor-phillips' },
  { name: 'Bay Hill', slug: 'bay-hill' }, { name: 'Golden Oak', slug: 'golden-oak' },
  { name: 'Lake Mary', slug: 'lake-mary' }, { name: 'Heathrow', slug: 'heathrow-golf' },
  { name: 'Winter Park', slug: 'winter-park' }, { name: 'Lake Nona', slug: 'lake-nona' },
  { name: 'Celebration', slug: 'celebration' }, { name: 'Kissimmee', slug: 'kissimmee' },
  { name: 'Altamonte Springs', slug: 'altamonte-springs' }, { name: 'Sanford', slug: 'sanford' },
  { name: 'Oviedo', slug: 'oviedo' }, { name: 'Maitland', slug: 'maitland' },
  { name: 'Clermont', slug: 'clermont' },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Do I need to fast?',
    a: 'Only if your doctor or the test requires it (lipid panels and glucose tests often do). Early-morning fasting appointments are available from 6:00 AM so you can be done before breakfast.',
  },
  {
    q: 'Is this covered by insurance?',
    a: 'Many insurance plans cover the lab tests themselves — the lab bills your insurance as usual. The visit fee is an out-of-pocket convenience fee; we can provide a superbill if you want to submit it for reimbursement.',
  },
  {
    q: 'How long does the visit take?',
    a: 'We book a one-hour arrival window and most draws are finished well within it. Same-day appointments are available when a phlebotomist is open; most visits are scheduled within 24 hours.',
  },
  {
    q: 'What should I have ready?',
    a: "Your lab order from your doctor (paper or a photo is fine), a photo ID, and your insurance card if the lab will bill insurance. If you don't have an order yet, we can help connect you with a physician who can write one.",
  },
  {
    q: 'Where do my results go?',
    a: `${TRUST_CLAIMS.deliveredTo} Results are reported to the doctor who ordered them, just like a draw done at the lab. ${TRUST_CLAIMS.doctorNotified}`,
  },
  {
    q: "Can't find your results?",
    a: `${TRUST_CLAIMS.resultsRetrieval} ${TRUST_CLAIMS.patientNotified} Call or text ${PHONE_DISPLAY} and we'll track them down.`,
  },
];

function isInAppBrowser(): boolean {
  try {
    return /FBAN|FBAV|FB_IAB|Instagram/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}

/** Incoming ad params we forward to the booking URL so attribution survives the hop. */
function readForwardedParams(): URLSearchParams {
  const out = new URLSearchParams();
  try {
    const current = new URL(window.location.href).searchParams;
    for (const k of UTM_KEYS) {
      const v = current.get(k);
      if (v) out.set(k, v);
    }
  } catch {
    /* no window */
  }
  return out;
}

function buildBookingUrl(visitType: string, forwarded: URLSearchParams, reason: VisitReasonId | null): string {
  const qs = new URLSearchParams(forwarded);
  qs.set('visit', visitType);
  qs.set('source', 'meta_lp');
  if (reason) qs.set('reason', reason);
  return `/book-now?${qs.toString()}`;
}

const MobileLabDrawsLanding: React.FC = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<VisitOption['id']>('mobile');
  const [reason, setReason] = useState<VisitReasonId | null>(() => getVisitReason());
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const optionsRef = useRef<HTMLDivElement>(null);
  const forwarded = useMemo(() => readForwardedParams(), []);
  // Hydrates DB prices into pricingService so getServicePrice() is current.
  const { services: catalog } = useServiceCatalog();

  const price = (id: string) => {
    void catalog; // re-render once the catalog (and hydrated prices) arrive
    return getServicePrice(id, 'none');
  };

  const utmData = useMemo(() => {
    const d: Record<string, string> = {};
    forwarded.forEach((v, k) => { d[k] = v; });
    return d;
  }, [forwarded]);

  useEffect(() => {
    analytics.trackFunnelStage('lp_viewed', 0, {
      page: 'mobile-lab-draws',
      inAppBrowser: isInAppBrowser(),
      referrer: typeof document !== 'undefined' ? document.referrer || null : null,
      ...utmData,
    });
    // Own dedupe key so the booking flow's ViewContent (keyed by name) still
    // fires with the chosen visit type once the patient gets there.
    trackFunnelEvent('ViewContent', {
      content_category: 'Mobile Phlebotomy',
      content_name: 'landing_mobile_lab_draws',
    }, 'ViewContent:lp');
  }, [utmData]);

  const selectOption = (id: VisitOption['id']) => {
    setSelected(id);
    analytics.trackFunnelStage('lp_option_selected', 1, { visitType: id, ...utmData });
  };

  const selectReason = (next: VisitReasonId | null) => {
    setReason(next);
    analytics.trackFunnelStage('lp_reason_selected', 1, { reason: next, ...utmData });
  };

  const goToBooking = (cta: 'card' | 'hero' | 'sticky', visitType: VisitOption['id'] = selected) => {
    analytics.trackFunnelStage('lp_cta_clicked', 2, { visitType, cta, reason, ...utmData });
    navigate(buildBookingUrl(visitType, forwarded, reason));
  };

  const trackContact = (channel: 'call' | 'text') => {
    analytics.trackFunnelStage('lp_cta_clicked', 2, { visitType: selected, cta: channel, ...utmData });
    // A call/text is a real contact handoff — the only Lead this page sends.
    // The Book CTA intentionally does NOT fire Lead: the booking flow fires
    // it once it actually holds an email or phone number.
    trackFunnelEvent('Lead', {
      content_category: 'Mobile Phlebotomy',
      content_name: `lp_${channel}`,
    }, 'Lead:lp_contact');
  };

  const scrollToOptions = () => {
    optionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Helmet>
        <title>Blood Draw at Home — Orlando & Central Florida | ConveLabs</title>
        <meta name="description" content="A licensed phlebotomist draws your labs at home, at your office, or at our Orlando partner office. Same-day appointments across Central Florida." />
        <meta name="robots" content="noindex,nofollow" />
        <link rel="canonical" href="https://www.convelabs.com/mobile-lab-draws" />
      </Helmet>

      <div className="min-h-[100dvh] bg-brand-cream text-brand-charcoal pb-24">
        {/* Slim top bar — no nav, no auth; the page has one job. */}
        <header className="bg-white/90 backdrop-blur-sm border-b border-brand-cream-warm">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2" aria-label="ConveLabs home">
              <svg viewBox="0 0 24 32" className="h-5 w-auto" aria-hidden="true">
                <path d="M12 1C12 1 3 12 3 20a9 9 0 0 0 18 0C21 12 12 1 12 1Z" fill="#B91C1C" />
              </svg>
              <span className="font-playfair text-xl font-semibold tracking-tight text-conve-black">
                Conve<span className="text-conve-red">Labs</span>
              </span>
            </Link>
            <a
              href={`tel:${PHONE_TEL}`}
              onClick={() => trackContact('call')}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 text-sm font-semibold text-conve-black"
            >
              <Phone className="h-4 w-4 text-conve-red" />
              <span>{PHONE_DISPLAY}</span>
            </a>
          </div>
        </header>

        <main>
          {/* HERO — offer + the step-1 decision, above the fold on a phone */}
          <section className="max-w-3xl mx-auto px-4 pt-7 pb-6">
            <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-brand-gold-deep mb-3">
              Mobile phlebotomy · Orlando &amp; Central Florida
            </p>
            <h1 className="font-playfair text-[2rem] leading-[1.1] sm:text-5xl font-medium tracking-tight text-conve-black">
              A licensed phlebotomist draws your labs <span className="italic text-brand-gold-deep">at home.</span>
            </h1>
            <p className="mt-3 text-base sm:text-lg text-brand-gray-warm max-w-xl">
              {reason ? (
                <>
                  <span className="text-conve-black font-medium">{VISIT_REASONS[reason].echo}</span>{' '}
                  Anywhere in Orlando and Central Florida, same-day when available, and your results still go to your doctor.
                </>
              ) : (
                <>Skip the waiting room. We come to you anywhere in Orlando and Central Florida, same-day when available, and your results still go to your doctor.</>
              )}
            </p>

            {/* Compact owner-claims row: draw time · collections count · labs we deliver to (trustClaims.ts) */}
            <ul className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-conve-black" aria-label="Key facts">
              {HERO_TRUST_ROW.map((item, i) => (
                <li key={item} className="inline-flex items-center gap-2">
                  {i > 0 && <span className="text-brand-gold-deep" aria-hidden="true">&middot;</span>}
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-brand-gray-warm">
              <span className="inline-flex items-center gap-1">
                <span className="flex gap-px" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map(i => <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />)}
                </span>
                <span className="font-semibold text-conve-black">5.0</span>
                <span>(164 reviews)</span>
              </span>
              <span className="inline-flex items-center gap-1"><Shield className="h-3.5 w-3.5 text-conve-red" /> HIPAA compliant</span>
              <span className="inline-flex items-center gap-1"><Award className="h-3.5 w-3.5 text-conve-red" /> Licensed &amp; insured</span>
            </div>

            {/* STEP 1, answered here */}
            <div ref={optionsRef} className="mt-7 scroll-mt-4">
              <ReasonPicker className="mb-6" onSelect={selectReason} />

              <h2 className="text-lg font-semibold text-conve-black">Where should we draw your labs?</h2>
              <p className="text-sm text-brand-gray-warm mt-0.5">Pick one — you choose a time next.</p>

              <div className="mt-3 grid grid-cols-1 gap-3" role="radiogroup" aria-label="Visit type">
                {VISIT_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = selected === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => selectOption(opt.id)}
                      className={`relative w-full text-left rounded-2xl border-2 p-4 min-h-[88px] transition-colors active:scale-[0.99] ${
                        isSelected
                          ? 'border-conve-red bg-white shadow-md'
                          : 'border-brand-cream-warm bg-white/80'
                      }`}
                    >
                      {opt.popular && (
                        <span className="absolute -top-2.5 left-4 bg-conve-red text-white text-[10px] font-semibold tracking-wide uppercase px-2.5 py-0.5 rounded-full">
                          Most popular
                        </span>
                      )}
                      <div className="flex items-start gap-3">
                        <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-conve-red/10' : 'bg-brand-cream'}`}>
                          <Icon className={`h-5 w-5 ${isSelected ? 'text-conve-red' : 'text-brand-gray-warm'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-semibold text-base text-conve-black">{opt.title}</span>
                            <span className="text-conve-red font-bold text-lg whitespace-nowrap">
                              ${price(opt.id)}<span className="text-[11px] font-normal text-brand-gray-warm"> / visit</span>
                            </span>
                          </div>
                          <p className="text-xs text-brand-gray-warm">{opt.subtitle}</p>
                          <p className="text-xs text-brand-gray-warm mt-1 leading-relaxed">{opt.detail}</p>
                        </div>
                        <span
                          aria-hidden="true"
                          className={`mt-1 h-6 w-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'border-conve-red bg-conve-red' : 'border-brand-cream-warm bg-white'
                          }`}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => goToBooking('hero')}
                className="mt-4 w-full min-h-[56px] rounded-xl bg-conve-red hover:bg-conve-red-dark text-white text-base font-semibold tracking-wide shadow-luxury-red transition-colors"
              >
                Book my visit — pick a time
              </button>
              <p className="mt-2 text-center text-xs text-brand-gray-warm">
                No account needed · Pay securely at checkout · Cancel or reschedule anytime
              </p>
              <p className="mt-3 text-center text-xs text-brand-gray-warm">
                Have a specialty kit (DUTCH, Genova, GI-MAP)?{' '}
                <button
                  type="button"
                  onClick={() => {
                    analytics.trackFunnelStage('lp_cta_clicked', 2, { visitType: 'specialty-kit', cta: 'kit_link', reason, ...utmData });
                    navigate(buildBookingUrl('specialty-kit', forwarded, reason));
                  }}
                  className="underline font-medium text-conve-black"
                >
                  Book kit collection (${price('specialty-kit')})
                </button>
              </p>
            </div>
          </section>

          {/* SAMPLE HANDLING — owner claims (src/content/trustClaims.ts). Plain
              lab names only: we deliver to them; no logos, no partnership. */}
          <section className="bg-white border-y border-brand-cream-warm">
            <div className="max-w-3xl mx-auto px-4 py-7">
              <h2 className="font-playfair text-2xl font-medium text-conve-black">Your samples, handled end to end</h2>
              <p className="text-sm text-brand-gray-warm mt-1">{TRUST_CLAIMS.deliveredTo}</p>
              <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SAMPLE_HANDLING_POINTS.map((p) => (
                  <li key={p.title} className="rounded-xl bg-brand-cream p-3.5">
                    <p className="font-semibold text-sm text-conve-black">{p.title}</p>
                    <p className="text-xs text-brand-gray-warm mt-1 leading-relaxed">{p.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* TRUST — claims already made on the site */}
          <section className="bg-brand-cream-soft border-b border-brand-cream-warm">
            <div className="max-w-3xl mx-auto px-4 py-6">
              <blockquote className="rounded-xl bg-gradient-to-br from-gray-900 to-gray-800 text-white p-4">
                <p className="text-sm font-semibold leading-snug">"Better than what I got in the NFL."</p>
                <footer className="text-xs text-gray-300 mt-1">— Deiontrez Mount, NFL Linebacker (Titans · Colts · Broncos)</footer>
              </blockquote>
              <ul className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {([
                  { icon: ShieldCheck, text: 'On-time or your visit is free' },
                  { icon: Award, text: 'Licensed, certified, background-checked phlebotomists' },
                  { icon: FileText, text: 'Results go to your doctor and lab, as usual' },
                  { icon: Shield, text: 'HIPAA-compliant handling of your order and sample' },
                  { icon: ShieldCheck, text: `${TRUST_CLAIMS.sampleTracked}. ${TRUST_CLAIMS.lostSamplePromise}`, wide: true },
                ] as GuaranteeItem[]).map(({ icon: I, text, wide }) => (
                  <li key={text} className={`flex items-start gap-2 ${wide ? 'col-span-2' : ''}`}>
                    <I className="h-4 w-4 text-conve-red flex-shrink-0 mt-0.5" />
                    <span className="text-brand-charcoal leading-snug">{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* HOW IT WORKS */}
          <section className="max-w-3xl mx-auto px-4 py-8">
            <h2 className="font-playfair text-2xl font-medium text-conve-black">How it works</h2>
            <ol className="mt-4 space-y-4">
              {[
                { icon: CalendarCheck, title: 'Pick a time', body: 'Choose a day and a one-hour window. Same-day slots when available; fasting appointments from 6:00 AM.' },
                { icon: FileText, title: 'Add your lab order', body: "Upload a photo of the order from your doctor during booking, or text it to us. Don't have one? We can help connect you with a physician." },
                { icon: Car, title: 'We come to you', body: 'A licensed phlebotomist arrives in your window, draws your labs, and delivers the sample to the lab. Results go to your doctor.' },
              ].map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <div className="h-9 w-9 rounded-full bg-conve-red text-white flex items-center justify-center font-semibold text-sm flex-shrink-0">{i + 1}</div>
                  <div>
                    <h3 className="font-semibold text-conve-black">{s.title}</h3>
                    <p className="text-sm text-brand-gray-warm mt-0.5 leading-relaxed">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-6 rounded-xl bg-white border border-brand-cream-warm p-4 text-sm">
              <p className="font-semibold text-conve-black">Insurance and lab orders</p>
              <p className="text-brand-gray-warm mt-1 leading-relaxed">
                Many plans cover the lab tests themselves. The ConveLabs visit fee is out-of-pocket (members pay less), and we can give you a superbill for reimbursement. Virtually any test your doctor orders — CBC, metabolic, lipid, thyroid, hormone panels and more — can be drawn at home.
              </p>
            </div>
          </section>

          {/* SERVICE AREA */}
          <section className="bg-white border-y border-brand-cream-warm">
            <div className="max-w-3xl mx-auto px-4 py-8">
              <h2 className="font-playfair text-2xl font-medium text-conve-black flex items-center gap-2">
                <MapPin className="h-5 w-5 text-conve-red" /> Where we go
              </h2>
              <p className="text-sm text-brand-gray-warm mt-1">Orlando and the surrounding Central Florida communities, including:</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {SERVICE_AREAS.map(city => (
                  <li key={city.name}>
                    {city.slug ? (
                      <Link
                        to={`/locations/${city.slug}`}
                        className="inline-block px-3 py-1.5 rounded-full bg-brand-cream text-sm text-brand-charcoal underline-offset-2 hover:bg-brand-cream-warm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-conve-red/40"
                      >
                        {city.name}
                      </Link>
                    ) : (
                      <span className="inline-block px-3 py-1.5 rounded-full bg-brand-cream text-sm text-brand-charcoal">{city.name}</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-brand-gray-warm mt-3">Outside the core area (Lake, Volusia, Polk counties)? We still come — a travel fee is shown before you pay.</p>
            </div>
          </section>

          {/* FAQ */}
          <section className="max-w-3xl mx-auto px-4 py-8">
            <h2 className="font-playfair text-2xl font-medium text-conve-black">Questions, answered</h2>
            <div className="mt-3 divide-y divide-brand-cream-warm rounded-xl bg-white border border-brand-cream-warm">
              {FAQS.map((f, i) => {
                const open = openFaq === i;
                return (
                  <div key={f.q}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenFaq(open ? null : i)}
                      className="w-full flex items-center justify-between gap-3 text-left px-4 min-h-[52px] py-3 font-medium text-conve-black"
                    >
                      <span>{f.q}</span>
                      <ChevronDown className={`h-4 w-4 flex-shrink-0 text-brand-gray-warm transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && <p className="px-4 pb-4 text-sm text-brand-gray-warm leading-relaxed">{f.a}</p>}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => { scrollToOptions(); }}
              className="mt-6 w-full min-h-[52px] rounded-xl border-2 border-conve-red text-conve-red font-semibold"
            >
              Choose my visit type
            </button>
          </section>

          <footer className="max-w-3xl mx-auto px-4 pb-6 text-xs text-brand-gray-warm">
            <p>ConveLabs · Mobile phlebotomy, Central Florida · <a href={`tel:${PHONE_TEL}`} className="underline">{PHONE_DISPLAY}</a> · <a href="mailto:info@convelabs.com" className="underline">info@convelabs.com</a></p>
            <p className="mt-1">
              <Link to="/privacy" className="underline">Privacy</Link> · <Link to="/terms" className="underline">Terms</Link> · <Link to="/guarantee" className="underline">Our guarantee</Link>
            </p>
          </footer>
        </main>

        {/* STICKY BOTTOM BAR — thumb reach in the in-app browser */}
        <div
          className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-sm border-t border-brand-cream-warm"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="max-w-3xl mx-auto px-3 py-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToBooking('sticky')}
              className="flex-1 min-h-[48px] rounded-xl bg-conve-red hover:bg-conve-red-dark text-white font-semibold text-sm"
            >
              Book my visit
            </button>
            <a
              href={`tel:${PHONE_TEL}`}
              onClick={() => trackContact('call')}
              aria-label="Call ConveLabs"
              className="min-h-[48px] min-w-[48px] px-3 rounded-xl border-2 border-brand-cream-warm bg-white inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-conve-black"
            >
              <Phone className="h-4 w-4 text-conve-red" /> Call
            </a>
            <a
              href={`sms:${PHONE_TEL}`}
              onClick={() => trackContact('text')}
              aria-label="Text ConveLabs"
              className="min-h-[48px] min-w-[48px] px-3 rounded-xl border-2 border-brand-cream-warm bg-white inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-conve-black"
            >
              <MessageSquare className="h-4 w-4 text-conve-red" /> Text
            </a>
          </div>
        </div>
      </div>
    </>
  );
};

export default MobileLabDrawsLanding;
