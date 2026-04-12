import React from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import { Container } from "@/components/ui/container";
import { BookNowButton } from "@/components/ui/book-now-button";
import { MembershipButton } from "@/components/ui/membership-button";
import { Shield, Crown, Clock, Award, MapPin, Phone, Star } from "lucide-react";

const LuxuryMobilePhlebotomy: React.FC = () => {
  return (
    <DashboardWrapper>
      <Helmet>
        <title>Luxury Mobile Phlebotomy Orlando | VIP Concierge Blood Draw Services | ConveLabs</title>
        <meta name="description" content="Central Florida's premier luxury mobile phlebotomy service for high-net-worth individuals, executives, and discerning families. White-glove concierge blood draws at your estate, yacht, or private office with ultimate discretion and same-day results." />
        <meta name="keywords" content="luxury mobile phlebotomy Orlando, concierge blood draw service Central Florida, private mobile lab testing Orlando, executive health screening at home Orlando, VIP mobile blood work Winter Park, premium home lab services Windermere, white glove medical services, yacht mobile phlebotomy" />
        
        {/* Open Graph for luxury market */}
        <meta property="og:title" content="Luxury Mobile Phlebotomy Orlando | VIP Concierge Services | ConveLabs" />
        <meta property="og:description" content="Central Florida's most exclusive mobile phlebotomy service. White-glove blood draws for executives, celebrities, and high-net-worth families." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://convelabs.com/luxury-mobile-phlebotomy" />
        <meta property="og:image" content="https://convelabs.com/luxury-services-hero.jpg" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Luxury Mobile Phlebotomy Orlando | VIP Services" />
        <meta name="twitter:description" content="Exclusive concierge blood draw services for Central Florida's elite." />
        
        {/* Luxury Medical Service Schema */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MedicalBusiness",
            "name": "ConveLabs Luxury Mobile Phlebotomy",
            "description": "Central Florida's most exclusive mobile phlebotomy and concierge lab services for high-net-worth individuals, executives, celebrities, and discerning families.",
            "url": "https://convelabs.com/luxury-mobile-phlebotomy",
            "telephone": "+1-407-XXX-XXXX",
            "priceRange": "$$$$",
            "image": "https://convelabs.com/luxury-mobile-phlebotomy.jpg",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Orlando",
              "addressRegion": "FL",
              "addressCountry": "US",
              "areaServed": [
                "Isleworth", "Bay Hill", "Windermere", "Dr. Phillips", "Winter Park",
                "Golden Oak", "Lake Nona", "Celebration", "Heathrow"
              ]
            },
            "serviceType": [
              "Luxury Mobile Phlebotomy",
              "VIP Concierge Blood Draw",
              "Executive Health Screening",
              "Yacht Mobile Lab Services",
              "Private Estate Lab Testing"
            ],
            "specialty": ["Luxury Healthcare", "Concierge Medicine", "Executive Health"],
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "5.0",
              "reviewCount": "89"
            }
          })}
        </script>
        
        <link rel="canonical" href="https://convelabs.com/luxury-mobile-phlebotomy" />
      </Helmet>

      <Container className="py-12">
        <div className="max-w-6xl mx-auto">
          {/* Luxury Hero Section */}
          <div className="text-center mb-16">
            <div className="flex justify-center mb-6">
              <Crown className="h-16 w-16 text-conve-gold" />
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              Central Florida's Most Exclusive
              <span className="block text-conve-red">Mobile Phlebotomy Service</span>
            </h1>
            <p className="text-xl text-gray-700 mb-8 max-w-4xl mx-auto leading-relaxed">
              Experience the pinnacle of luxury healthcare with ConveLabs' white-glove mobile phlebotomy services. 
              Trusted by executives, celebrities, and Central Florida's most discerning families for ultimate 
              privacy, convenience, and concierge-level care.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <BookNowButton 
                size="lg" 
                className="bg-conve-red hover:bg-conve-red/90 px-8 py-4 text-lg"
                useQuickBooking={true}
              >
                Schedule VIP Appointment
              </BookNowButton>
              <MembershipButton size="lg" className="px-8 py-4 text-lg">
                Explore Elite Membership
              </MembershipButton>
            </div>
            <p className="text-sm text-gray-600 mt-4">
              Concierge response within 15 minutes • Available 6 AM - 10 PM
            </p>
          </div>

          {/* Luxury Trust Signals */}
          <div className="bg-gradient-to-r from-conve-gold/10 to-conve-red/10 rounded-xl p-8 mb-16">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4">Trusted by Central Florida's Elite</h2>
              <div className="flex justify-center items-center gap-8 flex-wrap">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-conve-gold fill-current" />
                  <span className="font-semibold">500+ VIP Clients</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-conve-red" />
                  <span className="font-semibold">HIPAA Compliant</span>
                </div>
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-conve-gold" />
                  <span className="font-semibold">Fully Insured</span>
                </div>
              </div>
            </div>
          </div>

          {/* Luxury Service Offerings */}
          <div className="mb-16">
            <h2 className="text-4xl font-bold text-center mb-12">Exclusive Service Portfolio</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  title: "Estate Concierge Service",
                  description: "White-glove blood draws at your luxury estate with complete privacy and discretion.",
                  features: ["Private entrance protocol", "Coordinated with household staff", "Multiple family members"]
                },
                {
                  title: "Yacht & Marine Services",
                  description: "Mobile lab services aboard your yacht or at exclusive marinas throughout Central Florida.",
                  features: ["Dock-side service", "International travel prep", "Marine insurance coordination"]
                },
                {
                  title: "Executive Office Visits",
                  description: "Seamless lab services at your C-suite office or private business location.",
                  features: ["Minimal business disruption", "Boardroom privacy", "Same-day results"]
                },
                {
                  title: "Country Club Partnerships",
                  description: "Preferred provider at select Central Florida private clubs and luxury communities.",
                  features: ["Club coordination", "Member pricing", "Preferred scheduling"]
                },
                {
                  title: "Celebrity & Public Figure Care",
                  description: "Ultra-discrete services for high-profile clients requiring maximum confidentiality.",
                  features: ["NDAs available", "Security coordination", "Private entrance/exit"]
                },
                {
                  title: "International Executive Prep",
                  description: "Comprehensive travel health screening for private jet travelers and global executives.",
                  features: ["Travel medicine coordination", "International requirements", "Expedited processing"]
                }
              ].map((service, index) => (
                <div key={index} className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 hover:border-conve-gold/50 transition-all">
                  <h3 className="text-xl font-semibold mb-3 text-conve-black">{service.title}</h3>
                  <p className="text-gray-600 mb-4">{service.description}</p>
                  <ul className="space-y-2">
                    {service.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center text-sm text-gray-500">
                        <div className="w-1.5 h-1.5 bg-conve-gold rounded-full mr-3"></div>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Luxury Areas Served */}
          <div className="bg-gray-50 rounded-xl p-8 mb-16">
            <h2 className="text-3xl font-bold text-center mb-8">Exclusive Service Areas</h2>
            <p className="text-center text-gray-600 mb-8">
              Serving Central Florida's most prestigious communities and luxury developments
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
              {[
                "Isleworth", "Bay Hill", "Windermere", "Dr. Phillips",
                "Winter Park", "Golden Oak", "Lake Nona", "Celebration",
                "Heathrow", "Keene's Pointe", "The Reserve", "Grande Lakes"
              ].map((area) => (
                <div key={area} className="flex items-center bg-white p-3 rounded-lg shadow-sm">
                  <MapPin className="h-4 w-4 text-conve-gold mr-2 flex-shrink-0" />
                  <span className="text-sm font-medium">{area}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Premium Benefits */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-16">
            <h2 className="text-3xl font-bold text-center mb-8">The ConveLabs Luxury Difference</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                "15-minute concierge response time",
                "Board-certified phlebotomists only",
                "Hospital-grade equipment & protocols",
                "Same-day results with secure delivery",
                "Coordinated with private physicians",
                "Membership discounts up to 40%",
                "24/7 emergency availability",
                "Complete HIPAA compliance & NDAs",
                "Preferred scheduling priority"
              ].map((benefit, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 flex-shrink-0"></div>
                  <span className="text-gray-700">{benefit}</span>
                </div>
              ))}
            </div>
          </div>

          {/* VIP Call to Action */}
          <div className="text-center bg-gradient-to-r from-conve-red/5 to-conve-gold/5 p-12 rounded-xl border border-conve-red/10">
            <h2 className="text-4xl font-bold mb-6">Experience Luxury Healthcare</h2>
            <p className="text-xl mb-8 max-w-3xl mx-auto">
              Join Central Florida's most discerning clients who trust ConveLabs for their most important health needs. 
              Available for immediate VIP consultation.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center mb-6">
              <BookNowButton 
                size="lg" 
                className="bg-conve-red hover:bg-conve-red/90 px-8 py-4 text-lg"
                useQuickBooking={true}
              >
                Schedule VIP Consultation
              </BookNowButton>
              <MembershipButton size="lg" className="px-8 py-4 text-lg">
                Elite Membership Info
              </MembershipButton>
            </div>
            <div className="flex justify-center items-center gap-4 text-sm text-gray-600">
              <Phone className="h-4 w-4" />
              <span>VIP Concierge: Available 6 AM - 10 PM Daily</span>
            </div>
          </div>
        </div>
      </Container>
    </DashboardWrapper>
  );
};

export default LuxuryMobilePhlebotomy;