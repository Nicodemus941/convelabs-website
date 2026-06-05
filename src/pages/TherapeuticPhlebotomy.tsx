import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';
import { Button } from '@/components/ui/button';
import FAQSchema from '@/components/seo/FAQSchema';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import {
  Droplet, Home, ClipboardCheck, ShieldCheck, Repeat, HeartPulse, Phone, CheckCircle2,
} from 'lucide-react';

/**
 * /therapeutic-phlebotomy — SEO service page targeting "therapeutic phlebotomy
 * Orlando / at home" (low-competition, recurring-revenue, high-intent medical
 * need). MedicalProcedure + FAQPage schema. Title/meta/canonical are also baked
 * at build time by scripts/generate-seo-html.mjs (STATIC_ROUTES entry).
 */

const TP_FAQS = [
  {
    question: 'What is therapeutic phlebotomy?',
    answer:
      'Therapeutic phlebotomy is the removal of a controlled volume of blood as a medical treatment — most often to reduce excess iron (hemochromatosis) or an elevated red-blood-cell count (polycythemia). It is performed under a physician’s order, on a schedule your doctor sets. Unlike a diagnostic draw of a few milliliters, a therapeutic draw typically removes around 450–500 mL, similar to a blood donation.',
  },
  {
    question: 'What conditions does it treat?',
    answer:
      'The most common are hereditary hemochromatosis (iron overload), polycythemia vera and secondary polycythemia (too many red blood cells), and porphyria cutanea tarda (PCT). Your physician determines whether therapeutic phlebotomy is appropriate, the target labs, and how often you need a session.',
  },
  {
    question: 'Do I need a doctor’s order?',
    answer:
      'Yes. Therapeutic phlebotomy is a medical treatment and requires a standing order or prescription from your physician that specifies frequency and any lab thresholds (for example, a target ferritin or hematocrit). ConveLabs follows your physician’s order exactly and coordinates results back to your provider.',
  },
  {
    question: 'Can it really be done at home?',
    answer:
      'For many stable, established patients, yes — a licensed phlebotomist performs the session in your home on the schedule your doctor ordered, which removes the recurring trip to an infusion center or hospital lab. Your physician decides whether at-home therapeutic phlebotomy is right for you based on your history and current labs.',
  },
  {
    question: 'How much does it cost and is it covered?',
    answer:
      'Therapeutic phlebotomy is frequently covered by insurance and Medicare when it is medically necessary and ordered by your physician. The at-home convenience (visit) fee may be separate depending on your plan. ConveLabs provides itemized receipts for reimbursement or HSA/FSA use — see our cost guide for the full breakdown.',
  },
  {
    question: 'How often will I need a session?',
    answer:
      'That is set entirely by your physician and your lab trends. Some patients start with weekly or biweekly sessions during an initial “de-ironing” phase, then move to a maintenance schedule of every few months. ConveLabs makes recurring at-home sessions easy to schedule so you stay on your doctor’s plan.',
  },
];

const TherapeuticPhlebotomy = () => {
  const procedureSchema = {
    '@context': 'https://schema.org',
    '@type': 'MedicalProcedure',
    name: 'Therapeutic Phlebotomy (At-Home)',
    procedureType: 'https://schema.org/TherapeuticProcedure',
    howPerformed:
      'A licensed phlebotomist removes a physician-ordered volume of blood (typically 450–500 mL) at the patient’s home to treat iron overload or elevated red-blood-cell counts.',
    bodyLocation: 'Antecubital vein (arm)',
    followup: 'Results coordinated back to the ordering physician.',
    url: 'https://www.convelabs.com/therapeutic-phlebotomy',
    provider: {
      '@type': 'MedicalBusiness',
      name: 'ConveLabs',
      telephone: '+1-941-527-9169',
      areaServed: 'Central Florida',
    },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <title>Therapeutic Phlebotomy at Home — Orlando | ConveLabs</title>
        <meta
          name="description"
          content="Recurring therapeutic phlebotomy at home in Central Florida — for hemochromatosis & polycythemia. Licensed phlebotomists honor your physician's order. Book in 90 sec."
        />
        <link rel="canonical" href="https://www.convelabs.com/therapeutic-phlebotomy" />
        <script type="application/ld+json">{JSON.stringify(procedureSchema)}</script>
      </Helmet>
      <FAQSchema faqs={TP_FAQS} mainEntity="Therapeutic Phlebotomy" />

      <Header />

      <main className="flex-grow">
        {/* Hero */}
        <section className="bg-gradient-to-br from-[#B91C1C] to-[#991B1B] text-white py-16 md:py-24 overflow-hidden">
          <div className="mx-auto px-4 w-full max-w-6xl grid md:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div className="text-center md:text-left">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-5 mx-auto md:mx-0">
                <Droplet className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">
                Therapeutic Phlebotomy at Home in Central Florida
              </h1>
              <p className="text-lg text-red-100 mb-8">
                Doctor-ordered blood removal for hemochromatosis and polycythemia — performed by a
                licensed phlebotomist in your home, on the schedule your physician sets. Skip the
                infusion-center waits.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                <Link to="/book-now">
                  <Button size="lg" className="bg-white text-[#B91C1C] hover:bg-red-50 font-semibold w-full sm:w-auto">
                    Set up recurring at-home sessions
                  </Button>
                </Link>
                <a href="tel:+19415279169">
                  <Button size="lg" variant="outline" className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-[#B91C1C] gap-2 w-full sm:w-auto">
                    <Phone className="h-4 w-4" /> (941) 527-9169
                  </Button>
                </a>
              </div>
            </div>
            <div className="hidden md:block">
              <img
                src="/lovable-uploads/c99a1186-df28-4627-b519-d8f2753e18c2.png"
                alt="ConveLabs licensed phlebotomist performing an at-home therapeutic phlebotomy session in Central Florida"
                width="1920"
                height="1920"
                loading="eager"
                className="rounded-2xl shadow-2xl ring-1 ring-white/20 w-full object-cover max-h-[440px]"
              />
            </div>
          </div>
        </section>

        {/* What is it */}
        <section className="py-12 md:py-16">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 md:p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">What is therapeutic phlebotomy?</h2>
              <p className="text-gray-700 leading-relaxed">
                Therapeutic phlebotomy is the removal of a controlled volume of blood — usually around{' '}
                <strong>450–500 mL</strong> — as a <strong>medical treatment</strong>, not a diagnostic test.
                It’s most often used to lower excess iron in <strong>hemochromatosis</strong> or reduce an
                elevated red-blood-cell count in <strong>polycythemia</strong>. It’s done under your physician’s
                order, on a schedule they set, with your results coordinated back to your care team.
              </p>
            </div>
          </div>
        </section>

        {/* Conditions */}
        <section className="pb-12 md:pb-16">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Conditions it commonly treats</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { title: 'Hemochromatosis', body: 'Hereditary iron overload — recurring draws lower ferritin and protect the liver, heart, and joints.' },
                { title: 'Polycythemia', body: 'Polycythemia vera or secondary polycythemia — removing blood lowers an elevated hematocrit.' },
                { title: 'Porphyria (PCT)', body: 'Porphyria cutanea tarda — scheduled phlebotomy helps reduce iron and manage symptoms.' },
              ].map((c) => (
                <div key={c.title} className="bg-white rounded-lg border border-gray-200 p-5">
                  <HeartPulse className="h-6 w-6 text-[#B91C1C] mb-2" />
                  <h3 className="font-semibold text-gray-900 mb-1">{c.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{c.body}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Your physician determines whether therapeutic phlebotomy is appropriate for your condition,
              the target labs, and how often you need a session.
            </p>
          </div>
        </section>

        {/* Why at home + how it works */}
        <section className="pb-12 md:pb-16 bg-gray-50">
          <div className="mx-auto px-4 w-full max-w-3xl py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Why do it at home with ConveLabs</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Home, title: 'No infusion-center trips', body: 'A recurring treatment shouldn’t mean recurring drives and waiting rooms. We come to you.' },
                { icon: ClipboardCheck, title: 'Your order, followed exactly', body: 'We honor your physician’s standing order — frequency, volume, and any lab thresholds — and report results back.' },
                { icon: Repeat, title: 'Easy recurring scheduling', body: 'Lock in a weekly, biweekly, or maintenance cadence so you never fall behind your plan.' },
                { icon: ShieldCheck, title: 'Licensed & insured', body: 'Every ConveLabs phlebotomist is licensed, certified, background-checked, and experienced with larger-volume draws.' },
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

        {/* Safety / who it's right for */}
        <section className="py-12 md:py-16">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Is at-home therapeutic phlebotomy right for you?</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              At-home therapeutic phlebotomy is best suited to <strong>stable, established patients</strong> with a
              clear physician order. Your doctor decides whether home treatment is appropriate based on your
              history, current labs, and how you tolerate sessions. We coordinate closely with your provider and
              will defer a session if your pre-checks fall outside the parameters they set.
            </p>
            <ul className="space-y-3">
              {[
                'You have a current physician order specifying frequency and lab targets.',
                'You’re hydrated and have eaten before your session (we’ll remind you).',
                'You’ve tolerated prior therapeutic draws without significant adverse reactions.',
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{t}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 mt-5">
              This page is educational and is not medical advice. Always follow your physician’s guidance about
              whether, how often, and where to receive therapeutic phlebotomy.
            </p>
          </div>
        </section>

        {/* Cost note */}
        <section className="pb-12 md:pb-16 bg-gray-50">
          <div className="mx-auto px-4 w-full max-w-3xl py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Cost & insurance</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              When it’s medically necessary and physician-ordered, therapeutic phlebotomy is frequently covered
              by insurance and Medicare. The at-home convenience fee may be separate depending on your plan, and
              we provide itemized receipts for reimbursement or HSA/FSA use.
            </p>
            <Link to="/mobile-phlebotomy-cost">
              <Button variant="outline" size="lg">See the full cost breakdown</Button>
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-12 md:py-16">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Therapeutic phlebotomy: FAQ</h2>
            <Accordion type="single" collapsible className="w-full">
              {TP_FAQS.map((f, i) => (
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
            <h2 className="text-2xl md:text-3xl font-bold mb-3">Stay on your treatment schedule — at home</h2>
            <p className="text-red-100 mb-6">
              Send us your physician’s order and we’ll handle recurring at-home therapeutic phlebotomy across
              Central Florida.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/book-now">
                <Button size="lg" className="bg-white text-[#B91C1C] hover:bg-red-50 font-semibold">
                  Get started
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

export default TherapeuticPhlebotomy;
