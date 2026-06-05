import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';
import { Button } from '@/components/ui/button';
import FAQSchema from '@/components/seo/FAQSchema';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import {
  DollarSign, Clock, MapPin, CheckCircle2, ShieldCheck, Stethoscope, Phone, Sparkles,
} from 'lucide-react';

/**
 * /mobile-phlebotomy-cost — SEO pillar page targeting "mobile phlebotomy cost"
 * and "how much does an at-home blood draw cost" (high-intent commercial/
 * informational queries competitors own). Includes FAQ schema for rich
 * results. Title/meta/canonical are also baked at build time by
 * scripts/generate-seo-html.mjs (STATIC_ROUTES entry) for pre-hydration SEO.
 */

const COST_FAQS = [
  {
    question: 'How much does mobile phlebotomy cost in Central Florida?',
    answer:
      'A mobile phlebotomy (at-home blood draw) visit in Central Florida typically runs $75–$150 for the collection fee, separate from any lab-processing fees. ConveLabs offers transparent flat pricing with no surprise bills, plus member pricing that lowers the per-visit cost on every draw. Get an exact quote in about 90 seconds at convelabs.com/book-now.',
  },
  {
    question: 'What is included in the visit fee?',
    answer:
      'The visit fee covers a licensed, insured phlebotomist traveling to your home or office, the blood collection itself, and proper handling and delivery of your specimen to the lab. Lab-processing fees for the tests themselves are billed separately by the lab (Quest, Labcorp, or your provider’s preferred lab).',
  },
  {
    question: 'Are there extra charges for travel or after-hours visits?',
    answer:
      'Most ConveLabs visits include travel within the core Central Florida service area. Extended-area locations may add a modest distance surcharge, and same-day, weekend, or after-hours appointments can carry a small convenience surcharge. Every fee is shown up front before you confirm — never a surprise on your bill.',
  },
  {
    question: 'Does insurance or Medicare cover at-home blood draws?',
    answer:
      'Insurance frequently covers the laboratory testing itself. Coverage of the mobile collection (visit) fee depends on your specific plan. Medicare Part B typically covers 80% of the approved amount for covered lab services after your deductible. ConveLabs provides itemized receipts you can submit for reimbursement or HSA/FSA use.',
  },
  {
    question: 'How can I lower the cost of regular blood draws?',
    answer:
      'If you get labs more than once or twice a year, a ConveLabs membership lowers the per-visit rate on every draw and adds priority scheduling — it typically pays for itself within a few visits. Bundling household members onto one visit also reduces the per-person cost.',
  },
  {
    question: 'Is mobile phlebotomy worth the cost vs. a lab walk-in?',
    answer:
      'For most people, yes. You skip the waiting room, the drive, and the time off work. ConveLabs adds one-try draws by experienced phlebotomists, results in about 48 hours, and an on-time guarantee — value a walk-in lab can’t match for the convenience of a draw at your door.',
  },
];

const COST_ROWS = [
  { label: 'At-home collection (visit) fee', range: '$75 – $150', note: 'Travels to your home or office' },
  { label: 'Distance / extended-area surcharge', range: '$15 – $75', note: 'Only beyond the core service radius' },
  { label: 'Same-day / after-hours convenience', range: '$25 – $100', note: 'Optional — standard scheduling has none' },
  { label: 'Lab-processing fees (the tests)', range: 'Billed by lab', note: 'Often covered by insurance' },
];

const MobilePhlebotomyCost = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <title>Mobile Phlebotomy Cost in Central Florida (2026) — ConveLabs</title>
        <meta
          name="description"
          content="How much does an at-home blood draw cost in Central Florida? A clear 2026 breakdown of mobile phlebotomy fees, travel surcharges, insurance, and ways to save."
        />
        <link rel="canonical" href="https://www.convelabs.com/mobile-phlebotomy-cost" />
      </Helmet>
      <FAQSchema faqs={COST_FAQS} mainEntity="Mobile Phlebotomy Cost" />

      <Header />

      <main className="flex-grow">
        {/* Hero */}
        <section className="bg-gradient-to-br from-[#B91C1C] to-[#991B1B] text-white py-16 md:py-24">
          <div className="mx-auto px-4 w-full text-center max-w-3xl">
            <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <DollarSign className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mb-4">
              Mobile Phlebotomy Cost in Central Florida (2026)
            </h1>
            <p className="text-lg md:text-xl text-red-100 mb-8">
              A transparent breakdown of what an at-home blood draw really costs — the visit
              fee, what affects it, how insurance fits in, and how to pay less per draw.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/book-now">
                <Button size="lg" className="bg-white text-[#B91C1C] hover:bg-red-50 font-semibold">
                  Get your exact price in 90 seconds
                </Button>
              </Link>
              <Link to="/pricing">
                <Button size="lg" variant="outline" className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-[#B91C1C]">
                  See full pricing
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Quick answer */}
        <section className="py-12 md:py-16">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 md:p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                The short answer
              </h2>
              <p className="text-gray-700 leading-relaxed">
                A mobile phlebotomy visit in Central Florida typically costs <strong>$75–$150</strong> for
                the at-home collection, separate from the lab-processing fees for the tests themselves.
                Budget price leaders start near $35 in some markets; full-service, concierge-style
                providers run higher. ConveLabs prices flat and up front — no surprise bills — and
                members pay a lower rate on every draw.
              </p>
            </div>
          </div>
        </section>

        {/* Cost breakdown table */}
        <section className="pb-12 md:pb-16">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">What goes into the price</h2>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-left">
                <thead className="bg-gray-100 text-gray-700 text-sm">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Line item</th>
                    <th className="px-4 py-3 font-semibold">Typical range</th>
                    <th className="px-4 py-3 font-semibold hidden sm:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {COST_ROWS.map((r) => (
                    <tr key={r.label}>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.label}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.range}</td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Ranges reflect the Central Florida market in 2026. Your ConveLabs quote shows every
              applicable fee before you confirm — nothing is added after the fact.
            </p>
          </div>
        </section>

        {/* Factors */}
        <section className="pb-12 md:pb-16 bg-gray-50">
          <div className="mx-auto px-4 w-full max-w-3xl py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">What changes the cost</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: MapPin, title: 'Location & distance', body: 'Visits inside the core Orlando-metro service area include travel; far-out suburbs may add a small distance surcharge.' },
                { icon: Clock, title: 'Timing', body: 'Standard daytime scheduling has no convenience fee. Same-day, weekend, or after-hours visits can add a modest surcharge.' },
                { icon: Stethoscope, title: 'Number of tubes / tests', body: 'A single-tube draw is simpler than a multi-tube comprehensive panel, but the visit fee itself usually stays flat.' },
                { icon: Sparkles, title: 'Membership', body: 'A ConveLabs membership lowers the per-visit rate on every draw — worth it if you test more than once or twice a year.' },
              ].map((f) => (
                <div key={f.title} className="bg-white rounded-lg border border-gray-200 p-5">
                  <f.icon className="h-6 w-6 text-[#B91C1C] mb-2" />
                  <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Insurance */}
        <section className="py-12 md:py-16">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Insurance, Medicare, HSA & FSA</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              Insurance frequently covers the <strong>lab testing</strong> itself. Coverage of the
              <strong> mobile collection fee</strong> depends on your plan. Medicare Part B generally
              covers 80% of the approved amount for covered lab services after your deductible.
            </p>
            <p className="text-gray-700 leading-relaxed">
              ConveLabs provides itemized receipts you can submit for reimbursement or pay with an
              HSA/FSA card. If a doctor ordered your labs, we route the specimen to the lab your
              provider or insurer prefers.
            </p>
          </div>
        </section>

        {/* Why worth it */}
        <section className="pb-12 md:pb-16 bg-gray-50">
          <div className="mx-auto px-4 w-full max-w-3xl py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Why a mobile draw is worth the fee</h2>
            <ul className="space-y-3">
              {[
                'No waiting room, no drive, no time off work — the phlebotomist comes to you.',
                'One-try draws by experienced, licensed phlebotomists.',
                'Results in about 48 hours, with delivery confirmation.',
                'On-time arrival guarantee — if we’re late, your visit is on us.',
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{t}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/book-now">
                <Button size="lg" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white font-semibold">
                  Book your at-home draw
                </Button>
              </Link>
              <Link to="/vs-labcorp">
                <Button size="lg" variant="outline">Compare vs Labcorp</Button>
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-12 md:py-16">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Mobile phlebotomy cost: FAQ</h2>
            <Accordion type="single" collapsible className="w-full">
              {COST_FAQS.map((f, i) => (
                <AccordionItem key={f.question} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-base font-semibold text-gray-900">
                    {f.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-600 leading-relaxed text-sm">
                    {f.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-gradient-to-br from-[#B91C1C] to-[#991B1B] text-white py-14">
          <div className="mx-auto px-4 w-full text-center max-w-2xl">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">See your exact price now</h2>
            <p className="text-red-100 mb-6">
              Pick a service, enter your ZIP, and get a flat quote in about 90 seconds —
              no account required.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/book-now">
                <Button size="lg" className="bg-white text-[#B91C1C] hover:bg-red-50 font-semibold">
                  Get my price
                </Button>
              </Link>
              <a href="tel:+19415279169">
                <Button size="lg" variant="outline" className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-[#B91C1C] gap-2">
                  <Phone className="h-4 w-4" /> (941) 527-9169
                </Button>
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default MobilePhlebotomyCost;
