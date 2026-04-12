import React from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { BookNowButton } from "@/components/ui/book-now-button";
import { MembershipButton } from "@/components/ui/membership-button";
import { ArrowRight, MapPin, Clock, Shield, Award, Users, Heart } from "lucide-react";

const Celebration: React.FC = () => {
  const handleMembershipRedirect = () => {
    window.location.href = "/onboarding/plan-selection?source=celebration";
  };

  const handleBookingRedirect = () => {
    window.location.href = "/book-now?source=celebration";
  };

  return (
    <DashboardWrapper>
      <Helmet>
        <title>Celebration Mobile Phlebotomy Services | At-Home Blood Draws | ConveLabs</title>
        <meta name="description" content="Premium mobile phlebotomy services in Celebration, FL. Professional at-home and office blood draws in Disney's Celebration community and surrounding areas. Same-day appointments available." />
        <meta name="keywords" content="Celebration phlebotomy, mobile blood draw Celebration, at-home lab services Celebration, Disney Celebration blood draw, Celebration lab testing, mobile lab services Florida" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:title" content="Celebration Mobile Phlebotomy Services | ConveLabs" />
        <meta property="og:description" content="Premium mobile phlebotomy services in Celebration, FL. Professional at-home and office blood draws with same-day appointments." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://convelabs.com/celebration" />
        <meta property="og:image" content="https://convelabs.com/images/celebration-mobile-phlebotomy.jpg" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Celebration Mobile Phlebotomy Services | ConveLabs" />
        <meta name="twitter:description" content="Premium mobile phlebotomy services in Celebration, FL. Professional at-home and office blood draws." />
        <meta name="twitter:image" content="https://convelabs.com/images/celebration-mobile-phlebotomy.jpg" />
        
        {/* Local Business Schema */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "ConveLabs Celebration",
            "description": "Premium mobile phlebotomy services in Celebration, Florida",
            "url": "https://convelabs.com/celebration",
            "telephone": "+1-855-CONVE-LAB",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Celebration",
              "addressRegion": "FL",
              "addressCountry": "US"
            },
            "geo": {
              "@type": "GeoCoordinates",
              "latitude": "28.3256",
              "longitude": "-81.5320"
            },
            "serviceArea": {
              "@type": "GeoCircle",
              "geoMidpoint": {
                "@type": "GeoCoordinates",
                "latitude": "28.3256",
                "longitude": "-81.5320"
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
        
        <link rel="canonical" href="https://convelabs.com/celebration" />
      </Helmet>

      <Container className="py-12">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Premium Mobile Phlebotomy Services in <span className="text-conve-red">Celebration, Florida</span>
            </h1>
            <p className="text-xl text-gray-700 mb-8 max-w-3xl mx-auto">
              Experience the convenience of professional blood draws at your Celebration home or office. 
              Our certified phlebotomists serve Disney's Celebration community and all surrounding areas 
              with same-day appointments available.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton 
                size="lg" 
                className="bg-conve-red hover:bg-conve-red/90"
                useQuickBooking={true}
              />
              <MembershipButton size="lg" />
            </div>
          </div>

          {/* Key Benefits */}
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="text-center p-6 bg-gray-50 rounded-xl">
              <Clock className="h-12 w-12 text-conve-red mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Same-Day Available</h3>
              <p className="text-gray-600">Emergency and routine appointments available throughout Celebration</p>
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
          
          {/* Our Celebration Services */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-12">
            <h2 className="text-3xl font-bold text-center mb-8">Our Celebration Services</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <Link 
                to="/services/celebration/home-blood-draws" 
                className="group border border-gray-200 rounded-lg p-6 hover:border-conve-red hover:shadow-md transition-all"
              >
                <div className="flex items-start space-x-4">
                  <Heart className="h-8 w-8 text-conve-red flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-xl font-semibold mb-2 group-hover:text-conve-red transition-colors">
                      At-Home Blood Draws in Celebration
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Professional phlebotomists come directly to your Celebration residence, providing 
                      the premium service that matches the quality of life in Disney's community.
                    </p>
                    <ul className="text-sm text-gray-500 space-y-1">
                      <li>• Perfect for families with children</li>
                      <li>• Early morning fasting appointments</li>
                      <li>• Serving all Celebration neighborhoods</li>
                    </ul>
                    <div className="flex items-center text-conve-red mt-4 group-hover:underline">
                      Learn more <ArrowRight className="ml-2 h-4 w-4" />
                    </div>
                  </div>
                </div>
              </Link>
              
              <Link 
                to="/services/celebration/office-services" 
                className="group border border-gray-200 rounded-lg p-6 hover:border-conve-red hover:shadow-md transition-all"
              >
                <div className="flex items-start space-x-4">
                  <Users className="h-8 w-8 text-conve-red flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-xl font-semibold mb-2 group-hover:text-conve-red transition-colors">
                      Office Services in Celebration
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Keep your busy schedule on track with discreet and efficient blood draws 
                      at your Celebration workplace or business.
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
          
          {/* Celebration Service Areas */}
          <div className="bg-gray-50 rounded-xl p-8 mb-12">
            <h2 className="text-3xl font-bold text-center mb-8">Celebration Service Areas We Cover</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {[
                "Downtown Celebration",
                "Artisan Park",
                "Aquila Loop",
                "Celebration Village",
                "Campus Street",
                "Water Street",
                "Sycamore Street",
                "Celebration Golf Club",
                "Four Seasons Resort",
                "Kissimmee (nearby)",
                "ChampionsGate (nearby)",
                "Reunion (nearby)"
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

          {/* Why Choose ConveLabs in Celebration */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-12">
            <h2 className="text-3xl font-bold text-center mb-8">Why Celebration Residents Choose ConveLabs</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                "Familiar with Celebration's unique community layout",
                "Flexible scheduling around your Disney lifestyle", 
                "Same-day appointments for urgent needs",
                "Certified, background-checked phlebotomists",
                "Hospital-grade equipment and safety protocols",
                "Seamless coordination with your healthcare providers",
                "Membership plans with significant savings",
                "Premium service matching Celebration's standards"
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
            <h2 className="text-3xl font-bold mb-4">Ready to Experience Premium Service in Celebration?</h2>
            <p className="text-lg mb-6 max-w-2xl mx-auto">
              Join hundreds of Celebration residents who have simplified their lab testing experience 
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

export default Celebration;
