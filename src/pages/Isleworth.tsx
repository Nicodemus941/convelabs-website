import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { BookNowButton } from '@/components/ui/book-now-button';
import { MembershipButton } from '@/components/ui/membership-button';
import DashboardWrapper from '@/components/dashboards/DashboardWrapper';
import { Shield, Clock, Star, Phone, MapPin, CheckCircle } from 'lucide-react';

const Isleworth: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>🏆 Isleworth Mobile Lab Services | VIP Blood Work | ConveLabs | Same-Day Results | 941-527-9169</title>
        <meta 
          name="description" 
          content="⭐ Exclusive Mobile Lab Services for Isleworth Residents ⭐ Luxury at-home blood work for golf community executives. Same-day results, HIPAA compliant. Serving Bay Hill Club, Phillips Point. Book VIP appointment! 🏌️‍♂️"
        />
        <meta 
          name="keywords" 
          content="mobile lab services Isleworth, VIP blood work Bay Hill Club, luxury phlebotomy Isleworth golf community, mobile blood draw Phillips Point, concierge lab testing Dr Phillips Country Club, executive health screening Isleworth, same day blood results Isleworth FL, mobile phlebotomy Isleworth Country Club"
        />
        
        {/* Enhanced SEO Meta Tags */}
        <meta name="author" content="ConveLabs Mobile Lab Services" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <meta name="geo.region" content="US-FL" />
        <meta name="geo.placename" content="Isleworth, Orlando, Florida" />
        <meta name="geo.position" content="28.4639,-81.5376" />
        <meta name="ICBM" content="28.4639,-81.5376" />
        
        {/* Open Graph Tags */}
        <meta property="og:type" content="business.business" />
        <meta property="og:title" content="🏆 Isleworth Mobile Lab Services | VIP Blood Work | ConveLabs" />
        <meta property="og:description" content="⭐ Exclusive Mobile Lab Services for Isleworth's golf community ⭐ Luxury at-home blood work with same-day results. HIPAA compliant, fully insured." />
        <meta property="og:url" content="https://convelabs.com/isleworth" />
        <meta property="og:image" content="https://convelabs.com/isleworth-mobile-lab.jpg" />
        
        {/* Local Business Schema */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "ConveLabs Isleworth Mobile Lab Services",
            "image": "https://convelabs.com/isleworth-luxury-lab.jpg",
            "telephone": "+1-941-527-9169",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Isleworth",
              "addressRegion": "Florida",
              "postalCode": "32836",
              "addressCountry": "US"
            },
            "geo": {
              "@type": "GeoCoordinates", 
              "latitude": 28.4639,
              "longitude": -81.5376
            },
            "url": "https://convelabs.com/isleworth",
            "areaServed": {
              "@type": "City",
              "name": "Isleworth",
              "description": "Exclusive mobile lab services for Isleworth's prestigious golf community and Bay Hill Club residents"
            },
            "hasMap": "https://maps.google.com/?q=Isleworth+FL",
            "openingHours": "Mo-Su 06:00-22:00",
            "priceRange": "$$$",
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "5.0",
              "reviewCount": "89"
            }
          })}
        </script>
        
        <link rel="canonical" href="https://convelabs.com/isleworth" />
      </Helmet>

      <DashboardWrapper>
        <Container className="py-12">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-yellow-100 to-yellow-50 border border-yellow-200 rounded-full px-4 py-2 mb-6">
              <Star className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-800">Serving Isleworth's Elite Community</span>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold font-playfair luxury-heading mb-6">
              Isleworth VIP Mobile Lab Services
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto executive-focus">
              Exclusive mobile phlebotomy services for Isleworth's distinguished golf community. 
              Experience luxury at-home blood work with the discretion and excellence you expect.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton size="lg" />
              <MembershipButton variant="outline" size="lg" />
            </div>
          </div>

          {/* Trust Signals */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="text-center luxury-card p-6">
              <Clock className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Same-Day Available</h3>
              <p className="text-gray-600">Quick scheduling for your busy lifestyle</p>
            </div>
            <div className="text-center luxury-card p-6">
              <Shield className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Certified & Insured</h3>
              <p className="text-gray-600">Licensed professionals you can trust</p>
            </div>
            <div className="text-center luxury-card p-6">
              <Star className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">VIP Service</h3>
              <p className="text-gray-600">White-glove experience every time</p>
            </div>
          </div>

          {/* Isleworth-Specific Services */}
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <div className="luxury-card p-8">
              <h2 className="text-2xl font-bold mb-4 font-playfair">Golf Community Services</h2>
              <p className="text-gray-600 mb-6">
                Specialized mobile lab services for Isleworth's active golf community, including 
                pre-tournament health screenings and executive wellness monitoring.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Pre-round health assessments</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Executive physical screenings</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Tournament medical clearance</span>
                </li>
              </ul>
            </div>

            <div className="luxury-card p-8">
              <h2 className="text-2xl font-bold mb-4 font-playfair">Estate Concierge Services</h2>
              <p className="text-gray-600 mb-6">
                White-glove mobile lab services for your Isleworth estate, with complete 
                discretion and professional excellence.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Private estate house calls</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Complete privacy protection</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Same-day result delivery</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Service Areas */}
          <div className="luxury-card p-8 mb-16">
            <h2 className="text-2xl font-bold mb-6 font-playfair text-center">Exclusive Service Coverage</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <MapPin className="h-6 w-6 text-conve-red mx-auto mb-2" />
                <h3 className="font-semibold mb-2">Isleworth Country Club</h3>
                <p className="text-sm text-gray-600">Complete golf community coverage</p>
              </div>
              <div className="text-center">
                <MapPin className="h-6 w-6 text-conve-red mx-auto mb-2" />
                <h3 className="font-semibold mb-2">Bay Hill Club</h3>
                <p className="text-sm text-gray-600">Adjacent luxury community</p>
              </div>
              <div className="text-center">
                <MapPin className="h-6 w-6 text-conve-red mx-auto mb-2" />
                <h3 className="font-semibold mb-2">Phillips Point</h3>
                <p className="text-sm text-gray-600">Exclusive waterfront estates</p>
              </div>
            </div>
          </div>

          {/* Why Choose ConveLabs */}
          <div className="luxury-card p-8 mb-16">
            <h2 className="text-2xl font-bold mb-6 font-playfair text-center">Why Isleworth Residents Choose ConveLabs</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold text-lg mb-3">Unmatched Discretion</h3>
                <p className="text-gray-600 mb-4">
                  We understand the privacy expectations of Isleworth's elite community and maintain 
                  the highest standards of confidentiality.
                </p>
                
                <h3 className="font-semibold text-lg mb-3">Golf-Friendly Scheduling</h3>
                <p className="text-gray-600">
                  Early morning and evening appointments that don't interfere with your tee times 
                  and club activities.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-3">Executive-Level Service</h3>
                <p className="text-gray-600 mb-4">
                  White-glove service that matches the luxury standards you expect in all 
                  aspects of your lifestyle.
                </p>
                
                <h3 className="font-semibold text-lg mb-3">Same-Day Results</h3>
                <p className="text-gray-600">
                  Rapid turnaround times for busy executives who need immediate health insights 
                  for important decisions.
                </p>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center luxury-gradient-bg p-12 rounded-2xl">
            <h2 className="text-3xl font-bold mb-4 font-playfair">Ready to Experience VIP Mobile Lab Services?</h2>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Join Isleworth's elite who trust ConveLabs for their health screening needs. 
              Book your exclusive appointment today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton size="lg" />
              <MembershipButton variant="outline" size="lg" />
            </div>
            <div className="mt-6 flex items-center justify-center gap-4 text-gray-600">
              <Phone className="h-5 w-5" />
              <span className="font-semibold">Call directly: 941-527-9169</span>
            </div>
          </div>
        </Container>
      </DashboardWrapper>
    </>
  );
};

export default Isleworth;