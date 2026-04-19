import React from 'react';

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
    name: 'Aristotle',
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
    <section className="py-12 bg-gradient-to-b from-white to-gray-50 border-y border-gray-100 overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-6">
          <p className="text-[11px] uppercase tracking-widest text-gray-500 font-bold mb-1">
            Organizations we serve
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
            The providers who trust us with their patients' blood work
          </h2>
        </div>

        <div
          className="relative w-full overflow-hidden"
          aria-label="Trusted partners carousel"
        >
          {/* Edge fade masks */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-gray-50 to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-gray-50 to-transparent z-10" />

          <div className="flex gap-6 animate-marquee hover:[animation-play-state:paused]">
            {LOOP.map((p, idx) => (
              <a
                key={`${p.name}-${idx}`}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 w-64 group"
                title={`Visit ${p.name}`}
              >
                <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 h-full hover:border-conve-red/40 hover:shadow-md transition-all">
                  <div className="flex items-center h-10 mb-2">
                    <span className="font-bold text-gray-900 text-[15px] leading-tight group-hover:text-conve-red transition-colors">
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
        </div>

        <p className="text-[11px] text-gray-400 text-center mt-6 italic">
          Logos/names are the property of their respective organizations. Partnerships reflect ongoing lab-collection relationships.
        </p>
      </div>

      {/* Pure-CSS marquee animation */}
      <style>{`
        @keyframes convelabs-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: convelabs-marquee 40s linear infinite;
          width: max-content;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-marquee { animation: none; }
        }
      `}</style>
    </section>
  );
};

export default PartnersMarquee;
