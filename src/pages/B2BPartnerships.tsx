import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import B2BHero from '@/components/b2b/hero/B2BHero';
import ROICalculator from '@/components/b2b/calculator/ROICalculator';
import ServiceShowcase from '@/components/b2b/services/ServiceShowcase';
import IndustryTabs from '@/components/b2b/industries/IndustryTabs';
import TrustSection from '@/components/b2b/social-proof/TrustSection';
import PartnershipCTA from '@/components/b2b/cta/PartnershipCTA';
import { IndustryType } from '@/types/b2bTypes';

const B2BPartnerships: React.FC = () => {
  const [selectedIndustry, setSelectedIndustry] = useState<IndustryType>('healthcare');

  return (
    <>
      <Helmet>
        {/* Primary SEO Meta Tags */}
        <title>B2B Mobile Phlebotomy Partnerships Orlando & Tampa | Revenue Growth for Healthcare Providers | ConveLabs</title>
        <meta 
          name="description" 
          content="Partner with ConveLabs for premium mobile phlebotomy services in Orlando & Tampa. Generate new revenue streams for healthcare providers, sports teams, and corporations. Calculate your ROI with our B2B partnership program." 
        />
        <meta name="keywords" content="B2B mobile phlebotomy partnerships Orlando Tampa, corporate wellness mobile lab services Florida, healthcare provider revenue partnerships, executive health mobile phlebotomy, sports team mobile lab services, talent agency wellness programs" />
        <meta name="author" content="ConveLabs" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <link rel="canonical" href="https://convelabs.com/b2b" />
        
        {/* Geographic & Local SEO */}
        <meta name="geo.region" content="US-FL" />
        <meta name="geo.placename" content="Orlando, Tampa, Central Florida" />
        <meta name="geo.position" content="28.5383;-81.3792" />
        <meta name="ICBM" content="28.5383, -81.3792" />
        
        {/* Open Graph / Facebook Meta Tags */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://convelabs.com/b2b" />
        <meta property="og:title" content="B2B Mobile Phlebotomy Partnerships Orlando & Tampa | ConveLabs" />
        <meta property="og:description" content="Transform your organization with revenue-generating mobile phlebotomy partnerships. Serving healthcare providers, sports teams, and corporations in Orlando & Tampa with premium mobile lab services." />
        <meta property="og:image" content="https://convelabs.com/og-b2b-partnerships.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="ConveLabs B2B Mobile Phlebotomy Partnerships - Healthcare Revenue Growth" />
        <meta property="og:site_name" content="ConveLabs" />
        <meta property="og:locale" content="en_US" />
        
        {/* Twitter Card Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://convelabs.com/b2b" />
        <meta name="twitter:title" content="B2B Mobile Phlebotomy Partnerships | Revenue Growth for Healthcare Providers" />
        <meta name="twitter:description" content="Partner with ConveLabs for premium mobile phlebotomy services. Generate new revenue streams in Orlando & Tampa. Calculate your ROI today." />
        <meta name="twitter:image" content="https://convelabs.com/og-b2b-partnerships.jpg" />
        <meta name="twitter:image:alt" content="ConveLabs B2B Mobile Phlebotomy Partnerships" />
        <meta name="twitter:site" content="@ConveLabs" />
        <meta name="twitter:creator" content="@ConveLabs" />
        
        {/* LinkedIn Optimization */}
        <meta property="article:author" content="ConveLabs" />
        <meta property="article:publisher" content="https://www.linkedin.com/company/convelabs" />
        <meta property="business:contact_data:locality" content="Orlando" />
        <meta property="business:contact_data:region" content="Florida" />
        <meta property="business:contact_data:country_name" content="United States" />
        
        {/* Mobile & SMS Optimization */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="ConveLabs B2B" />
        <meta name="format-detection" content="telephone=yes, date=no, email=yes, address=yes" />
        <meta name="skype_toolbar" content="skype_toolbar_parser_compatible" />
        
        {/* Professional Services Schema.org Structured Data */}
        <script type="application/ld+json">
          {`
            {
              "@context": "https://schema.org",
              "@type": "ProfessionalService",
              "name": "ConveLabs B2B Mobile Phlebotomy Partnerships",
              "description": "Premium mobile phlebotomy and laboratory services for healthcare providers, sports organizations, and corporations in Orlando and Tampa, Florida.",
              "url": "https://convelabs.com/b2b",
              "logo": "https://convelabs.com/logo.png",
              "image": "https://convelabs.com/og-b2b-partnerships.jpg",
              "serviceType": "Mobile Phlebotomy Services",
              "provider": {
                "@type": "Organization",
                "name": "ConveLabs",
                "url": "https://convelabs.com",
                "logo": "https://convelabs.com/logo.png",
                "sameAs": [
                  "https://www.linkedin.com/company/convelabs",
                  "https://twitter.com/ConveLabs"
                ]
              },
              "areaServed": [
                {
                  "@type": "City",
                  "name": "Orlando",
                  "addressRegion": "FL",
                  "addressCountry": "US"
                },
                {
                  "@type": "City", 
                  "name": "Tampa",
                  "addressRegion": "FL",
                  "addressCountry": "US"
                }
              ],
              "serviceOutput": "Revenue growth partnerships for healthcare organizations",
              "audience": {
                "@type": "BusinessAudience",
                "businessFunction": "Healthcare Providers, Sports Organizations, Corporate Wellness"
              },
              "hasOfferCatalog": {
                "@type": "OfferCatalog",
                "name": "B2B Partnership Services",
                "itemListElement": [
                  {
                    "@type": "Offer",
                    "itemOffered": {
                      "@type": "Service",
                      "name": "Healthcare Provider Revenue Partnerships",
                      "description": "Mobile phlebotomy revenue sharing partnerships for medical practices"
                    }
                  },
                  {
                    "@type": "Offer", 
                    "itemOffered": {
                      "@type": "Service",
                      "name": "Corporate Executive Health Programs",
                      "description": "Premium mobile lab services for corporate wellness and executive health"
                    }
                  },
                  {
                    "@type": "Offer",
                    "itemOffered": {
                      "@type": "Service", 
                      "name": "Sports Organization Health Services",
                      "description": "Mobile phlebotomy and lab testing for sports teams and athletes"
                    }
                  }
                ]
              },
              "contactPoint": {
                "@type": "ContactPoint",
                "telephone": "+1-407-XXX-XXXX",
                "contactType": "Business Development",
                "availableLanguage": "English",
                "areaServed": "FL"
              }
            }
          `}
        </script>
        
        {/* FAQ Schema for B2B Questions */}
        <script type="application/ld+json">
          {`
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              "mainEntity": [
                {
                  "@type": "Question",
                  "name": "How much revenue can healthcare providers generate through ConveLabs partnerships?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Healthcare providers typically see 15-35% revenue increases through our mobile phlebotomy partnership programs, with some practices generating over $50,000 in additional monthly revenue."
                  }
                },
                {
                  "@type": "Question", 
                  "name": "What areas does ConveLabs serve for B2B partnerships?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "ConveLabs provides B2B mobile phlebotomy services throughout Central Florida, with primary focus on Orlando, Tampa, and surrounding metropolitan areas."
                  }
                },
                {
                  "@type": "Question",
                  "name": "What types of organizations benefit from ConveLabs B2B partnerships?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Our B2B partnerships serve healthcare providers, sports organizations, talent agencies, corporations, and executive wellness programs seeking premium mobile laboratory services."
                  }
                }
              ]
            }
          `}
        </script>
      </Helmet>
      
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
        <B2BHero selectedIndustry={selectedIndustry} onIndustryChange={setSelectedIndustry} />
        <ROICalculator selectedIndustry={selectedIndustry} />
        <ServiceShowcase />
        <IndustryTabs selectedIndustry={selectedIndustry} onIndustryChange={setSelectedIndustry} />
        <TrustSection selectedIndustry={selectedIndustry} />
        <PartnershipCTA />
      </div>
    </>
  );
};

export default B2BPartnerships;