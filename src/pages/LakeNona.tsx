import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Container } from '@/components/ui/container';
import { BookNowButton } from '@/components/ui/book-now-button';
import { MembershipButton } from '@/components/ui/membership-button';
import DashboardWrapper from '@/components/dashboards/DashboardWrapper';
import { Shield, Clock, Star, Phone, MapPin, CheckCircle, Heart } from 'lucide-react';

const LakeNona: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>🏥 Lake Nona Medical City Mobile Lab | Innovation District | ConveLabs | Executive Health | 941-527-9169</title>
        <meta 
          name="description" 
          content="⭐ Premier Mobile Lab Services for Lake Nona Medical City ⭐ Executive blood work for Central Florida's innovation district. Same-day results for busy professionals, medical executives, and tech leaders! 🚀"
        />
        <meta 
          name="keywords" 
          content="mobile lab services Lake Nona Medical City, executive phlebotomy Lake Nona innovation district, VIP blood work Nemours Children's Hospital, mobile blood draw UCF College of Medicine, concierge lab testing Lake Nona Town Center, same day blood results Lake Nona FL, mobile phlebotomy medical professionals"
        />
        
        {/* Enhanced SEO Meta Tags */}
        <meta name="author" content="ConveLabs Mobile Lab Services" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <meta name="geo.region" content="US-FL" />
        <meta name="geo.placename" content="Lake Nona, Orlando, Florida" />
        <meta name="geo.position" content="28.4158,-81.3081" />
        <meta name="ICBM" content="28.4158,-81.3081" />
        
        {/* Open Graph Tags */}
        <meta property="og:type" content="business.business" />
        <meta property="og:title" content="🏥 Lake Nona Medical City Mobile Lab | Innovation District | ConveLabs" />
        <meta property="og:description" content="⭐ Premier Mobile Lab Services for Lake Nona Medical City ⭐ Executive blood work for Central Florida's innovation district professionals." />
        <meta property="og:url" content="https://convelabs.com/lake-nona" />
        <meta property="og:image" content="https://convelabs.com/lake-nona-medical-city-mobile-lab.jpg" />
        
        {/* Local Business Schema */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "ConveLabs Lake Nona Mobile Lab Services",
            "image": "https://convelabs.com/lake-nona-innovation-lab.jpg",
            "telephone": "+1-941-527-9169",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Lake Nona",
              "addressRegion": "Florida",
              "postalCode": "32827",
              "addressCountry": "US"
            },
            "geo": {
              "@type": "GeoCoordinates", 
              "latitude": 28.4158,
              "longitude": -81.3081
            },
            "url": "https://convelabs.com/lake-nona",
            "areaServed": {
              "@type": "City",
              "name": "Lake Nona",
              "description": "Innovative mobile lab services for Lake Nona Medical City and innovation district professionals"
            },
            "hasMap": "https://maps.google.com/?q=Lake+Nona+Orlando+FL",
            "openingHours": "Mo-Su 06:00-22:00",
            "priceRange": "$$$",
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "5.0",
              "reviewCount": "112"
            }
          })}
        </script>
        
        <link rel="canonical" href="https://convelabs.com/lake-nona" />
      </Helmet>

      <DashboardWrapper>
        <Container className="py-12">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-100 to-blue-50 border border-blue-200 rounded-full px-4 py-2 mb-6">
              <Heart className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Serving Central Florida's Innovation District</span>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold font-playfair luxury-heading mb-6">
              Lake Nona Medical City Mobile Lab
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto executive-focus">
              Premier mobile phlebotomy services for Lake Nona's medical professionals, tech executives, 
              and innovation district leaders. Advanced healthcare for Central Florida's smartest community.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton size="lg" />
              <MembershipButton variant="outline" size="lg" />
            </div>
          </div>

          {/* Innovation Trust Signals */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="text-center luxury-card p-6">
              <Clock className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Innovation-Speed Service</h3>
              <p className="text-gray-600">Tech-fast scheduling and results</p>
            </div>
            <div className="text-center luxury-card p-6">
              <Shield className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Medical-Grade Standards</h3>
              <p className="text-gray-600">Healthcare professional approved</p>
            </div>
            <div className="text-center luxury-card p-6">
              <Heart className="h-8 w-8 text-conve-red mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Executive Wellness</h3>
              <p className="text-gray-600">Designed for busy professionals</p>
            </div>
          </div>

          {/* Lake Nona-Specific Services */}
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <div className="luxury-card p-8">
              <h2 className="text-2xl font-bold mb-4 font-playfair">Medical City Professionals</h2>
              <p className="text-gray-600 mb-6">
                Specialized mobile lab services for Lake Nona's medical professionals, 
                including physicians, nurses, and healthcare executives at leading facilities.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Nemours Children's Hospital staff</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>UCF College of Medicine faculty</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Medical device executives</span>
                </li>
              </ul>
            </div>

            <div className="luxury-card p-8">
              <h2 className="text-2xl font-bold mb-4 font-playfair">Innovation District Services</h2>
              <p className="text-gray-600 mb-6">
                Premium mobile lab services for Lake Nona's tech leaders, biotech executives, 
                and innovation district professionals in Central Florida's smartest city.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Tech company offices</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Biotech facility visits</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Innovation campus services</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Service Areas */}
          <div className="luxury-card p-8 mb-16">
            <h2 className="text-2xl font-bold mb-6 font-playfair text-center">Innovation District Coverage</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <MapPin className="h-6 w-6 text-conve-red mx-auto mb-2" />
                <h3 className="font-semibold mb-2">Medical City Campus</h3>
                <p className="text-sm text-gray-600">All medical facilities</p>
              </div>
              <div className="text-center">
                <MapPin className="h-6 w-6 text-conve-red mx-auto mb-2" />
                <h3 className="font-semibold mb-2">Lake Nona Town Center</h3>
                <p className="text-sm text-gray-600">Business and residential</p>
              </div>
              <div className="text-center">
                <MapPin className="h-6 w-6 text-conve-red mx-auto mb-2" />
                <h3 className="font-semibold mb-2">Innovation District</h3>
                <p className="text-sm text-gray-600">Tech and biotech companies</p>
              </div>
            </div>
          </div>

          {/* Innovation Standards */}
          <div className="luxury-card p-8 mb-16">
            <h2 className="text-2xl font-bold mb-6 font-playfair text-center">Innovation District Standards</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold text-lg mb-3">Medical Professional Focus</h3>
                <p className="text-gray-600 mb-4">
                  Designed specifically for healthcare professionals who understand the importance 
                  of quality lab services and precise results.
                </p>
                
                <h3 className="font-semibold text-lg mb-3">Tech-Enabled Efficiency</h3>
                <p className="text-gray-600">
                  Modern scheduling systems and digital result delivery that matches 
                  the innovation district's technology standards.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-3">Executive-Level Service</h3>
                <p className="text-gray-600 mb-4">
                  Premium service designed for busy medical executives, tech leaders, 
                  and innovation district professionals.
                </p>
                
                <h3 className="font-semibold text-lg mb-3">Same-Day Innovation</h3>
                <p className="text-gray-600">
                  Rapid result turnaround that keeps pace with the fast-moving 
                  innovation and medical research environment.
                </p>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center luxury-gradient-bg p-12 rounded-2xl">
            <h2 className="text-3xl font-bold mb-4 font-playfair">Innovate Your Healthcare Experience</h2>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Join Lake Nona's medical and tech professionals who trust ConveLabs for their health screening needs. 
              Book your innovative mobile lab service today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <BookNowButton size="lg" />
              <MembershipButton variant="outline" size="lg" />
            </div>
            <div className="mt-6 flex items-center justify-center gap-4 text-gray-600">
              <Phone className="h-5 w-5" />
              <span className="font-semibold">Innovation Hotline: 941-527-9169</span>
            </div>
          </div>
        </Container>
      </DashboardWrapper>
    </>
  );
};

export default LakeNona;