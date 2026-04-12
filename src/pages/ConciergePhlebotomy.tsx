import React from "react";
import { Helmet } from "react-helmet-async";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import { Container } from "@/components/ui/container";
import { BookNowButton } from "@/components/ui/book-now-button";
import { MembershipButton } from "@/components/ui/membership-button";
import { Crown, Clock, Shield, Star, Phone, MapPin } from "lucide-react";

const ConciergePhlebotomy: React.FC = () => {
  return (
    <DashboardWrapper>
      <Helmet>
        <title>Concierge Phlebotomy Central Florida | White-Glove Mobile Blood Draw Services | ConveLabs</title>
        <meta name="description" content="Premium concierge phlebotomy services throughout Central Florida. White-glove mobile blood draws with ultimate privacy, convenience, and luxury care for discerning clients in Orlando, Winter Park, and Windermere." />
        <meta name="keywords" content="concierge blood draw service Central Florida, concierge phlebotomy Orlando, white glove blood draw service, luxury mobile phlebotomy, VIP blood testing service, private phlebotomist Central Florida, concierge medical services Orlando" />
        
        {/* Open Graph */}
        <meta property="og:title" content="Concierge Phlebotomy Central Florida | White-Glove Services | ConveLabs" />
        <meta property="og:description" content="Premium concierge phlebotomy with white-glove service throughout Central Florida. Ultimate privacy and luxury care." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://convelabs.com/concierge-phlebotomy" />
        
        {/* Concierge Service Schema */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MedicalBusiness",
            "name": "ConveLabs Concierge Phlebotomy Services",
            "description": "Premium concierge phlebotomy and white-glove mobile blood draw services throughout Central Florida for discerning clients.",
            "url": "https://convelabs.com/concierge-phlebotomy",
            "serviceType": [
              "Concierge Phlebotomy",
              "White-Glove Blood Draw",
              "VIP Mobile Lab Services",
              "Private Phlebotomist Services"
            ],
            "areaServed": [
              "Orlando", "Winter Park", "Windermere", "Dr. Phillips", "Bay Hill",
              "Isleworth", "Lake Nona", "Celebration", "Heathrow"
            ],
            "specialty": ["Concierge Medicine", "Luxury Healthcare", "VIP Medical Services"]
          })}
        </script>
        
        <link rel="canonical" href="https://convelabs.com/concierge-phlebotomy" />
      </Helmet>

      <Container className="py-12">
        <div className="max-w-6xl mx-auto">
          {/* Concierge Hero Section */}
          <div className="text-center mb-16">
            <div className="flex justify-center mb-6">
              <Crown className="h-16 w-16 text-conve-gold" />
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              Concierge Phlebotomy Services
              <span className="block text-conve-red">White-Glove Care at Your Location</span>
            </h1>
            <p className="text-xl text-gray-700 mb-8 max-w-4xl mx-auto leading-relaxed">
              Experience the ultimate in personalized healthcare with ConveLabs' concierge phlebotomy services. 
              Our white-glove approach brings luxury lab testing directly to your home, office, yacht, or private location 
              throughout Central Florida with unmatched discretion and care.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <BookNowButton 
                size="lg" 
                className="bg-conve-red hover:bg-conve-red/90 px-8 py-4 text-lg"
                useQuickBooking={true}
              >
                Request Concierge Service
              </BookNowButton>
              <MembershipButton size="lg" className="px-8 py-4 text-lg">
                VIP Membership
              </MembershipButton>
            </div>
            <p className="text-sm text-gray-600 mt-4">
              Personal concierge available • 15-minute response time • Available 6 AM - 10 PM
            </p>
          </div>

          {/* Concierge Difference */}
          <div className="bg-gradient-to-r from-conve-gold/10 to-conve-red/10 rounded-xl p-8 mb-16">
            <h2 className="text-3xl font-bold text-center mb-8">The Concierge Difference</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <Star className="h-12 w-12 text-conve-gold mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-3">Personal Concierge</h3>
                <p className="text-gray-600">Dedicated concierge coordinator manages every detail of your appointment from scheduling to results delivery.</p>
              </div>
              <div className="text-center">
                <Clock className="h-12 w-12 text-conve-red mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-3">White-Glove Service</h3>
                <p className="text-gray-600">Luxury experience with attention to every detail, from arrival protocol to equipment presentation.</p>
              </div>
              <div className="text-center">
                <Shield className="h-12 w-12 text-conve-gold mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-3">Ultimate Discretion</h3>
                <p className="text-gray-600">Complete privacy with unmarked vehicles, private entrances, and confidentiality agreements available.</p>
              </div>
            </div>
          </div>

          {/* Concierge Service Features */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-16">
            <h2 className="text-3xl font-bold text-center mb-8">Concierge Service Features</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold mb-4 text-conve-red">Pre-Arrival Coordination</h3>
                <ul className="space-y-3 text-gray-600">
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    Personal concierge consultation to understand your preferences
                  </li>
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    Coordination with household staff or executive assistants
                  </li>
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    Private entrance and parking arrangements
                  </li>
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    Special timing requests for privacy and convenience
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-4 text-conve-red">During Service</h3>
                <ul className="space-y-3 text-gray-600">
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    Professional attire and presentation standards
                  </li>
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    Hospital-grade equipment in elegant presentation cases
                  </li>
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    Minimal disruption with efficient, quiet service
                  </li>
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    Multiple family members or employees per visit
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-4 text-conve-red">Results & Follow-up</h3>
                <ul className="space-y-3 text-gray-600">
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    Same-day results with secure delivery options
                  </li>
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    Direct coordination with your private physician
                  </li>
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    Concierge follow-up for scheduling future appointments
                  </li>
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    Priority scheduling for ongoing care needs
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-4 text-conve-red">Exclusive Perks</h3>
                <ul className="space-y-3 text-gray-600">
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    24/7 emergency availability for urgent needs
                  </li>
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    Yacht and marine location services
                  </li>
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    International travel health coordination
                  </li>
                  <li className="flex items-start">
                    <div className="w-2 h-2 bg-conve-gold rounded-full mt-2 mr-3 flex-shrink-0"></div>
                    Special event and holiday availability
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Concierge Locations */}
          <div className="bg-gray-50 rounded-xl p-8 mb-16">
            <h2 className="text-3xl font-bold text-center mb-8">Concierge Service Locations</h2>
            <p className="text-center text-gray-600 mb-8">
              White-glove concierge phlebotomy available at any location throughout Central Florida
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  title: "Private Residences",
                  locations: ["Luxury estates", "Gated communities", "High-rise condos", "Guest houses"]
                },
                {
                  title: "Executive Offices",
                  locations: ["C-suite offices", "Boardrooms", "Private conference rooms", "Executive suites"]
                },
                {
                  title: "Exclusive Venues",
                  locations: ["Private clubs", "Country clubs", "Yacht clubs", "Golf clubs"]
                },
                {
                  title: "Special Locations",
                  locations: ["Yachts & boats", "Private jets", "Hotel suites", "Event venues"]
                }
              ].map((category, index) => (
                <div key={index} className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-lg font-semibold mb-3 text-conve-red">{category.title}</h3>
                  <ul className="space-y-2">
                    {category.locations.map((location, locIndex) => (
                      <li key={locIndex} className="flex items-center text-sm text-gray-600">
                        <MapPin className="h-3 w-3 text-conve-gold mr-2 flex-shrink-0" />
                        {location}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Concierge Testimonial */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-16">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-6 w-6 text-conve-gold fill-current" />
                ))}
              </div>
              <blockquote className="text-xl italic text-gray-700 mb-6 max-w-3xl mx-auto">
                "ConveLabs' concierge service is exactly what busy executives need. They handled every detail seamlessly, 
                from coordinating with my assistant to delivering results directly to my physician. True white-glove service."
              </blockquote>
              <cite className="text-gray-600">— Central Florida Executive</cite>
            </div>
          </div>

          {/* Concierge CTA */}
          <div className="text-center bg-gradient-to-r from-conve-gold/5 to-conve-red/5 p-12 rounded-xl border border-conve-gold/20">
            <h2 className="text-4xl font-bold mb-6">Experience True Concierge Care</h2>
            <p className="text-xl mb-8 max-w-3xl mx-auto">
              Elevate your healthcare experience with our concierge phlebotomy services. Every detail is managed 
              with the attention and discretion you deserve.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center mb-6">
              <BookNowButton 
                size="lg" 
                className="bg-conve-red hover:bg-conve-red/90 px-8 py-4 text-lg"
                useQuickBooking={true}
              >
                Request Concierge Service
              </BookNowButton>
              <MembershipButton size="lg" className="px-8 py-4 text-lg">
                VIP Membership Details
              </MembershipButton>
            </div>
            <div className="flex justify-center items-center gap-4 text-sm text-gray-600">
              <Phone className="h-4 w-4" />
              <span>Personal Concierge: (407) XXX-XXXX • Available 6 AM - 10 PM</span>
            </div>
          </div>
        </div>
      </Container>
    </DashboardWrapper>
  );
};

export default ConciergePhlebotomy;