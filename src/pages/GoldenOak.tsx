import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Container } from '@/components/ui/container';
import { BookNowButton } from '@/components/ui/book-now-button';
import { MembershipButton } from '@/components/ui/membership-button';
import DashboardWrapper from '@/components/dashboards/DashboardWrapper';
import { Shield, Clock, Star, Phone, MapPin, CheckCircle, Crown } from 'lucide-react';

const GoldenOak: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>👑 Golden Oak Disney Mobile Lab | Luxury Resort Blood Work | ConveLabs | VIP Service | 941-527-9169</title>
        <meta 
          name="description" 
          content="⭐ Exclusive Mobile Lab Services for Golden Oak at Walt Disney World ⭐ Ultra-luxury blood work for Disney's most prestigious neighborhood. Same-day results, white-glove service for Four Seasons residents! 🏰"
        />
        <meta 
          name="keywords" 
          content="mobile lab services Golden Oak Disney, luxury phlebotomy Four Seasons Orlando, VIP blood work Disney Golden Oak, mobile blood draw Walt Disney World, concierge lab testing Disney resort, executive health screening Golden Oak, same day blood results Disney FL, mobile phlebotomy Disney luxury community"
        />
        
        {/* Enhanced SEO Meta Tags */}
        <meta name="author" content="ConveLabs Mobile Lab Services" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <meta name="geo.region" content="US-FL" />
        <meta name="geo.placename" content="Golden Oak, Bay Lake, Florida" />
        <meta name="geo.position" content="28.3844,-81.5707" />
        <meta name="ICBM" content="28.3844,-81.5707" />
        
        {/* Open Graph Tags */}
        <meta property="og:type" content="business.business" />
        <meta property="og:title" content="👑 Golden Oak Disney Mobile Lab | Luxury Resort Blood Work | ConveLabs" />
        <meta property="og:description" content="⭐ Exclusive Mobile Lab Services for Golden Oak at Walt Disney World ⭐ Ultra-luxury blood work for Disney's most prestigious neighborhood." />
        <meta property="og:url" content="https://convelabs.com/golden-oak" />
        <meta property="og:image" content="https://convelabs.com/golden-oak-disney-mobile-lab.jpg" />
        
        {/* Local Business Schema */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "ConveLabs Golden Oak Mobile Lab Services",
            "image": "https://convelabs.com/golden-oak-luxury-lab.jpg",
            "telephone": "+1-941-527-9169",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Golden Oak",
              "addressRegion": "Florida",
              "postalCode": "34747",
              "addressCountry": "US"
            },
            "geo": {
              "@type": "GeoCoordinates", 
              "latitude": 28.3844,
              "longitude": -81.5707
            },
            "url": "https://convelabs.com/golden-oak",
            "areaServed": {
              "@type": "City",
              "name": "Golden Oak",
              "description": "Ultra-exclusive mobile lab services for Golden Oak at Walt Disney World's luxury residential community"
            },
            "hasMap": "https://maps.google.com/?q=Golden+Oak+FL",
            "openingHours": "Mo-Su 06:00-22:00",
            "priceRange": "$$$$",
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "5.0",
              "reviewCount": "76"
            }
          })}
        </script>
        
        <link rel="canonical" href="https://convelabs.com/golden-oak" />
      </Helmet>

      <DashboardWrapper>
        <Container className="py-12">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-100 to-purple-50 border border-purple-200 rounded-full px-4 py-2 mb-6">
              <Crown className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-800">Serving Disney's Most Exclusive Community</span>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold font-playfair luxury-heading mb-6">
              Golden Oak Ultra-Luxury Mobile Lab
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto executive-focus">
              Exclusive mobile phlebotomy services for Golden Oak at Walt Disney World residents. 
              Experience Disney's magic with the convenience of luxury healthcare at your resort home.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton size="lg" />
              <MembershipButton variant="outline" size="lg" />
            </div>
          </div>

          {/* Disney-Level Trust Signals */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="text-center luxury-card p-6">
              <Clock className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Disney-Fast Service</h3>
              <p className="text-gray-600">Magical convenience on your schedule</p>
            </div>
            <div className="text-center luxury-card p-6">
              <Shield className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Resort-Grade Standards</h3>
              <p className="text-gray-600">Disney-quality excellence guaranteed</p>
            </div>
            <div className="text-center luxury-card p-6">
              <Crown className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">VIP Club Service</h3>
              <p className="text-gray-600">Ultra-exclusive member experience</p>
            </div>
          </div>

          {/* Golden Oak-Specific Services */}
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <div className="luxury-card p-8">
              <h2 className="text-2xl font-bold mb-4 font-playfair">Disney Resort Community</h2>
              <p className="text-gray-600 mb-6">
                Specialized mobile lab services for Golden Oak's ultra-exclusive Disney community, 
                including Four Seasons Resort guests and private club members.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Four Seasons Resort services</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Disney vacation home visits</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Club-level concierge coordination</span>
                </li>
              </ul>
            </div>

            <div className="luxury-card p-8">
              <h2 className="text-2xl font-bold mb-4 font-playfair">Ultra-Luxury Estate Services</h2>
              <p className="text-gray-600 mb-6">
                White-glove mobile lab services for Golden Oak's multi-million dollar estates, 
                with Disney-level attention to detail and magical service experience.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Private estate house calls</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Resort-style service delivery</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>VIP family health packages</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Service Areas */}
          <div className="luxury-card p-8 mb-16">
            <h2 className="text-2xl font-bold mb-6 font-playfair text-center">Magical Service Coverage</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <MapPin className="h-6 w-6 text-conve-red mx-auto mb-2" />
                <h3 className="font-semibold mb-2">Golden Oak Estates</h3>
                <p className="text-sm text-gray-600">Ultra-luxury private homes</p>
              </div>
              <div className="text-center">
                <MapPin className="h-6 w-6 text-conve-red mx-auto mb-2" />
                <h3 className="font-semibold mb-2">Four Seasons Resort</h3>
                <p className="text-sm text-gray-600">Resort guest services</p>
              </div>
              <div className="text-center">
                <MapPin className="h-6 w-6 text-conve-red mx-auto mb-2" />
                <h3 className="font-semibold mb-2">Private Club Facilities</h3>
                <p className="text-sm text-gray-600">Exclusive member amenities</p>
              </div>
            </div>
          </div>

          {/* Disney Magic Standards */}
          <div className="luxury-card p-8 mb-16">
            <h2 className="text-2xl font-bold mb-6 font-playfair text-center">The Disney Difference</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold text-lg mb-3">Magical Attention to Detail</h3>
                <p className="text-gray-600 mb-4">
                  Like Disney's legendary guest service, we anticipate your needs and exceed 
                  expectations with every interaction.
                </p>
                
                <h3 className="font-semibold text-lg mb-3">Resort-Level Hospitality</h3>
                <p className="text-gray-600">
                  Experience the same warm hospitality and professional excellence that 
                  Golden Oak residents expect from Disney.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-3">Ultra-Premium Discretion</h3>
                <p className="text-gray-600 mb-4">
                  Complete privacy and confidentiality that honors the exclusive nature 
                  of Disney's most prestigious community.
                </p>
                
                <h3 className="font-semibold text-lg mb-3">Same-Day Magic</h3>
                <p className="text-gray-600">
                  Rapid results delivery that doesn't interrupt your magical Disney 
                  vacation or business schedule.
                </p>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center luxury-gradient-bg p-12 rounded-2xl">
            <h2 className="text-3xl font-bold mb-4 font-playfair">Experience Disney-Level Healthcare Magic</h2>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Join Golden Oak's elite residents who trust ConveLabs for their health screening needs. 
              Book your magical mobile lab experience today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton size="lg" />
              <MembershipButton variant="outline" size="lg" />
            </div>
            <div className="mt-6 flex items-center justify-center gap-4 text-gray-600">
              <Phone className="h-5 w-5" />
              <span className="font-semibold">Direct VIP Line: 941-527-9169</span>
            </div>
          </div>
        </Container>
      </DashboardWrapper>
    </>
  );
};

export default GoldenOak;