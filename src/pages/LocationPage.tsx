import React from "react";
import { useParams, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Container } from "@/components/ui/container";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import { Shield, Clock, Star, Phone, MapPin, CheckCircle } from "lucide-react";
import { getLocationBySlug } from "@/data/locations";
import { useBookingModalSafe } from "@/contexts/BookingModalContext";

const LocationPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = slug ? getLocationBySlug(slug) : undefined;
  const bookingModal = useBookingModalSafe();

  if (!location) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <Helmet>
        <title>{location.seo.title}</title>
        <meta name="description" content={location.seo.description} />
        <meta name="keywords" content={location.seo.keywords} />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <meta name="geo.region" content="US-FL" />
        <meta name="geo.placename" content={`${location.name}, Florida`} />
        <meta name="geo.position" content={`${location.geo.latitude},${location.geo.longitude}`} />
        
        <meta property="og:type" content="business.business" />
        <meta property="og:title" content={location.seo.title} />
        <meta property="og:description" content={location.seo.description} />
        <meta property="og:url" content={`https://convelabs.com${location.seo.canonicalPath}`} />
        <meta property="og:image" content={location.seo.ogImage} />
        
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={location.seo.title} />
        <meta name="twitter:description" content={location.seo.description} />
        
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": `ConveLabs ${location.name} Mobile Lab Services`,
            "telephone": "+1-941-527-9169",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": location.name,
              "addressRegion": "Florida",
              "postalCode": location.geo.postalCode,
              "addressCountry": "US",
            },
            "geo": {
              "@type": "GeoCoordinates",
              "latitude": location.geo.latitude,
              "longitude": location.geo.longitude,
            },
            "url": `https://convelabs.com${location.seo.canonicalPath}`,
            "openingHours": "Mo-Su 06:00-22:00",
            "priceRange": "$$$",
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "5.0",
              "reviewCount": "127",
            },
          })}
        </script>
        
        <link rel="canonical" href={`https://convelabs.com${location.seo.canonicalPath}`} />
      </Helmet>

      <DashboardWrapper>
        <Container className="py-12">
          <div className="max-w-6xl mx-auto">
            {/* Hero Section */}
            <div className="text-center mb-16">
              <div className={`inline-flex items-center gap-2 bg-gradient-to-r ${location.badgeColor} border rounded-full px-4 py-2 mb-6`}>
                <Star className="h-4 w-4" />
                <span className="text-sm font-medium">{location.badgeText}</span>
              </div>
              
              <h1 className="text-4xl md:text-6xl font-bold font-playfair luxury-heading mb-6">
                {location.heroTitle}
              </h1>
              <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto executive-focus">
                {location.heroDescription}
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => bookingModal?.openModal(location.slug)}
                  className="inline-flex items-center justify-center px-8 py-3 bg-conve-red text-white font-semibold rounded-md hover:bg-red-700 transition-colors"
                >
                  Book Now
                </button>
                <a
                  href={`/onboarding/plan-selection?source=${location.slug}`}
                  className="inline-flex items-center justify-center px-8 py-3 border border-gray-300 font-semibold rounded-md hover:border-conve-red hover:text-conve-red transition-colors"
                >
                  Explore Membership
                </a>
              </div>
            </div>

            {/* Trust Signals */}
            <div className="grid md:grid-cols-3 gap-8 mb-16">
              {location.trustSignals.map((signal, index) => {
                const icons = [Clock, Shield, Star];
                const Icon = icons[index % icons.length];
                return (
                  <div key={index} className="text-center luxury-card p-6">
                    <Icon className="h-8 w-8 text-conve-red mx-auto mb-4" />
                    <h3 className="font-semibold text-lg mb-2">{signal.title}</h3>
                    <p className="text-gray-600">{signal.description}</p>
                  </div>
                );
              })}
            </div>

            {/* Special Services */}
            <div className="grid md:grid-cols-2 gap-8 mb-16">
              {location.specialServices.map((service, index) => (
                <div key={index} className="luxury-card p-8">
                  <h2 className="text-2xl font-bold mb-4 font-playfair">{service.title}</h2>
                  <p className="text-gray-600 mb-6">{service.description}</p>
                  <ul className="space-y-2">
                    {service.features.map((feature, fi) => (
                      <li key={fi} className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Service Areas */}
            <div className="luxury-card p-8 mb-16">
              <h2 className="text-2xl font-bold mb-6 font-playfair text-center">Service Coverage</h2>
              <div className="grid md:grid-cols-3 gap-6">
                {location.serviceAreas.map((area, index) => (
                  <div key={index} className="text-center">
                    <MapPin className="h-6 w-6 text-conve-red mx-auto mb-2" />
                    <h3 className="font-semibold mb-2">{area.name}</h3>
                    <p className="text-sm text-gray-600">{area.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Why Choose */}
            <div className="luxury-card p-8 mb-16">
              <h2 className="text-2xl font-bold mb-6 font-playfair text-center">
                Why {location.name} Clients Choose ConveLabs
              </h2>
              <div className="grid md:grid-cols-2 gap-8">
                {location.whyChoose.map((item, index) => (
                  <div key={index}>
                    <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                    <p className="text-gray-600">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Call to Action */}
            <div className="text-center luxury-gradient-bg p-12 rounded-2xl">
              <h2 className="text-3xl font-bold mb-4 font-playfair">{location.ctaTitle}</h2>
              <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
                {location.ctaDescription}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => bookingModal?.openModal(`${location.slug}_cta`)}
                  className="inline-flex items-center justify-center px-8 py-3 bg-conve-red text-white font-semibold rounded-md hover:bg-red-700 transition-colors"
                >
                  Book Now
                </button>
                <a
                  href={`/onboarding/plan-selection?source=${location.slug}_cta`}
                  className="inline-flex items-center justify-center px-8 py-3 border border-gray-300 font-semibold rounded-md hover:border-conve-red hover:text-conve-red transition-colors"
                >
                  Explore Membership
                </a>
              </div>
              <div className="mt-6 flex items-center justify-center gap-4 text-gray-600">
                <Phone className="h-5 w-5" />
                <span className="font-semibold">Call directly: 941-527-9169</span>
              </div>
            </div>
          </div>
        </Container>
      </DashboardWrapper>
    </>
  );
};

export default LocationPage;
