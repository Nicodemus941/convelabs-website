
import React from "react";
import { Helmet } from "react-helmet-async";
import SalesFunnel from "@/components/sales-funnel/SalesFunnel";
import MetaPixel from "@/components/tracking/MetaPixel";

const SalesFunnelPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <Helmet>
        <title>Find Your Perfect ConveLabs Plan | Personalized Health Assessment</title>
        <meta 
          name="description" 
          content="Discover the ideal ConveLabs membership plan for your health and wellness needs. Complete our personalized assessment to get expert recommendations." 
        />
        <meta name="keywords" content="ConveLabs membership plans, personalized health assessment, mobile phlebotomy plans, at-home lab services" />
        <link rel="canonical" href="https://funnel.convelabs.com" />
      </Helmet>
      
      <MetaPixel />
      <SalesFunnel />
    </div>
  );
};

export default SalesFunnelPage;
