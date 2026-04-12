import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Container } from '@/components/ui/container';
import { BookNowButton } from '@/components/ui/book-now-button';
import { MembershipButton } from '@/components/ui/membership-button';
import DashboardWrapper from '@/components/dashboards/DashboardWrapper';
import { Shield, Clock, Star, Phone, MapPin, CheckCircle, Anchor } from 'lucide-react';

const YachtMobileLab: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>⛵ Yacht Mobile Lab Testing Orlando | Marine Phlebotomy | ConveLabs | Luxury Waterfront | 941-527-9169</title>
        <meta 
          name="description" 
          content="⭐ Elite Yacht Mobile Lab Services Orlando ⭐ Luxury marine phlebotomy for yacht owners and waterfront estates. Same-day blood work at marinas, docks, and private vessels. Premium maritime healthcare! ⛵"
        />
        <meta 
          name="keywords" 
          content="yacht mobile lab testing Orlando, marine phlebotomy Central Florida, luxury boat blood work, dock side mobile lab, yacht medical services Orlando, marina phlebotomy services, waterfront mobile blood draw, private vessel lab testing, luxury marine healthcare Orlando"
        />
        
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            "name": "Yacht Mobile Lab Testing Services",
            "description": "Luxury mobile phlebotomy services for yacht owners and marine enthusiasts",
            "provider": {
              "@type": "MedicalBusiness",
              "name": "ConveLabs Mobile Lab Services",
              "telephone": "+1-941-527-9169"
            },
            "areaServed": [
              "Orlando, FL",
              "Winter Park, FL", 
              "Windermere, FL",
              "Lake Mary, FL"
            ],
            "serviceType": "Marine Mobile Phlebotomy",
            "specialty": "Yacht and Marine Lab Services"
          })}
        </script>
        
        <link rel="canonical" href="https://convelabs.com/yacht-mobile-lab" />
      </Helmet>

      <DashboardWrapper>
        <Container className="py-12">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-100 to-blue-50 border border-blue-200 rounded-full px-4 py-2 mb-6">
              <Anchor className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Premium Marine Healthcare Services</span>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold font-playfair luxury-heading mb-6">
              Yacht Mobile Lab Testing Orlando
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto executive-focus">
              Luxury mobile phlebotomy services for yacht owners, marina members, and waterfront estates. 
              Experience premium healthcare while enjoying Central Florida's beautiful waterways.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton size="lg" />
              <MembershipButton variant="outline" size="lg" />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="text-center luxury-card p-6">
              <Clock className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Marina-Side Service</h3>
              <p className="text-gray-600">Convenient dock-side blood work</p>
            </div>
            <div className="text-center luxury-card p-6">
              <Shield className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Marine Safety Certified</h3>
              <p className="text-gray-600">Specialized waterfront protocols</p>
            </div>
            <div className="text-center luxury-card p-6">
              <Anchor className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Yacht Club Premium</h3>
              <p className="text-gray-600">Exclusive marine community service</p>
            </div>
          </div>

          {/* Marine Service Features */}
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <div className="luxury-card p-8">
              <h2 className="text-2xl font-bold mb-4 font-playfair">Yacht & Marina Services</h2>
              <p className="text-gray-600 mb-6">
                Specialized mobile lab services for yacht owners and marina members throughout 
                Central Florida's premier waterfront communities.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Private yacht house calls</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Marina dock-side service</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Yacht club member programs</span>
                </li>
              </ul>
            </div>

            <div className="luxury-card p-8">
              <h2 className="text-2xl font-bold mb-4 font-playfair">Waterfront Estate Services</h2>
              <p className="text-gray-600 mb-6">
                Premium mobile lab services for luxury waterfront properties and 
                private estates along Central Florida's exclusive lake communities.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Waterfront estate visits</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Private dock access</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Lake community services</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="text-center luxury-gradient-bg p-12 rounded-2xl">
            <h2 className="text-3xl font-bold mb-4 font-playfair">Set Sail for Premium Healthcare</h2>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Join Central Florida's yacht owners and marina members who trust ConveLabs for luxury mobile lab services.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton size="lg" />
              <MembershipButton variant="outline" size="lg" />
            </div>
            <div className="mt-6 flex items-center justify-center gap-4 text-gray-600">
              <Phone className="h-5 w-5" />
              <span className="font-semibold">Marine Services Hotline: 941-527-9169</span>
            </div>
          </div>
        </Container>
      </DashboardWrapper>
    </>
  );
};

export default YachtMobileLab;