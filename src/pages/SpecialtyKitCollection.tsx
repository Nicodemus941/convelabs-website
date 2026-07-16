import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';
import { Button } from '@/components/ui/button';
import FAQSchema from '@/components/seo/FAQSchema';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import {
  FlaskConical, Home, Truck, Thermometer, ClipboardCheck, ShieldCheck, Phone,
  CheckCircle2, Clock, Snowflake,
} from 'lucide-react';

/**
 * /specialty-kit-collection — SEO service page targeting the long-tail
 * "my doctor gave me a kit, who draws it?" intent (DUTCH, Genova, GI-MAP,
 * Vibrant, etc.). This demand is largely intermediated by functional-medicine
 * practices, so the page doubles as a landing spot for partner-practice
 * referrals. MedicalProcedure + FAQPage schema; title/meta/canonical are also
 * baked at build time by scripts/generate-seo-html.mjs (STATIC_ROUTES entry).
 */

const SK_FAQS = [
  {
    question: 'My doctor gave me a specialty kit — who actually draws it?',
    answer:
      'A licensed phlebotomist does. Most specialty kits (DUTCH, Genova, GI-MAP, Vibrant and similar) ship to you as an empty collection kit — the lab expects a trained professional to perform the blood draw, prepare the specimen, and return it. ConveLabs comes to your home or office in Central Florida, collects into the exact tubes your kit provides, and gets it back to the lab. Most primary-care offices and retail labs will not draw into a kit they did not supply, which is the usual reason patients end up looking for someone like us.',
  },
  {
    question: 'Which specialty kits do you collect?',
    answer:
      'We routinely collect for the major functional and specialty labs — including Genova Diagnostics, Precision Analytical (DUTCH), Diagnostic Solutions (GI-MAP), Vibrant Wellness, Mosaic Diagnostics, ZRT Laboratory, Doctor\'s Data, Cyrex Laboratories, and Access Medical Labs. If your kit is not on that list, send us a photo of the kit instructions and we will confirm we can handle it before you book.',
  },
  {
    question: 'How much does specialty kit collection cost?',
    answer:
      'A standard specialty collection kit visit is $185, and a Genova Diagnostics kit is $200 — these are flat, at-home visit fees for the collection itself. The kit and the lab analysis are billed separately by the lab or your practice, not by ConveLabs. If your doctor is one of our partner practices, your rate may be lower (several partner practices are set at $85) — ask their office or check with us before booking.',
  },
  {
    question: 'Why does it matter who collects a specialty kit?',
    answer:
      'Because specialty kits are far less forgiving than a routine draw. Many require a strict fasting window, a specific collection time of day, a particular tube order, centrifuging and separating serum within a set number of minutes, and sometimes freezing before shipment. A mistake at any of those steps can void the sample — meaning a rejected kit, a repeat draw, and weeks of delay in your protocol. Our phlebotomists are trained on the specialty kit formats these labs use.',
  },
  {
    question: 'Do you handle the shipping back to the lab?',
    answer:
      'Yes. Specialty kits ship back via UPS or FedEx using the return materials in your kit, and many have same-day or next-day drop deadlines plus cold-chain requirements. We prepare the specimen, pack it per the kit instructions, and get it into the carrier on time so it arrives inside the lab\'s stability window.',
  },
  {
    question: 'Do I need to do anything to prepare?',
    answer:
      'It depends on the kit. Some require fasting, some require a first-morning collection, and some require you to pause certain supplements or medications beforehand — your kit instructions and your provider set those rules. When you book, we send prep reminders ahead of your visit so the requirements are not a surprise the night before. Always follow your provider\'s guidance over anything general on this page.',
  },
];

const SpecialtyKitCollection = () => {
  const procedureSchema = {
    '@context': 'https://schema.org',
    '@type': 'MedicalProcedure',
    name: 'Specialty Lab Kit Collection (At-Home)',
    procedureType: 'https://schema.org/DiagnosticProcedure',
    howPerformed:
      'A licensed phlebotomist performs the blood draw into the specialty lab kit supplied by the patient\'s provider, processes the specimen per the kit protocol (including centrifuging, aliquoting, or freezing where required), and ships it to the originating laboratory.',
    bodyLocation: 'Antecubital vein (arm)',
    followup: 'Specimen shipped to the originating specialty laboratory; results returned to the ordering provider.',
    url: 'https://www.convelabs.com/specialty-kit-collection',
    provider: {
      '@type': 'MedicalBusiness',
      name: 'ConveLabs',
      telephone: '+1-941-527-9169',
      areaServed: 'Central Florida',
    },
  };

  const LABS = [
    'Genova Diagnostics',
    'Precision Analytical (DUTCH)',
    'Diagnostic Solutions (GI-MAP)',
    'Vibrant Wellness',
    'Mosaic Diagnostics',
    'ZRT Laboratory',
    "Doctor's Data",
    'Cyrex Laboratories',
    'Access Medical Labs',
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <title>Specialty Lab Kit Collection at Home — Orlando | ConveLabs</title>
        <meta
          name="description"
          content="Got a DUTCH, Genova, GI-MAP or Vibrant kit from your doctor? A licensed phlebotomist collects it at your home in Central Florida and ships it on time. Book in 90 sec."
        />
        <link rel="canonical" href="https://www.convelabs.com/specialty-kit-collection" />
        <script type="application/ld+json">{JSON.stringify(procedureSchema)}</script>
      </Helmet>
      <FAQSchema faqs={SK_FAQS} mainEntity="Specialty Lab Kit Collection" />

      <Header />

      <main className="flex-grow">
        {/* Hero */}
        <section className="bg-gradient-to-br from-[#B91C1C] to-[#991B1B] text-white py-16 md:py-24 overflow-hidden">
          <div className="mx-auto px-4 w-full max-w-6xl grid md:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div className="text-center md:text-left">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-5 mx-auto md:mx-0">
                <FlaskConical className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">
                Specialty Lab Kit Collection at Home in Central Florida
              </h1>
              <p className="text-lg text-red-100 mb-8">
                Your doctor handed you a DUTCH, Genova, GI-MAP or Vibrant kit — and then you found out
                your regular lab won't draw it. We will. A licensed phlebotomist collects it at your
                home, preps it exactly to protocol, and ships it on time.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                <Link to="/book-now">
                  <Button size="lg" className="bg-white text-[#B91C1C] hover:bg-red-50 font-semibold w-full sm:w-auto">
                    Book my kit collection
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
                alt="ConveLabs licensed phlebotomist collecting a specialty lab kit at a patient's home in Central Florida"
                width="1920"
                height="1920"
                loading="eager"
                className="rounded-2xl shadow-2xl ring-1 ring-white/20 w-full object-cover max-h-[440px]"
              />
            </div>
          </div>
        </section>

        {/* The problem */}
        <section className="py-12 md:py-16">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 md:p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                Why won't my regular lab draw my kit?
              </h2>
              <p className="text-gray-700 leading-relaxed">
                Because it isn't their kit. Most retail labs and primary-care offices will only draw into
                tubes they supply and bill for — so patients holding a specialty kit from a functional or
                integrative practice get turned away. The kit sits on the counter, the protocol stalls, and
                the fasting prep gets repeated. <strong>ConveLabs collects the kit your provider gave you</strong>,
                at your home or office, anywhere in Central Florida.
              </p>
            </div>
          </div>
        </section>

        {/* Which labs */}
        <section className="pb-12 md:pb-16">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Specialty kits we collect</h2>
            <div className="flex flex-wrap gap-2">
              {LABS.map((lab) => (
                <span
                  key={lab}
                  className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3.5 py-1.5 text-sm text-gray-800"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {lab}
                </span>
              ))}
            </div>
            <p className="text-sm text-gray-600 mt-4 leading-relaxed">
              Kit not listed? Send us a photo of the kit instructions and we'll confirm we can handle it
              before you book. We collect the specimen and return it to the originating lab — the lab runs
              the analysis and reports to your provider.
            </p>
          </div>
        </section>

        {/* Why collection quality matters */}
        <section className="pb-12 md:pb-16 bg-gray-50">
          <div className="mx-auto px-4 w-full max-w-3xl py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">A specialty kit is not a routine draw</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              These kits are unforgiving. Miss one step and the lab rejects the sample — which means a
              repeat draw, another fasting morning, and weeks lost in your protocol. This is what we're
              drilled on:
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Clock, title: 'Timing windows', body: 'Strict fasting windows and time-of-day collection requirements — first-morning draws, timed cortisol points, and more.' },
                { icon: ClipboardCheck, title: 'Tube order & volume', body: 'The exact tubes in your kit, filled in the right order to the right volume. No substitutions.' },
                { icon: Thermometer, title: 'Spin & separate on time', body: 'Many kits require centrifuging and separating serum or plasma within a set number of minutes of the draw.' },
                { icon: Snowflake, title: 'Cold chain & freezing', body: 'Some specimens must be chilled or frozen immediately and stay that way until the carrier takes them.' },
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

        {/* How it works */}
        <section className="py-12 md:py-16">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">How it works</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Home, title: '1. We come to you', body: 'Pick a time at your home, office, or hotel anywhere in Central Florida. Keep your kit sealed until we arrive.' },
                { icon: ClipboardCheck, title: '2. Prep reminders first', body: 'We send fasting and prep reminders ahead of the visit so the requirements aren\'t a surprise the night before.' },
                { icon: FlaskConical, title: '3. Collected to protocol', body: 'Your kit\'s tubes, your kit\'s order, processed and labeled exactly the way the lab expects.' },
                { icon: Truck, title: '4. Shipped on time', body: 'Packed per the kit instructions and into UPS or FedEx inside the drop deadline, so it lands within the stability window.' },
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

        {/* Pricing */}
        <section className="pb-12 md:pb-16 bg-gray-50">
          <div className="mx-auto px-4 w-full max-w-3xl py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">What it costs</h2>
            <div className="grid sm:grid-cols-2 gap-4 mb-5">
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <p className="text-sm text-gray-600">Specialty collection kit</p>
                <p className="text-3xl font-bold text-[#B91C1C] mt-1">$185</p>
                <p className="text-xs text-gray-500 mt-1">Flat at-home visit fee</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <p className="text-sm text-gray-600">Genova Diagnostics kit</p>
                <p className="text-3xl font-bold text-[#B91C1C] mt-1">$200</p>
                <p className="text-xs text-gray-500 mt-1">Flat at-home visit fee</p>
              </div>
            </div>
            <p className="text-gray-700 leading-relaxed mb-2">
              That's the collection visit only. <strong>The kit itself and the lab's analysis are billed
              separately by the lab or your practice</strong> — not by ConveLabs.
            </p>
            <p className="text-gray-700 leading-relaxed mb-6">
              Seeing one of our partner practices? Several are set at a reduced rate — ask their office, or{' '}
              <Link to="/for-providers" className="text-[#B91C1C] underline font-medium">see our provider partnerships</Link>.
            </p>
            <Link to="/mobile-phlebotomy-cost">
              <Button variant="outline" size="lg">See the full cost breakdown</Button>
            </Link>
          </div>
        </section>

        {/* For practices */}
        <section className="py-12 md:py-16">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 md:p-8">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-6 w-6 text-emerald-700 flex-shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Are you a practice sending kits home with patients?</h2>
                  <p className="text-gray-700 leading-relaxed mb-4">
                    Your protocol is only as good as the collection. We partner with functional and
                    integrative practices across Central Florida — flat per-collection pricing, patient-pay
                    or practice-pay per visit, and specialty-kit-trained phlebotomists so your data comes
                    back clean the first time.
                  </p>
                  <Link to="/for-providers">
                    <Button className="bg-emerald-700 hover:bg-emerald-800 text-white">Partner with us</Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="pb-12 md:pb-16">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Specialty kit collection: FAQ</h2>
            <Accordion type="single" collapsible className="w-full">
              {SK_FAQS.map((f, i) => (
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
            <p className="text-xs text-gray-500 mt-6">
              This page is educational and is not medical advice. Follow your provider's and your kit's
              instructions for fasting, timing, and preparation.
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-gradient-to-br from-[#B91C1C] to-[#991B1B] text-white py-14">
          <div className="mx-auto px-4 w-full text-center max-w-2xl">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">Don't let the kit sit on the counter</h2>
            <p className="text-red-100 mb-6">
              Book a licensed phlebotomist to collect your specialty kit at home — prepped to protocol and
              shipped on time, anywhere in Central Florida.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/book-now">
                <Button size="lg" className="bg-white text-[#B91C1C] hover:bg-red-50 font-semibold">
                  Book my kit collection
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

export default SpecialtyKitCollection;
