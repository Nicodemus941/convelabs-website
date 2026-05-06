/**
 * /brand — INTERNAL brand-system reference page.
 *
 * Source of truth for the ConveLabs Brand System v2 (May 2026 rack-card
 * aesthetic). Anyone joining the team or wiring a new partner integration
 * sees the live tokens + components in one URL.
 *
 * Hormozi: "Name the patterns so the team can defend them."
 *   • The Drop — the burgundy logo mark with the gold curl
 *   • The Gold Bar — divider with diamond inflection
 *   • The YOUR Italic — gold serif italic emphasis
 *   • The Lockup — "Labs At YOUR Convenience®" footer signature
 *   • The Cream Canvas — cream page background, never pure white
 */
import React from 'react';
import BrandHero from '@/components/brand/BrandHero';
import BrandGoldDivider from '@/components/brand/BrandGoldDivider';
import BrandItalicAccent from '@/components/brand/BrandItalicAccent';
import BrandFooterLockup from '@/components/brand/BrandFooterLockup';

const TOKENS: Array<{ name: string; value: string; hex: string; note: string }> = [
  { name: '--brand-burgundy',        value: '#7F1D1D', hex: '#7F1D1D', note: 'Primary CTA, headers, accent blocks' },
  { name: '--brand-burgundy-deep',   value: '#5C1414', hex: '#5C1414', note: 'Gradient shadow on burgundy fills' },
  { name: '--brand-burgundy-darker', value: '#3F0A0A', hex: '#3F0A0A', note: 'Footer, deep dark sections' },
  { name: '--brand-gold',            value: '#C9A961', hex: '#C9A961', note: 'Dividers, italic accent, decorative lines' },
  { name: '--brand-gold-deep',       value: '#B8924A', hex: '#B8924A', note: 'Gold shadow / hover state' },
  { name: '--brand-cream',           value: '#F8F4ED', hex: '#F8F4ED', note: 'Page background — NEVER pure white' },
  { name: '--brand-cream-soft',      value: '#FBF8F2', hex: '#FBF8F2', note: 'Card backgrounds on cream' },
  { name: '--brand-charcoal',        value: '#0F0F10', hex: '#0F0F10', note: 'Body text on cream' },
  { name: '--brand-gray-warm',       value: '#6B5E54', hex: '#6B5E54', note: 'Secondary text' },
];

const Brand: React.FC = () => {
  return (
    <main className="brand-canvas min-h-screen pb-24" style={{ backgroundColor: 'var(--brand-cream)' }}>
      <BrandHero
        headlineLeading="Brand System v2,"
        headlineAccent="documented."
        subhead="Source of truth for ConveLabs visual identity. Every customer-facing surface composes from these tokens and components."
        ctaLabel="See the Cards →"
        ctaHref="#cards"
        bullets={[
          { icon: '🎨', label: 'Three colors that matter — burgundy, gold, cream' },
          { icon: '✒️', label: 'Two type families — Playfair Display, Inter' },
          { icon: '⭐', label: 'Five named patterns — The Drop, Gold Bar, YOUR Italic, Lockup, Cream Canvas' },
        ]}
      />

      <section className="container mx-auto px-4 max-w-5xl">
        {/* TOKENS */}
        <h2 className="brand-display text-3xl font-bold mb-2 mt-12">Color Tokens</h2>
        <p className="text-brand-gray-warm mb-8">CSS variables from <code className="text-brand-burgundy">src/styles/brand-tokens.css</code>. Tailwind aliases under <code className="text-brand-burgundy">brand.*</code>.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOKENS.map(t => (
            <div key={t.name} className="bg-[#FBF8F2] border border-[rgba(127,29,29,0.1)] rounded-xl p-4 shadow-sm">
              <div className="h-16 rounded-lg mb-3" style={{ backgroundColor: t.hex }} />
              <p className="font-mono text-xs text-brand-burgundy">{t.name}</p>
              <p className="font-mono text-sm font-semibold mt-0.5">{t.value}</p>
              <p className="text-xs text-brand-gray-warm mt-1">{t.note}</p>
            </div>
          ))}
        </div>

        <BrandGoldDivider variant="wide" className="my-16" />

        {/* TYPOGRAPHY */}
        <h2 className="brand-display text-3xl font-bold mb-6">Typography</h2>
        <div className="space-y-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-brand-gray-warm mb-2">Display — Playfair Display</p>
            <p className="brand-display text-5xl font-bold">
              Lab work, <BrandItalicAccent>where you are.</BrandItalicAccent>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-brand-gray-warm mb-2">Body — Inter</p>
            <p className="text-base text-brand-charcoal max-w-2xl">
              Skip the waiting room. We come to you. Mobile blood draws, specialty kits, and therapeutic phlebotomy — wherever your day is.
            </p>
          </div>
        </div>

        <BrandGoldDivider variant="wide" className="my-16" />

        {/* PATTERNS */}
        <h2 className="brand-display text-3xl font-bold mb-6">Named Patterns</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PatternCard
            name="The Gold Bar"
            description="Divider with a diamond inflection at center. Use to separate hero copy from supporting sections."
            preview={<BrandGoldDivider />}
          />
          <PatternCard
            name="The YOUR Italic"
            description="Gold serif italic emphasis inside a serif headline. The brand's vocal stress."
            preview={
              <p className="brand-display text-2xl font-bold">
                Labs At <BrandItalicAccent underline>YOUR</BrandItalicAccent> Convenience<sup className="text-xs">®</sup>
              </p>
            }
          />
          <PatternCard
            name="The Lockup"
            description='Footer trademark signature. Drops into every customer page + every email.'
            preview={<BrandFooterLockup />}
          />
          <PatternCard
            name="The Cream Canvas"
            description="Page background — never pure white. Communicates premium-but-warm."
            preview={<div className="h-16 rounded-md" style={{ backgroundColor: 'var(--brand-cream)', border: '1px solid rgba(0,0,0,0.06)' }} />}
          />
        </div>

        <BrandGoldDivider variant="wide" className="my-16" />

        {/* CTA */}
        <h2 className="brand-display text-3xl font-bold mb-6">Primary CTA</h2>
        <a className="brand-cta" href="#">Book Now → Same-Week Slots</a>
        <p className="text-xs text-brand-gray-warm mt-3">
          Class: <code className="text-brand-burgundy">.brand-cta</code> · burgundy gradient · 0.625rem radius · burgundy shadow
        </p>

        <BrandGoldDivider variant="wide" className="my-16" />

        {/* DON'TS */}
        <h2 className="brand-display text-3xl font-bold mb-6">Don'ts</h2>
        <ul className="space-y-2 text-brand-charcoal">
          <li>❌ Don't use pure <code>#FFFFFF</code> for backgrounds — use <code className="text-brand-burgundy">--brand-cream</code></li>
          <li>❌ Don't use <code>#B91C1C</code> bright red — use <code className="text-brand-burgundy">--brand-burgundy</code></li>
          <li>❌ Don't introduce a third typeface — Playfair + Inter only</li>
          <li>❌ Don't use the gold (<code>#C9A961</code>) for any UI element a user clicks — gold is decorative only</li>
          <li>❌ Don't drop the ® off "Labs At YOUR Convenience" — it's a registered mark</li>
        </ul>
      </section>

      <div className="mt-16">
        <BrandFooterLockup />
      </div>
    </main>
  );
};

const PatternCard: React.FC<{ name: string; description: string; preview: React.ReactNode }> = ({ name, description, preview }) => (
  <div className="bg-[#FBF8F2] border border-[rgba(127,29,29,0.1)] rounded-xl p-6 shadow-sm">
    <h3 className="brand-display text-xl font-bold mb-1">{name}</h3>
    <p className="text-sm text-brand-gray-warm mb-4">{description}</p>
    <div className="bg-white rounded-lg p-4 flex items-center justify-center min-h-[100px]">
      {preview}
    </div>
  </div>
);

export default Brand;
