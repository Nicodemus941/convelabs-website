import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Container } from '@/components/ui/container';
import { BookNowButton } from '@/components/ui/book-now-button';
import { MembershipButton } from '@/components/ui/membership-button';
import DashboardWrapper from '@/components/dashboards/DashboardWrapper';
import { Shield, Clock, Star, Phone, MapPin, CheckCircle, Plane } from 'lucide-react';

const HeathrowGolf: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>✈️ Heathrow Golf Mobile Lab | Executive Aviation Community | ConveLabs | VIP Services | 941-527-9169</title>
        <meta 
          name="description" 
          content="⭐ Elite Mobile Lab Services for Heathrow Golf & Country Club ⭐ Executive blood work for Central Florida's aviation community. Same-day results for busy pilots and aviation executives! ✈️"
        />
        <meta 
          name="keywords" 
          content="mobile lab services Heathrow Golf Country Club, executive phlebotomy Heathrow aviation community, VIP blood work Heathrow FL, mobile blood draw aviation executives, concierge lab testing pilots, same day blood results Heathrow golf, mobile phlebotomy Heathrow Country Club, aviation medical services"
        />
        
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "ConveLabs Heathrow Golf Mobile Lab Services",
            "telephone": "+1-941-527-9169",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Heathrow",
              "addressRegion": "Florida",
              "postalCode": "32746",
              "addressCountry": "US"
            },
            "geo": {
              "@type": "GeoCoordinates", 
              "latitude": 28.8089,
              "longitude": -81.3656
            },
            "areaServed": {
              "@type": "City",
              "name": "Heathrow",
              "description": "Executive mobile lab services for Heathrow's aviation and golf community"
            }
          })}
        </script>
        
        <link rel="canonical" href="https://convelabs.com/heathrow-golf" />
      </Helmet>

      <DashboardWrapper>
        <Container className="py-12">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-sky-100 to-sky-50 border border-sky-200 rounded-full px-4 py-2 mb-6">
              <Plane className="h-4 w-4 text-sky-600" />
              <span className="text-sm font-medium text-sky-800">Serving Aviation & Golf Elite</span>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold font-playfair luxury-heading mb-6">
              Heathrow Golf Executive Mobile Lab
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto executive-focus">
              Executive mobile phlebotomy services for Heathrow Golf & Country Club and aviation community. 
              First-class healthcare for Central Florida's pilots, aviation executives, and golf professionals.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton size="lg" />
              <MembershipButton variant="outline" size="lg" />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="text-center luxury-card p-6">
              <Clock className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Aviation-Speed Service</h3>
              <p className="text-gray-600">Quick turnaround for busy flight schedules</p>
            </div>
            <div className="text-center luxury-card p-6">
              <Shield className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">FAA Medical Support</h3>
              <p className="text-gray-600">Aviation medical exam assistance</p>
            </div>
            <div className="text-center luxury-card p-6">
              <Plane className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Executive Aviation Focus</h3>
              <p className="text-gray-600">Designed for aviation professionals</p>
            </div>
          </div>

          <div className="text-center luxury-gradient-bg p-12 rounded-2xl">
            <h2 className="text-3xl font-bold mb-4 font-playfair">Elevate Your Healthcare Experience</h2>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Join Heathrow's aviation and golf professionals who trust ConveLabs for executive-level mobile lab services.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton size="lg" />
              <MembershipButton variant="outline" size="lg" />
            </div>
            <div className="mt-6 flex items-center justify-center gap-4 text-gray-600">
              <Phone className="h-5 w-5" />
              <span className="font-semibold">Executive Aviation Line: 941-527-9169</span>
            </div>
          </div>
        </Container>
      </DashboardWrapper>
    </>
  );
};

export default HeathrowGolf;