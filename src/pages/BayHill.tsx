import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Container } from '@/components/ui/container';
import { BookNowButton } from '@/components/ui/book-now-button';
import { MembershipButton } from '@/components/ui/membership-button';
import DashboardWrapper from '@/components/dashboards/DashboardWrapper';
import { Shield, Clock, Star, Phone, MapPin, CheckCircle, Trophy } from 'lucide-react';

const BayHill: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>🏌️ Bay Hill Club Mobile Lab | Arnold Palmer's Community | ConveLabs | VIP Blood Work | 941-527-9169</title>
        <meta 
          name="description" 
          content="⭐ Exclusive Mobile Lab Services for Bay Hill Club & Lodge ⭐ VIP blood work for Arnold Palmer's legendary golf community. Same-day results, HIPAA compliant. Tournament-ready health screening! 🏆"
        />
        <meta 
          name="keywords" 
          content="mobile lab services Bay Hill Club, VIP blood work Arnold Palmer community, luxury phlebotomy Bay Hill Lodge, mobile blood draw Bay Hill Invitational, concierge lab testing Orlando golf, executive health screening Bay Hill, same day blood results Bay Hill FL, mobile phlebotomy Bay Hill Country Club"
        />
        
        {/* Enhanced SEO Meta Tags */}
        <meta name="author" content="ConveLabs Mobile Lab Services" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <meta name="geo.region" content="US-FL" />
        <meta name="geo.placename" content="Bay Hill, Orlando, Florida" />
        <meta name="geo.position" content="28.4531,-81.5087" />
        <meta name="ICBM" content="28.4531,-81.5087" />
        
        {/* Open Graph Tags */}
        <meta property="og:type" content="business.business" />
        <meta property="og:title" content="🏌️ Bay Hill Club Mobile Lab | Arnold Palmer's Community | ConveLabs" />
        <meta property="og:description" content="⭐ Exclusive Mobile Lab Services for Bay Hill Club & Lodge ⭐ VIP blood work for the legendary golf community with same-day results." />
        <meta property="og:url" content="https://convelabs.com/bay-hill" />
        <meta property="og:image" content="https://convelabs.com/bay-hill-mobile-lab.jpg" />
        
        {/* Local Business Schema */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "ConveLabs Bay Hill Mobile Lab Services",
            "image": "https://convelabs.com/bay-hill-golf-lab.jpg",
            "telephone": "+1-941-527-9169",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Bay Hill",
              "addressRegion": "Florida", 
              "postalCode": "32819",
              "addressCountry": "US"
            },
            "geo": {
              "@type": "GeoCoordinates",
              "latitude": 28.4531,
              "longitude": -81.5087
            },
            "url": "https://convelabs.com/bay-hill",
            "areaServed": {
              "@type": "City",
              "name": "Bay Hill",
              "description": "Exclusive mobile lab services for Bay Hill Club & Lodge and Arnold Palmer's legendary golf community"
            },
            "hasMap": "https://maps.google.com/?q=Bay+Hill+Orlando+FL",
            "openingHours": "Mo-Su 06:00-22:00",
            "priceRange": "$$$",
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "5.0",
              "reviewCount": "94"
            }
          })}
        </script>
        
        <link rel="canonical" href="https://convelabs.com/bay-hill" />
      </Helmet>

      <DashboardWrapper>
        <Container className="py-12">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-green-100 to-green-50 border border-green-200 rounded-full px-4 py-2 mb-6">
              <Trophy className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">Serving Arnold Palmer's Legendary Community</span>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold font-playfair luxury-heading mb-6">
              Bay Hill Club VIP Mobile Lab
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto executive-focus">
              Exclusive mobile phlebotomy services for Bay Hill Club & Lodge members and residents. 
              Tournament-quality healthcare with the excellence that defines Arnold Palmer's legacy.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton size="lg" />
              <MembershipButton variant="outline" size="lg" />
            </div>
          </div>

          {/* Championship Trust Signals */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="text-center luxury-card p-6">
              <Clock className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Tournament-Day Ready</h3>
              <p className="text-gray-600">Quick health screening for members and guests</p>
            </div>
            <div className="text-center luxury-card p-6">
              <Shield className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Championship Standards</h3>
              <p className="text-gray-600">Arnold Palmer's legacy of excellence</p>
            </div>
            <div className="text-center luxury-card p-6">
              <Trophy className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">VIP Club Service</h3>
              <p className="text-gray-600">Member-exclusive healthcare experience</p>
            </div>
          </div>

          {/* Bay Hill-Specific Services */}
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <div className="luxury-card p-8">
              <h2 className="text-2xl font-bold mb-4 font-playfair">Championship Golf Community</h2>
              <p className="text-gray-600 mb-6">
                Specialized mobile lab services for Bay Hill Club's prestigious membership, 
                including tournament health clearances and executive wellness programs.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Pre-tournament medical clearance</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Member executive physicals</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Invitational guest services</span>
                </li>
              </ul>
            </div>

            <div className="luxury-card p-8">
              <h2 className="text-2xl font-bold mb-4 font-playfair">Lodge & Residential Services</h2>
              <p className="text-gray-600 mb-6">
                White-glove mobile lab services for Bay Hill Lodge guests and community 
                residents, maintaining the highest standards of hospitality.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Lodge guest room service</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Residential community calls</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Tournament week availability</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Service Areas */}
          <div className="luxury-card p-8 mb-16">
            <h2 className="text-2xl font-bold mb-6 font-playfair text-center">Championship Service Coverage</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <MapPin className="h-6 w-6 text-conve-red mx-auto mb-2" />
                <h3 className="font-semibold mb-2">Bay Hill Club & Lodge</h3>
                <p className="text-sm text-gray-600">Full club and lodge coverage</p>
              </div>
              <div className="text-center">
                <MapPin className="h-6 w-6 text-conve-red mx-auto mb-2" />
                <h3 className="font-semibold mb-2">Tournament Facilities</h3>
                <p className="text-sm text-gray-600">Championship course access</p>
              </div>
              <div className="text-center">
                <MapPin className="h-6 w-6 text-conve-red mx-auto mb-2" />
                <h3 className="font-semibold mb-2">Residential Community</h3>
                <p className="text-sm text-gray-600">Private homes and estates</p>
              </div>
            </div>
          </div>

          {/* Arnold Palmer Legacy */}
          <div className="luxury-card p-8 mb-16">
            <h2 className="text-2xl font-bold mb-6 font-playfair text-center">The Arnold Palmer Standard</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold text-lg mb-3">Championship Excellence</h3>
                <p className="text-gray-600 mb-4">
                  Like Arnold Palmer's legendary golf career, we deliver excellence in every 
                  interaction, maintaining the highest standards of professional service.
                </p>
                
                <h3 className="font-semibold text-lg mb-3">Tournament-Level Precision</h3>
                <p className="text-gray-600">
                  Precision timing and execution that meets the demanding schedules of 
                  championship events and busy club activities.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-3">Member-First Service</h3>
                <p className="text-gray-600 mb-4">
                  Personalized attention that honors Bay Hill's tradition of treating 
                  every member like a champion.
                </p>
                
                <h3 className="font-semibold text-lg mb-3">Legendary Discretion</h3>
                <p className="text-gray-600">
                  Complete confidentiality that respects the privacy expectations of 
                  Bay Hill's distinguished membership.
                </p>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center luxury-gradient-bg p-12 rounded-2xl">
            <h2 className="text-3xl font-bold mb-4 font-playfair">Champion Your Health at Bay Hill</h2>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Experience the same excellence in healthcare that Bay Hill brings to golf. 
              Book your championship-level mobile lab service today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton size="lg" />
              <MembershipButton variant="outline" size="lg" />
            </div>
            <div className="mt-6 flex items-center justify-center gap-4 text-gray-600">
              <Phone className="h-5 w-5" />
              <span className="font-semibold">Direct Champion Line: 941-527-9169</span>
            </div>
          </div>
        </Container>
      </DashboardWrapper>
    </>
  );
};

export default BayHill;