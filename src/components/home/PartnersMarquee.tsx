import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2 } from 'lucide-react';

/**
 * PartnersMarquee — "organizations we serve" scrolling marquee for the
 * landing page. Pure-CSS infinite marquee (duplicates the list, animates
 * the wrapper by -50%). Each logo is a click-through to the partner's
 * real site — doubles as a trust signal AND a partner shout-out.
 *
 * Content source of truth: the 8 partners we emailed 2026-04-19. One
 * excluded per owner instruction (faith org — Aristotle).
 *
 * When a partner's logo doesn't load (missing asset), we fall back to
 * their business name rendered in the brand font.
 */

interface Partner {
  name: string;
  url: string;
  description: string;
  logoSrc?: string; // relative to /public
}

const PARTNERS: Partner[] = [
  {
    name: 'Aristotle Education',
    url: 'https://aristotleeducation.com',
    description: "Dr. Jamnadas — fasting, vagus-nerve & longevity protocols",
  },
  {
    name: 'Clinical Associates of Orlando',
    url: 'https://clinicalassociatesorlando.com',
    description: 'Clinical research · IRB-governed trials',
  },
  {
    name: 'Elite Medical Concierge',
    url: 'https://elitemedicalconcierge.com',
    description: 'Concierge internal medicine · Orlando',
  },
  {
    name: 'Dr. Jason Littleton',
    url: 'https://jasonmd.com',
    description: 'Concierge doctor · advanced lab testing',
  },
  {
    name: 'Natura Integrative and Functional Medicine',
    url: 'https://naturamed.org',
    description: 'Nourish to Flourish · AlignHer protocols',
  },
  {
    name: 'ND Wellness',
    url: 'https://ndwellness.com',
    description: 'Concierge wellness club · New Dimensions',
  },
  {
    name: 'The Restoration Place',
    url: 'https://trpclinic.com',
    description: 'BioTE BHRT · Winter Garden',
  },
  {
    name: 'Kristen Blake Wellness',
    url: 'https://kristenblakewellness.com',
    description: 'Concierge wellness · Central Florida',
  },
];

// Duplicate for seamless loop
const LOOP = [...PARTNERS, ...PARTNERS];

const PartnersMarquee: React.FC = () => {
  return (
    <section className="py-10 sm:py-12 bg-gradient-to-b from-white to-gray-50 border-y border-gray-100 overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-5 sm:mb-6">
          <p className="text-[10px] sm:text-[11px] uppercase tracking-widest text-gray-500 font-bold mb-1">
            Organizations we serve
          </p>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 leading-tight px-2">
            The providers who trust us with their patients' blood work
          </h2>
        </div>

        <div
          className="relative w-full convelabs-marquee-viewport"
          aria-label="Trusted partners — swipe or tap to visit"
        >
          {/* Edge fade masks — desktop only (mobile uses snap scrolling) */}
          <div className="hidden md:block pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-gray-50 to-transparent z-10" />
          <div className="hidden md:block pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-gray-50 to-transparent z-10" />

          {/* Single row. Mobile: user swipes (native scroll + snap).
              Desktop: auto-animates via CSS. Same markup, CSS decides. */}
          <div className="convelabs-marquee-row" style={{ whiteSpace: 'nowrap' }}>
            {LOOP.map((p, idx) => (
              <a
                key={`${p.name}-${idx}`}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
                title={`Visit ${p.name}`}
                style={{ width: '224px', flexShrink: 0, whiteSpace: 'normal' }}
              >
                <div className="bg-white border border-gray-200 rounded-xl px-4 sm:px-5 py-3 sm:py-4 h-full hover:border-conve-red/40 hover:shadow-md transition-all">
                  <div className="flex items-center min-h-[2.5rem] mb-1.5 sm:mb-2">
                    <span className="font-bold text-gray-900 text-sm sm:text-[15px] leading-tight group-hover:text-conve-red transition-colors">
                      {p.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    {p.description}
                  </p>
                </div>
              </a>
            ))}
          </div>

          {/* Mobile-only swipe hint — fades after first interaction */}
          <p className="md:hidden text-[10px] text-gray-400 text-center mt-2 italic">
            ← swipe to see more →
          </p>
        </div>

        {/* Provider CTA — convert viewing orgs into inbound partner leads */}
        <div className="mt-6 sm:mt-8 max-w-2xl mx-auto">
          <div className="bg-gradient-to-br from-conve-red/5 to-rose-50 border border-conve-red/20 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-conve-red/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-conve-red" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-conve-red mb-1">
                Are you a provider?
              </p>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 leading-tight">
                Partner with ConveLabs — your patients, our collection
              </h3>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                Send your patients to the concierge phlebotomy team your peers already trust. Custom pricing, branded portal, live in under 48 hours.
              </p>
            </div>
            <Link
              to="/partner-with-us"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-conve-red hover:bg-conve-red-dark text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors flex-shrink-0"
            >
              Partner with us <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <p className="text-[10px] sm:text-[11px] text-gray-400 text-center mt-4 sm:mt-6 italic px-4">
          Logos/names are the property of their respective organizations. Partnerships reflect ongoing lab-collection relationships.
        </p>
      </div>
    </section>
  );
};

export default PartnersMarquee;
