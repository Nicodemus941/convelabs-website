import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';
import { Button } from '@/components/ui/button';
import FAQSchema from '@/components/seo/FAQSchema';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import {
  Home, Truck, Clock, ClipboardCheck, ShieldCheck, Phone,
  CheckCircle2, MapPin, CalendarClock,
} from 'lucide-react';

/**
 * /function-health-blood-draw — SEO service page for the "I have a Function
 * Health membership and don't want to sit in a Quest PSC" intent.
 *
 * POSITIONING / LEGAL: ConveLabs holds a vendor account with Quest Diagnostics,
 * which is what makes this service possible and is stated as fact. ConveLabs has
 * NO relationship with Function Health — every reference to them is nominative
 * (identifying whose panel the patient holds), and the page carries an explicit
 * non-affiliation line. Do not add logos, "partner", "official", or "authorized"
 * language for Function Health unless a real agreement is signed.
 *
 * We also state plainly that a Function Health membership already includes a
 * draw at a Quest Patient Service Center — our fee buys convenience, not access.
 * Do not remove that; letting a patient think they must pay us would be a lie.
 *
 * Price ($150) mirrors the "Mobile Blood Draw" row in services_enhanced. If that
 * row changes, change it here. MedicalProcedure + FAQPage schema; title/meta/
 * canonical are also baked at build time by scripts/generate-seo-html.mjs.
 */

const FH_FAQS = [
  {
    question: 'Can ConveLabs draw my Function Health labs at home?',
    answer:
      'Yes. A Function Health panel is ordered through Quest Diagnostics, and ConveLabs holds a vendor account with Quest. A licensed phlebotomist comes to your home or office anywhere in Central Florida, performs the draw, and delivers the specimen to Quest on your behalf — so you never set foot in a Patient Service Center. Bring up your requisition on your phone or print it; we handle the rest.',
  },
  {
    question: 'Is ConveLabs affiliated with Function Health?',
    answer:
      'No. ConveLabs is an independent mobile phlebotomy company and is not affiliated with, endorsed by, or acting on behalf of Function Health. We reference Function Health only to identify the panel our clients are having drawn. Our relationship is with Quest Diagnostics, where we hold a vendor account and deliver specimens.',
  },
  {
    question: "Doesn't my membership already include the blood draw?",
    answer:
      'It does — at a Quest Patient Service Center. Your membership covers the panel and the draw if you go in person. ConveLabs is a separate, optional convenience: you pay us to come to you instead of driving to a PSC, waiting, and driving back. If you are happy going in person, you do not need us. Most of our clients book because an hour of their morning is worth more than our visit fee.',
  },
  {
    question: 'How much does a mobile draw for Function Health cost?',
    answer:
      'A standard mobile blood draw is $150 — a flat, at-home visit fee covering the phlebotomist, the collection, and delivery to Quest. That is the ConveLabs visit fee only. Your Function Health membership and the lab analysis itself are billed by them, not by us. Extended-area addresses may carry a small travel surcharge, which is shown before you confirm.',
  },
  {
    question: 'Do I need to fast, and when can you come?',
    answer:
      'Most comprehensive panels ask for a fasting window — follow the instructions on your requisition and from Function Health, not this page. Because fasting is easiest first thing, we hold early-morning appointments, which is the window that fills first. Book a few days ahead if you want a specific early slot.',
  },
  {
    question: 'What do I need to have ready before the visit?',
    answer:
      'Your Function Health requisition (on your phone is fine), a photo ID, and somewhere comfortable to sit with a table or armrest. That is it. We bring every tube, label, and supply the Quest order calls for, and we confirm the requisition details with you before drawing.',
  },
  {
    question: 'Which parts of Central Florida do you cover?',
    answer:
      'We serve the greater Orlando metro — including Winter Park, Baldwin Park, Lake Nona, Windermere, Dr. Phillips, Isleworth, Celebration, Heathrow and Lake Mary, Longwood, and Winter Garden — plus surrounding communities. If you are outside the core service area, we will tell you at booking whether a travel surcharge applies before you confirm anything.',
  },
];

const SERVICE_AREAS = [
  'Orlando', 'Winter Park', 'Baldwin Park', 'Lake Nona', 'Windermere',
  'Dr. Phillips', 'Isleworth', 'Celebration', 'Heathrow', 'Lake Mary',
  'Longwood', 'Winter Garden',
];

const FunctionHealthBloodDraw = () => {
  const procedureSchema = {
    '@context': 'https://schema.org',
    '@type': 'MedicalProcedure',
    name: 'At-Home Blood Draw for Function Health Panels (Delivered to Quest Diagnostics)',
    procedureType: 'https://schema.org/DiagnosticProcedure',
    howPerformed:
      'A licensed phlebotomist travels to the client\'s home or office, verifies the Quest Diagnostics requisition associated with the client\'s Function Health panel, performs the venipuncture into the tubes the order specifies, labels and stabilizes the specimen, and delivers it to Quest Diagnostics on the client\'s behalf.',
    bodyLocation: 'Antecubital vein (arm)',
    followup: 'Specimen delivered to Quest Diagnostics; results returned through the client\'s Function Health account.',
    url: 'https://www.convelabs.com/function-health-blood-draw',
    provider: {
      '@type': 'MedicalBusiness',
      name: 'ConveLabs',
      telephone: '+1-941-527-9169',
      areaServed: SERVICE_AREAS.map((a) => ({
        '@type': 'City',
        name: `${a}, Florida`,
      })),
    },
    offers: {
      '@type': 'Offer',
      price: '150.00',
      priceCurrency: 'USD',
      description: 'Flat at-home mobile blood draw visit fee, including delivery to Quest Diagnostics.',
    },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <title>Function Health Blood Draw at Home — Orlando | ConveLabs</title>
        <meta
          name="description"
          content="Skip the Quest Patient Service Center. A licensed phlebotomist draws your Function Health panel at home in Orlando and delivers it to Quest. $150 flat. Book in 90 sec."
        />
        <link rel="canonical" href="https://www.convelabs.com/function-health-blood-draw" />
        <script type="application/ld+json">{JSON.stringify(procedureSchema)}</script>
      </Helmet>
      <FAQSchema faqs={FH_FAQS} mainEntity="Function Health Blood Draw at Home" />

      <Header />

      <main className="flex-grow">
        {/* Hero */}
        <section className="bg-gradient-to-br from-[#B91C1C] to-[#991B1B] text-white py-16 md:py-24 overflow-hidden">
          <div className="mx-auto px-4 w-full max-w-6xl grid md:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div className="text-center md:text-left">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-5 mx-auto md:mx-0">
                <Home className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">
                Function Health Blood Draw at Home in Orlando
              </h1>
              <p className="text-lg text-red-100 mb-8">
                Your Function Health panel is a Quest order — and ConveLabs is a Quest vendor.
                A licensed phlebotomist draws it at your kitchen table and delivers the specimen
                to Quest for you. No Patient Service Center, no waiting room, no lost morning.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                <Link to="/book-now">
                  <Button size="lg" className="bg-white text-[#B91C1C] hover:bg-red-50 font-semibold w-full sm:w-auto">
                    Book my draw — $150
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
                alt="ConveLabs licensed phlebotomist drawing a Function Health panel at a client's home in Orlando, Florida"
                width="1920"
                height="1920"
                loading="eager"
                className="rounded-2xl shadow-2xl ring-1 ring-white/20 w-full object-cover max-h-[440px]"
              />
            </div>
          </div>
        </section>

        {/* Why this works */}
        <section className="py-12 md:py-16">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 md:p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                Why we can draw a Function Health panel
              </h2>
              <p className="text-gray-700 mb-4">
                When you order a panel through Function Health, the testing itself runs at{' '}
                <strong>Quest Diagnostics</strong> — your requisition is a Quest order. Normally you
                take that order into a Quest Patient Service Center, check in, wait your turn, get
                drawn, and drive home.
              </p>
              <p className="text-gray-700 mb-4">
                ConveLabs holds a <strong>vendor account with Quest Diagnostics</strong>. That means a
                licensed ConveLabs phlebotomist can collect against your Quest requisition at your
                home or office and deliver the specimen to Quest on your behalf. Same lab, same
                order, same results in your Function Health account — you simply never leave the house.
              </p>
              <p className="text-gray-600 text-sm">
                Being straight with you: your Function Health membership already covers the draw if
                you go to a Patient Service Center in person. Our $150 visit fee buys you the
                morning back, not access to the test. If you don't mind the trip, you don't need us.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-12 md:py-16 bg-white">
          <div className="mx-auto px-4 w-full max-w-5xl">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8 text-center">
              How an at-home Function Health draw works
            </h2>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { icon: CalendarClock, title: 'Book your window', body: 'Pick a time — early-morning slots for fasting panels go first. Takes about 90 seconds.' },
                { icon: ClipboardCheck, title: 'Have your order ready', body: 'Your Function Health requisition on your phone, plus a photo ID. We bring every tube and supply.' },
                { icon: Home, title: 'We come to you', body: 'A licensed phlebotomist draws at your kitchen table, home office, or workplace. Usually 15 minutes.' },
                { icon: Truck, title: 'We deliver to Quest', body: 'We label, stabilize and hand off your specimen to Quest. Results land in your Function Health account as usual.' },
              ].map((s) => (
                <div key={s.title} className="text-center">
                  <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                    <s.icon className="h-6 w-6 text-[#B91C1C]" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-600">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What it costs */}
        <section className="py-12 md:py-16 bg-gray-50">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 text-center">
              What it costs
            </h2>
            <div className="rounded-xl border border-gray-200 bg-white p-6 md:p-8">
              <div className="flex items-baseline justify-between border-b border-gray-100 pb-4 mb-4">
                <span className="font-semibold text-gray-900">Mobile blood draw, delivered to Quest</span>
                <span className="text-3xl font-bold text-[#B91C1C]">$150</span>
              </div>
              <ul className="space-y-2 text-gray-700">
                {[
                  'Licensed phlebotomist travels to your home or office',
                  'All tubes, labels and supplies your Quest order requires',
                  'Specimen delivered to Quest Diagnostics on your behalf',
                  'Flat fee — no per-tube or per-panel charges from us',
                ].map((li) => (
                  <li key={li} className="flex gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                    <span>{li}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-gray-500 mt-4">
                Your Function Health membership and lab analysis are billed separately by them.
                Extended-area addresses may add a travel surcharge, shown before you confirm.
              </p>
            </div>
          </div>
        </section>

        {/* Service area — local SEO */}
        <section className="py-12 md:py-16 bg-white">
          <div className="mx-auto px-4 w-full max-w-4xl">
            <div className="flex items-center gap-2 justify-center mb-3">
              <MapPin className="h-5 w-5 text-[#B91C1C]" />
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
                Where we draw across Central Florida
              </h2>
            </div>
            <p className="text-gray-600 text-center mb-8 max-w-2xl mx-auto">
              ConveLabs serves the greater Orlando metro. If your Function Health panel needs
              drawing in any of these communities, we come to you.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SERVICE_AREAS.map((area) => (
                <span
                  key={area}
                  className="px-4 py-2 rounded-full border border-gray-200 bg-gray-50 text-gray-800 text-sm font-medium"
                >
                  {area}
                </span>
              ))}
            </div>
            <p className="text-sm text-gray-500 text-center mt-6">
              Outside these areas? Call us — we cover much of Central Florida and will tell you
              upfront whether a travel surcharge applies.
            </p>
          </div>
        </section>

        {/* Trust */}
        <section className="py-12 md:py-16 bg-gray-50">
          <div className="mx-auto px-4 w-full max-w-4xl grid md:grid-cols-3 gap-6">
            {[
              { icon: ShieldCheck, title: 'Licensed phlebotomists', body: 'Every draw is performed by a certified professional, not a technician-in-training.' },
              { icon: Clock, title: 'Scheduled windows', body: 'You get an arrival window and we keep it. Early-morning slots available for fasting panels.' },
              { icon: Truck, title: 'Chain of custody', body: 'Labeled, stabilized and delivered to Quest with delivery confirmation on every specimen.' },
            ].map((c) => (
              <div key={c.title} className="rounded-xl border border-gray-200 bg-white p-6">
                <c.icon className="h-7 w-7 text-[#B91C1C] mb-3" />
                <h3 className="font-semibold text-gray-900 mb-2">{c.title}</h3>
                <p className="text-sm text-gray-600">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="py-12 md:py-16 bg-white">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8 text-center">
              Function Health draws — common questions
            </h2>
            <Accordion type="single" collapsible className="w-full">
              {FH_FAQS.map((faq, i) => (
                <AccordionItem key={faq.question} value={`item-${i}`}>
                  <AccordionTrigger className="text-left font-semibold text-gray-900">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-700 leading-relaxed">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Related services — internal linking */}
        <section className="py-12 bg-gray-50">
          <div className="mx-auto px-4 w-full max-w-3xl text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Other draws we handle</h2>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link to="/specialty-kit-collection" className="text-[#B91C1C] hover:underline font-medium">
                Specialty kit collection (Genova, DUTCH, GI-MAP)
              </Link>
              <span className="text-gray-300">·</span>
              <Link to="/therapeutic-phlebotomy" className="text-[#B91C1C] hover:underline font-medium">
                Therapeutic phlebotomy
              </Link>
              <span className="text-gray-300">·</span>
              <Link to="/concierge-phlebotomy" className="text-[#B91C1C] hover:underline font-medium">
                Concierge phlebotomy
              </Link>
              <span className="text-gray-300">·</span>
              <Link to="/pricing" className="text-[#B91C1C] hover:underline font-medium">
                Full pricing
              </Link>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-br from-[#B91C1C] to-[#991B1B] text-white py-14">
          <div className="mx-auto px-4 w-full max-w-3xl text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              Get your Function Health panel drawn without leaving home
            </h2>
            <p className="text-red-100 mb-7">
              Early-morning fasting slots across Orlando and Central Florida. Booking takes about 90 seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/book-now">
                <Button size="lg" className="bg-white text-[#B91C1C] hover:bg-red-50 font-semibold w-full sm:w-auto">
                  Book my draw
                </Button>
              </Link>
              <a href="tel:+19415279169">
                <Button size="lg" variant="outline" className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-[#B91C1C] gap-2 w-full sm:w-auto">
                  <Phone className="h-4 w-4" /> (941) 527-9169
                </Button>
              </a>
            </div>
          </div>
        </section>

        {/* Non-affiliation disclaimer */}
        <section className="py-8 bg-white border-t border-gray-100">
          <div className="mx-auto px-4 w-full max-w-3xl">
            <p className="text-xs text-gray-500 leading-relaxed text-center">
              ConveLabs is an independent mobile phlebotomy provider and is <strong>not affiliated
              with, endorsed by, or acting on behalf of Function Health</strong>. Function Health is a
              trademark of its respective owner and is referenced here solely to identify the panels
              our clients have ordered. ConveLabs holds a vendor account with Quest Diagnostics;
              Quest Diagnostics is a trademark of its respective owner. Laboratory testing and results
              are provided by those companies, not by ConveLabs. Always follow the fasting and
              preparation instructions supplied with your own order.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default FunctionHealthBloodDraw;
