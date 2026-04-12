
import React from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import FranchiseHero from "@/components/franchise/FranchiseHero";
import WhyConveLabs from "@/components/franchise/WhyConveLabs";
import FranchiseOverview from "@/components/franchise/FranchiseOverview";
import MarketOpportunity from "@/components/franchise/MarketOpportunity";
import FranchiseIncludes from "@/components/franchise/FranchiseIncludes";
import FranchiseeRole from "@/components/franchise/FranchiseeRole";
import FranchiseForm from "@/components/franchise/FranchiseForm";
import FinalCta from "@/components/franchise/FinalCta";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import PaymentSystemFeature from "@/components/franchise/PaymentSystemFeature";
import AdvancedFeaturesSection from "@/components/franchise/AdvancedFeaturesSection";

const Franchise = () => {
  const { user } = useAuth();
  const scrollToForm = () => {
    document.getElementById("franchise-form")?.scrollIntoView({ behavior: "smooth" });
  };

  // Check if user is an admin or super_admin
  const isAdmin = user && (user.role === 'super_admin' || user.role === 'admin');

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Franchise ConveLabs – Luxury Mobile Lab Business</title>
        <meta
          name="description"
          content="Franchise ConveLabs: Own a luxury healthcare business in your city. Provide concierge lab services to high-net-worth clients with full tech and branding support."
        />
        <meta property="og:title" content="Franchise ConveLabs – Luxury Mobile Lab Business" />
        <meta
          property="og:description"
          content="Become a ConveLabs franchisee and launch your own concierge lab service. High-demand market, premium brand, full training, and automation tools included."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://convelabs.com/franchise" />
        <meta property="og:image" content="https://convelabs.com/assets/images/franchise-og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Franchise ConveLabs – Luxury Mobile Lab Business" />
        <meta name="twitter:description" content="Own a luxury healthcare franchise with ConveLabs. Provide premium lab services to high-value clients." />
        <meta name="twitter:image" content="https://convelabs.com/assets/images/franchise-og-image.jpg" />
        <meta name="keywords" content="healthcare franchise, lab franchise, concierge healthcare, mobile phlebotomy, luxury medical services, franchise payment system" />
      </Helmet>

      <Header />

      {isAdmin && (
        <div className="bg-gray-100 py-3">
          <div className="container mx-auto px-4 text-center">
            <Link to="/franchise-admin">
              <Button variant="outline" className="border-conve-red text-conve-red hover:bg-conve-red hover:text-white">
                Go to Franchise Admin Portal
              </Button>
            </Link>
          </div>
        </div>
      )}

      <main>
        <FranchiseHero scrollToForm={scrollToForm} />
        <WhyConveLabs />
        <FranchiseOverview />
        <AdvancedFeaturesSection />
        <MarketOpportunity />
        <PaymentSystemFeature />
        <FranchiseIncludes />
        <FranchiseeRole />
        <FranchiseForm />
        <FinalCta scrollToForm={scrollToForm} />
      </main>

      <Footer />
    </div>
  );
};

export default Franchise;
