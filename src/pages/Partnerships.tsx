
import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";

// Import refactored components
import PartnershipsHero from "@/components/partnerships/hero/PartnershipsHero";
import PartnershipBenefits from "@/components/partnerships/benefits/PartnershipBenefits";
import { PricingCards } from "@/components/partnerships/pricing/PricingCards";
import MonthlyMaintenance from "@/components/partnerships/maintenance/MonthlyMaintenance";
import PartnershipCTA from "@/components/partnerships/cta/PartnershipCTA";
import WhyConveLabs from "@/components/partnerships/why/WhyConveLabs";

const Partnerships: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Medical Provider Partnerships | ConveLabs Software Platform</title>
        <meta 
          name="description" 
          content="Launch your own medical software platform powered by ConveLabs. Get a custom branded website, booking system, patient portal and more. HIPAA-compliant and ready in 30 days." 
        />
        <meta name="keywords" content="medical software platform, HIPAA compliant medical software, patient portal, medical practice management" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.convelabs.com/partnerships" />
        <meta property="og:title" content="Launch Your Own Medical Software Platform — Powered by ConveLabs" />
        <meta property="og:description" content="You bring the patients. We bring the infrastructure. Get your own branded medical platform with booking system, patient portal and staff access." />
        <meta property="og:image" content="https://www.convelabs.com/images/partnerships-og-image.jpg" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://www.convelabs.com/partnerships" />
        <meta name="twitter:title" content="Launch Your Own Medical Software Platform — Powered by ConveLabs" />
        <meta name="twitter:description" content="You bring the patients. We bring the infrastructure. Get your own branded medical platform with booking system, patient portal and staff access." />
        <meta name="twitter:image" content="https://www.convelabs.com/images/partnerships-og-image.jpg" />
        
        {/* Schema.org markup for search engines */}
        <script type="application/ld+json">
          {`
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "ConveLabs Medical Software Platform",
              "description": "Custom branded medical software platform with booking system, patient portal and staff access",
              "offers": {
                "@type": "AggregateOffer",
                "lowPrice": "5000",
                "highPrice": "10000",
                "priceCurrency": "USD"
              }
            }
          `}
        </script>
      </Helmet>
      
      <div className="min-h-screen bg-white flex flex-col overflow-hidden">
        <Header />
        
        <main className="flex-grow">
          <PartnershipsHero />
          <PartnershipBenefits />
          <PricingCards />
          <MonthlyMaintenance />
          <WhyConveLabs />
          <PartnershipCTA />
        </main>
        
        <Footer />
      </div>
    </>
  );
};

export default Partnerships;
