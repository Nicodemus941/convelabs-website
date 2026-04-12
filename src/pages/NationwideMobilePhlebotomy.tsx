import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Container } from '@/components/ui/container';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';
import { MapPin, Users, FlaskConical, Truck, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBookingModalSafe } from '@/contexts/BookingModalContext';

const GHS_URL = 'https://greenhealthsystems.com';

const NationwideMobilePhlebotomy: React.FC = () => {
  const bookingModal = useBookingModalSafe();

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Organization", "MedicalBusiness"],
        "@id": "https://greenhealthsystems.com/#organization",
        "name": "Green Health Systems",
        "url": "https://greenhealthsystems.com",
        "description": "Nationwide network of certified mobile phlebotomists providing at-home blood draw services across the United States.",
        "areaServed": {
          "@type": "Country",
          "name": "United States"
        },
        "member": {
          "@type": ["Organization", "MedicalBusiness"],
          "@id": "https://convelabs.com/#organization",
          "name": "ConveLabs",
          "url": "https://convelabs.com",
          "areaServed": {
            "@type": "State",
            "name": "Florida"
          }
        }
      },
      {
        "@type": "HealthcareService",
        "name": "Nationwide Mobile Phlebotomy Network",
        "description": "Mobile phlebotomy services connecting patients with certified phlebotomists across the United States through the Green Health Systems network.",
        "provider": {
          "@id": "https://greenhealthsystems.com/#organization"
        },
        "areaServed": {
          "@type": "Country",
          "name": "United States"
        },
        "serviceType": "Mobile Phlebotomy",
        "availableChannel": {
          "@type": "ServiceChannel",
          "serviceUrl": "https://greenhealthsystems.com"
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://convelabs.com"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Nationwide Mobile Phlebotomy Network",
            "item": "https://convelabs.com/nationwide-mobile-phlebotomy-network"
          }
        ]
      }
    ]
  };

  return (
    <>
      <Helmet>
        <title>Nationwide Mobile Phlebotomy Network | ConveLabs & Green Health Systems</title>
        <meta name="description" content="ConveLabs provides mobile phlebotomy services locally in Florida. For patients outside our service area, we partner with Green Health Systems, a nationwide network of certified mobile phlebotomists." />
        <meta property="og:title" content="Nationwide Mobile Phlebotomy Network | ConveLabs & Green Health Systems" />
        <meta property="og:description" content="Access mobile phlebotomy services anywhere in the United States through the Green Health Systems nationwide provider network." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://convelabs.com/nationwide-mobile-phlebotomy-network" />
        <link rel="canonical" href="https://convelabs.com/nationwide-mobile-phlebotomy-network" />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      <Header />

      <main>
        {/* Section 1 — Hero */}
        <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white py-20 md:py-28">
          <Container>
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 font-playfair">
                Nationwide Mobile Phlebotomy Services
              </h1>
              <p className="text-lg md:text-xl text-gray-300 mb-8 leading-relaxed">
                Mobile blood draw services are no longer limited to a single city or state. Patients across the United States can now access certified mobile phlebotomists who come directly to their home, office, or preferred location — eliminating waiting rooms and making laboratory testing more convenient than ever.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button onClick={() => bookingModal?.openModal('nationwide_hero')} className="inline-block">
                  <Button size="lg" className="bg-conve-red hover:bg-red-800 text-white px-8 py-6 text-lg w-full">
                    Book in Florida
                  </Button>
                </button>
                <a href={GHS_URL} rel="noopener" target="_blank" className="inline-block">
                  <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-gray-900 px-8 py-6 text-lg w-full">
                    Find a Mobile Phlebotomist Nationwide
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              </div>
            </div>
          </Container>
        </section>

        {/* Section 2 — Local Services (Florida) */}
        <section className="py-16 md:py-20 bg-white">
          <Container>
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center gap-3 mb-6">
                <MapPin className="h-8 w-8 text-conve-red flex-shrink-0" />
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 font-playfair">
                  Local Services in Florida
                </h2>
              </div>
              <p className="text-lg text-gray-600 mb-6 leading-relaxed">
                ConveLabs is a premium mobile phlebotomy provider serving patients throughout Central Florida. Our certified phlebotomists deliver white-glove, at-home blood draw services in Orlando, Winter Park, Windermere, Doctor Phillips, Lake Nona, and surrounding communities.
              </p>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                Whether you need routine lab work, executive health screenings, or concierge phlebotomy for your medical practice, ConveLabs brings laboratory-quality specimen collection to your doorstep with same-day availability and CLIA-certified processing.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {['Orlando', 'Winter Park', 'Windermere', 'Doctor Phillips', 'Lake Nona', 'Tampa Bay'].map((city) => (
                  <div key={city} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-center text-sm font-medium text-gray-700">
                    {city}
                  </div>
                ))}
              </div>
            </div>
          </Container>
        </section>

        {/* Section 3 — Nationwide Network */}
        <section className="py-16 md:py-20 bg-gray-50">
          <Container>
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center gap-3 mb-6">
                <Users className="h-8 w-8 text-conve-red flex-shrink-0" />
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 font-playfair">
                  Nationwide Network
                </h2>
              </div>
              <p className="text-lg text-gray-600 mb-6 leading-relaxed">
                For patients outside Florida, ConveLabs partners with{' '}
                <a href={GHS_URL} rel="noopener" target="_blank" className="text-conve-red font-semibold hover:underline">
                  Green Health Systems
                </a>
                , a nationwide platform that connects patients with certified mobile phlebotomists across the United States.
              </p>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                Green Health Systems maintains a growing network of licensed, insured, and background-checked phlebotomy professionals who deliver the same level of convenience and care that ConveLabs patients experience in Florida — available in cities and communities from coast to coast.
              </p>
              <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Why Green Health Systems?</h3>
                <ul className="space-y-3 text-gray-600">
                  <li className="flex items-start gap-3">
                    <span className="text-conve-red font-bold mt-0.5">✓</span>
                    Certified and background-checked mobile phlebotomists nationwide
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-conve-red font-bold mt-0.5">✓</span>
                    Same convenient at-home or at-office service model
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-conve-red font-bold mt-0.5">✓</span>
                    Partnerships with major reference laboratories across the country
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-conve-red font-bold mt-0.5">✓</span>
                    Online booking and real-time appointment management
                  </li>
                </ul>
                <div className="mt-6">
                  <a href={GHS_URL} rel="noopener" target="_blank" className="text-conve-red font-semibold hover:underline inline-flex items-center">
                    Nationwide Mobile Phlebotomy Network
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          </Container>
        </section>

        {/* Section 4 — How It Works */}
        <section className="py-16 md:py-20 bg-white">
          <Container>
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-12 font-playfair">
                How the Network Works
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                {[
                  { step: 1, icon: <MapPin className="h-8 w-8" />, title: 'Book Service', description: 'Schedule your mobile blood draw online or by phone. Select your location and preferred time.' },
                  { step: 2, icon: <Users className="h-8 w-8" />, title: 'Provider Assigned', description: 'A certified mobile phlebotomist in your area is matched to your appointment.' },
                  { step: 3, icon: <FlaskConical className="h-8 w-8" />, title: 'Blood Draw Performed', description: 'Your phlebotomist arrives at your location and performs the specimen collection professionally.' },
                  { step: 4, icon: <Truck className="h-8 w-8" />, title: 'Sample Delivered', description: 'Specimens are transported to a certified laboratory for processing and analysis.' },
                ].map((item) => (
                  <div key={item.step} className="text-center">
                    <div className="w-16 h-16 bg-conve-red/10 text-conve-red rounded-full flex items-center justify-center mx-auto mb-4">
                      {item.icon}
                    </div>
                    <div className="text-sm font-bold text-conve-red mb-2">Step {item.step}</div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-600">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </Container>
        </section>

        {/* Section 5 — CTA */}
        <section className="py-16 md:py-20 bg-gradient-to-br from-conve-red to-red-800 text-white">
          <Container>
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-6 font-playfair">
                Need a Mobile Phlebotomist Outside Florida?
              </h2>
              <p className="text-lg text-red-100 mb-8 leading-relaxed">
                Green Health Systems connects you with certified mobile phlebotomists in cities across the United States. Book your at-home blood draw today.
              </p>
              <a href={GHS_URL} rel="noopener" target="_blank">
                <Button size="lg" className="bg-white text-conve-red hover:bg-gray-100 px-10 py-6 text-lg font-semibold shadow-lg">
                  Find a Mobile Phlebotomist Near You
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </a>
              <p className="mt-6 text-red-200 text-sm">
                In Florida?{' '}
                <button onClick={() => bookingModal?.openModal('nationwide_cta')} className="underline text-white hover:text-red-100">
                  Book with ConveLabs directly
                </button>
              </p>
            </div>
          </Container>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default NationwideMobilePhlebotomy;
