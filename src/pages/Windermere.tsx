import React from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { BookNowButton } from "@/components/ui/book-now-button";
import { MembershipButton } from "@/components/ui/membership-button";
import { ArrowRight, MapPin, Clock, Shield, Award, Users, Heart } from "lucide-react";

const Windermere: React.FC = () => {
  const handleMembershipRedirect = () => {
    window.location.href = "/onboarding/plan-selection?source=windermere";
  };

  const handleBookingRedirect = () => {
    window.location.href = "/book-now?source=windermere";
  };

  return (
    <DashboardWrapper>
      <Helmet>
        <title>Luxury Mobile Phlebotomy Windermere | VIP Concierge Blood Draw Services | ConveLabs</title>
        <meta name="description" content="Windermere's premier luxury mobile phlebotomy service for high-net-worth residents. White-glove concierge blood draws at your estate, yacht, or private office. Serving Isleworth, Keene's Pointe luxury communities with same-day VIP appointments." />
        <meta name="keywords" content="luxury mobile phlebotomy Windermere, VIP mobile blood work Winter Park, premium home lab services Windermere, concierge phlebotomy Isleworth, executive health screening Windermere, white glove blood draw Keene's Pointe, luxury lab testing Windermere FL, yacht mobile phlebotomy" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:title" content="Windermere Mobile Phlebotomy Services | ConveLabs" />
        <meta property="og:description" content="Premium mobile phlebotomy services in Windermere, FL. Professional at-home and office blood draws with same-day appointments." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://convelabs.com/windermere" />
        <meta property="og:image" content="https://convelabs.com/images/windermere-mobile-phlebotomy.jpg" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Windermere Mobile Phlebotomy Services | ConveLabs" />
        <meta name="twitter:description" content="Premium mobile phlebotomy services in Windermere, FL. Professional at-home and office blood draws." />
        <meta name="twitter:image" content="https://convelabs.com/images/windermere-mobile-phlebotomy.jpg" />
        
        {/* Local Business Schema */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "ConveLabs Windermere",
            "description": "Premium mobile phlebotomy services in Windermere, Florida",
            "url": "https://convelabs.com/windermere",
            "telephone": "+1-855-CONVE-LAB",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Windermere",
              "addressRegion": "FL",
              "addressCountry": "US"
            },
            "geo": {
              "@type": "GeoCoordinates",
              "latitude": "28.4947",
              "longitude": "-81.5342"
            },
            "serviceArea": {
              "@type": "GeoCircle",
              "geoMidpoint": {
                "@type": "GeoCoordinates",
                "latitude": "28.4947",
                "longitude": "-81.5342"
              },
              "geoRadius": "25000"
            },
            "hasOfferCatalog": {
              "@type": "OfferCatalog",
              "name": "Mobile Phlebotomy Services",
              "itemListElement": [
                {
                  "@type": "Offer",
                  "itemOffered": {
                    "@type": "Service",
                    "name": "At-Home Blood Draws"
                  }
                },
                {
                  "@type": "Offer", 
                  "itemOffered": {
                    "@type": "Service",
                    "name": "Office Blood Draw Services"
                  }
                }
              ]
            }
          })}
        </script>
        
        <link rel="canonical" href="https://convelabs.com/windermere" />
      </Helmet>

      <Container className="py-12">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Luxury Mobile Phlebotomy Services in <span className="text-conve-red">Windermere, Florida</span>
            </h1>
            <p className="text-xl text-gray-700 mb-8 max-w-3xl mx-auto">
              Experience white-glove concierge blood draws at your Windermere estate, yacht, or private office. 
              Our certified phlebotomists serve Isleworth, Keene's Pointe, and Central Florida's most exclusive communities 
              with VIP appointments and ultimate discretion.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton 
                size="lg" 
                className="bg-conve-red hover:bg-conve-red/90"
                useQuickBooking={true}
              />
              <MembershipButton size="lg">
                Explore Membership Benefits
              </MembershipButton>
            </div>
          </div>

          {/* Key Benefits */}
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="text-center p-6 bg-gray-50 rounded-xl">
              <Clock className="h-12 w-12 text-conve-red mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Same-Day Available</h3>
              <p className="text-gray-600">Emergency and routine appointments available throughout Windermere</p>
            </div>
            <div className="text-center p-6 bg-gray-50 rounded-xl">
              <Shield className="h-12 w-12 text-conve-red mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Certified & Insured</h3>
              <p className="text-gray-600">Licensed phlebotomists with years of experience serving Central Florida</p>
            </div>
            <div className="text-center p-6 bg-gray-50 rounded-xl">
              <Award className="h-12 w-12 text-conve-red mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Premium Service</h3>
              <p className="text-gray-600">White-glove service with hospital-grade equipment and techniques</p>
            </div>
          </div>
          
          {/* Our Windermere Services */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-12">
            <h2 className="text-3xl font-bold text-center mb-8">Our Windermere Services</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <Link 
                to="/services/windermere/home-blood-draws" 
                className="group border border-gray-200 rounded-lg p-6 hover:border-conve-red hover:shadow-md transition-all"
              >
                <div className="flex items-start space-x-4">
                  <Heart className="h-8 w-8 text-conve-red flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-xl font-semibold mb-2 group-hover:text-conve-red transition-colors">
                      At-Home Blood Draws in Windermere
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Professional phlebotomists come directly to your Windermere residence, providing 
                      ultimate comfort and privacy for you and your family.
                    </p>
                    <ul className="text-sm text-gray-500 space-y-1">
                      <li>• Perfect for families with children</li>
                      <li>• Early morning fasting appointments</li>
                      <li>• Serving all Windermere neighborhoods</li>
                    </ul>
                    <div className="flex items-center text-conve-red mt-4 group-hover:underline">
                      Learn more <ArrowRight className="ml-2 h-4 w-4" />
                    </div>
                  </div>
                </div>
              </Link>
              
              <Link 
                to="/services/windermere/office-services" 
                className="group border border-gray-200 rounded-lg p-6 hover:border-conve-red hover:shadow-md transition-all"
              >
                <div className="flex items-start space-x-4">
                  <Users className="h-8 w-8 text-conve-red flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-xl font-semibold mb-2 group-hover:text-conve-red transition-colors">
                      Office Services in Windermere
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Keep your busy schedule on track with discreet and efficient blood draws 
                      at your Windermere workplace or business.
                    </p>
                    <ul className="text-sm text-gray-500 space-y-1">
                      <li>• Multiple employees per visit</li>
                      <li>• Minimal workplace disruption</li>
                      <li>• Corporate wellness programs</li>
                    </ul>
                    <div className="flex items-center text-conve-red mt-4 group-hover:underline">
                      Learn more <ArrowRight className="ml-2 h-4 w-4" />
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
          
          {/* Windermere Service Areas */}
          <div className="bg-gray-50 rounded-xl p-8 mb-12">
            <h2 className="text-3xl font-bold text-center mb-8">Windermere Service Areas We Cover</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {[
                "Windermere Proper",
                "Isleworth",
                "Keene's Pointe", 
                "The Reserve",
                "Lake Butler Sound",
                "Tilden's Grove",
                "Windermere Club",
                "Summerport",
                "The Willows",
                "Lake Down",
                "Horizon West",
                "Dr. Phillips (nearby)"
              ].map((area) => (
                <div key={area} className="flex items-center bg-white p-3 rounded-lg shadow-sm">
                  <MapPin className="h-4 w-4 text-conve-red mr-2 flex-shrink-0" />
                  <span className="text-sm font-medium">{area}</span>
                </div>
              ))}
            </div>
            <p className="text-center text-gray-600 mt-6">
              Don't see your area? <a href="tel:+1-855-CONVE-LAB" className="text-conve-red hover:underline">Call us</a> - we may still be able to serve you!
            </p>
          </div>

          {/* Why Choose ConveLabs in Windermere */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-12">
            <h2 className="text-3xl font-bold text-center mb-8">Why Windermere Residents Choose ConveLabs</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                "Local knowledge of Windermere traffic patterns",
                "Flexible scheduling around your busy lifestyle", 
                "Same-day appointments for urgent needs",
                "Certified, background-checked phlebotomists",
                "Hospital-grade equipment and safety protocols",
                "Seamless coordination with your healthcare providers",
                "Membership plans with significant savings",
                "Premium service at competitive rates"
              ].map((benefit, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-conve-red rounded-full mt-2 flex-shrink-0"></div>
                  <span className="text-gray-700">{benefit}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Call to Action */}
          <div className="text-center bg-conve-red/5 p-8 rounded-xl border border-conve-red/10">
            <h2 className="text-3xl font-bold mb-4">Ready to Experience Premium Service in Windermere?</h2>
            <p className="text-lg mb-6 max-w-2xl mx-auto">
              Join hundreds of Windermere residents who have simplified their lab testing experience 
              with our convenient, professional mobile phlebotomy services.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton 
                size="lg" 
                className="bg-conve-red hover:bg-conve-red/90"
                useQuickBooking={true}
              />
              <MembershipButton size="lg">
                Explore Membership Benefits
              </MembershipButton>
            </div>
            <p className="text-sm text-gray-600 mt-4">
              Service launching August 2025 • Early membership enrollment available now
            </p>
          </div>
        </div>
      </Container>
    </DashboardWrapper>
  );
};

export default Windermere;
