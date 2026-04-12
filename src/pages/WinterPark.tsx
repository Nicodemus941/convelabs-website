import React from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { BookNowButton } from "@/components/ui/book-now-button";
import { MembershipButton } from "@/components/ui/membership-button";
import { ArrowRight, MapPin, Clock, Shield, Award, Users, Heart } from "lucide-react";

const WinterPark: React.FC = () => {
  return (
    <DashboardWrapper>
      <Helmet>
        <title>Winter Park Mobile Phlebotomy Services | At-Home Blood Draws | ConveLabs</title>
        <meta name="description" content="Premium mobile phlebotomy services in Winter Park, FL. Professional at-home and office blood draws on Park Avenue, Hannibal Square, and surrounding areas. Same-day appointments available." />
        <meta name="keywords" content="Winter Park phlebotomy, mobile blood draw Winter Park, at-home lab services Winter Park, Park Avenue blood draw, Winter Park lab testing, mobile lab services Florida" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:title" content="Winter Park Mobile Phlebotomy Services | ConveLabs" />
        <meta property="og:description" content="Premium mobile phlebotomy services in Winter Park, FL. Professional at-home and office blood draws with same-day appointments." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://convelabs.com/winter-park" />
        <meta property="og:image" content="https://convelabs.com/images/winter-park-mobile-phlebotomy.jpg" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Winter Park Mobile Phlebotomy Services | ConveLabs" />
        <meta name="twitter:description" content="Premium mobile phlebotomy services in Winter Park, FL. Professional at-home and office blood draws." />
        <meta name="twitter:image" content="https://convelabs.com/images/winter-park-mobile-phlebotomy.jpg" />
        
        {/* Local Business Schema */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "ConveLabs Winter Park",
            "description": "Premium mobile phlebotomy services in Winter Park, Florida",
            "url": "https://convelabs.com/winter-park",
            "telephone": "+1-855-CONVE-LAB",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Winter Park",
              "addressRegion": "FL",
              "addressCountry": "US"
            },
            "geo": {
              "@type": "GeoCoordinates",
              "latitude": "28.5998",
              "longitude": "-81.3392"
            },
            "serviceArea": {
              "@type": "GeoCircle",
              "geoMidpoint": {
                "@type": "GeoCoordinates",
                "latitude": "28.5998",
                "longitude": "-81.3392"
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
        
        <link rel="canonical" href="https://convelabs.com/winter-park" />
      </Helmet>

      <Container className="py-12">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Premium Mobile Phlebotomy Services in <span className="text-conve-red">Winter Park, Florida</span>
            </h1>
            <p className="text-xl text-gray-700 mb-8 max-w-3xl mx-auto">
              Experience the convenience of professional blood draws at your Winter Park home or office. 
              Our certified phlebotomists serve the Park Avenue District, Hannibal Square, and all surrounding communities 
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
              <p className="text-gray-600">Emergency and routine appointments available throughout Winter Park</p>
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
          
          {/* Our Winter Park Services */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-12">
            <h2 className="text-3xl font-bold text-center mb-8">Our Winter Park Services</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <Link 
                to="/services/winter-park/home-blood-draws" 
                className="group border border-gray-200 rounded-lg p-6 hover:border-conve-red hover:shadow-md transition-all"
              >
                <div className="flex items-start space-x-4">
                  <Heart className="h-8 w-8 text-conve-red flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-xl font-semibold mb-2 group-hover:text-conve-red transition-colors">
                      At-Home Blood Draws in Winter Park
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Professional phlebotomists come directly to your Winter Park residence, providing 
                      the luxury and privacy that Winter Park residents expect.
                    </p>
                    <ul className="text-sm text-gray-500 space-y-1">
                      <li>• Perfect for families with children</li>
                      <li>• Early morning fasting appointments</li>
                      <li>• Serving all Winter Park neighborhoods</li>
                    </ul>
                    <div className="flex items-center text-conve-red mt-4 group-hover:underline">
                      Learn more <ArrowRight className="ml-2 h-4 w-4" />
                    </div>
                  </div>
                </div>
              </Link>
              
              <Link 
                to="/services/winter-park/office-services" 
                className="group border border-gray-200 rounded-lg p-6 hover:border-conve-red hover:shadow-md transition-all"
              >
                <div className="flex items-start space-x-4">
                  <Users className="h-8 w-8 text-conve-red flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-xl font-semibold mb-2 group-hover:text-conve-red transition-colors">
                      Office Services in Winter Park
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Keep your busy schedule on track with discreet and efficient blood draws 
                      at your Winter Park workplace or business.
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
          
          {/* Winter Park Service Areas */}
          <div className="bg-gray-50 rounded-xl p-8 mb-12">
            <h2 className="text-3xl font-bold text-center mb-8">Winter Park Service Areas We Cover</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {[
                "Park Avenue District",
                "Hannibal Square",
                "Winter Park Pines",
                "Baldwin Park",
                "Aloma",
                "Goldenrod",
                "Winter Park Estates",
                "Winter Park Village",
                "Casselberry (border)",
                "Maitland (nearby)",
                "College Park (nearby)",
                "Orlando (border)"
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

          {/* Why Choose ConveLabs in Winter Park */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-12">
            <h2 className="text-3xl font-bold text-center mb-8">Why Winter Park Residents Choose ConveLabs</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                "Local knowledge of Park Avenue traffic patterns",
                "Flexible scheduling around your busy lifestyle", 
                "Same-day appointments for urgent needs",
                "Certified, background-checked phlebotomists",
                "Hospital-grade equipment and safety protocols",
                "Seamless coordination with your healthcare providers",
                "Membership plans with significant savings",
                "Premium service matching Winter Park's standards"
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
            <h2 className="text-3xl font-bold mb-4">Ready to Experience Premium Service in Winter Park?</h2>
            <p className="text-lg mb-6 max-w-2xl mx-auto">
              Join hundreds of Winter Park residents who have simplified their lab testing experience 
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

export default WinterPark;
