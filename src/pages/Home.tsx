import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/home/Header";
import Hero from "@/components/home/Hero";
import MeetYourPhlebotomist from "@/components/home/MeetYourPhlebotomist";
import ComparisonTable from "@/components/home/ComparisonTable";
import ValueStack from "@/components/home/ValueStack";
import GuaranteeBanner from "@/components/home/GuaranteeBanner";
import TrustBanner from "@/components/home/TrustBanner";
import PartnersMarquee from "@/components/home/PartnersMarquee";
import HowItWorks from "@/components/home/HowItWorks";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import MembershipCTA from "@/components/home/MembershipCTA";
import FAQSection from "@/components/home/FAQSection";
import CallToAction from "@/components/home/CallToAction";
import LeadCapture from "@/components/home/LeadCapture";
import Footer from "@/components/home/Footer";
import { PageTransition } from "@/components/ui/page-transition";
import { VisitorOptimizationProvider } from "@/components/optimization/VisitorOptimizationProvider";
import { FAQSchema } from "@/components/seo/FAQSchema";
import { HowToSchema } from "@/components/seo/HowToSchema";
import { OrganizationSchema } from "@/components/seo/OrganizationSchema";
import { ReviewSchema } from "@/components/seo/ReviewSchema";

const Home = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  // PWA auto-redirect: if user is logged in and in standalone mode, go to dashboard
  useEffect(() => {
    if (isLoading) return;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;

    if (user && isStandalone) {
      navigate(`/dashboard/${user.role || 'patient'}`, { replace: true });
    }
  }, [user, isLoading, navigate]);

  return (
    <VisitorOptimizationProvider>
      <Helmet>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
        <link rel="canonical" href="https://convelabs.com/" />

        <title>Mobile Phlebotomy Trusted by NFL Athletes | Better Than the Lab | ConveLabs FL</title>
        <meta
          name="description"
          content="Licensed mobile phlebotomist trusted by NFL athletes and fitness influencers (@morellifit, 1M+). One-try blood draws at your home, office, or hotel. Same-day service across Central Florida. On-time or your visit is free. In-office from $55, mobile from $150."
        />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />

        {/* Geographic SEO */}
        <meta name="geo.region" content="US-FL" />
        <meta name="geo.placename" content="Orlando, Florida" />
        <meta name="geo.position" content="28.5383,-81.3792" />

        {/* Mobile */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#B91C1C" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Mobile Phlebotomy Trusted by NFL Athletes | ConveLabs" />
        <meta
          property="og:description"
          content='"Better than what I got in the NFL." — Licensed mobile phlebotomist. Same-day appointments across Central Florida. On-time or your visit is free.'
        />
        <meta property="og:image" content="https://www.convelabs.com/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="ConveLabs — Mobile Phlebotomy Trusted by NFL Athletes" />
        <meta property="og:url" content="https://convelabs.com/" />
        <meta property="og:site_name" content="ConveLabs" />
        <meta property="og:locale" content="en_US" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Mobile Phlebotomy Trusted by NFL Athletes | ConveLabs" />
        <meta
          name="twitter:description"
          content='"Better than what I got in the NFL." — Licensed mobile phlebotomist. Same-day appointments. Central Florida.'
        />
        <meta name="twitter:image" content="https://www.convelabs.com/og-image.png" />
        <meta name="twitter:image:alt" content="ConveLabs — Mobile Phlebotomy Trusted by NFL Athletes" />

        {/* Schema: MedicalBusiness */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MedicalBusiness",
            name: "ConveLabs",
            description:
              "Mobile phlebotomy service in Central Florida. Licensed phlebotomists come to your home, office, or hotel for blood draws.",
            url: "https://convelabs.com",
            telephone: "+1-941-527-9169",
            priceRange: "$$",
            address: {
              "@type": "PostalAddress",
              addressLocality: "Orlando",
              addressRegion: "FL",
              addressCountry: "US",
            },
            geo: {
              "@type": "GeoCoordinates",
              latitude: 28.5383,
              longitude: -81.3792,
            },
            openingHoursSpecification: {
              "@type": "OpeningHoursSpecification",
              dayOfWeek: [
                "Monday", "Tuesday", "Wednesday", "Thursday",
                "Friday", "Saturday", "Sunday",
              ],
              opens: "06:00",
              closes: "20:00",
            },
            areaServed: [
              "Orlando", "Winter Park", "Windermere", "Dr. Phillips",
              "Bay Hill", "Lake Nona", "Celebration", "Heathrow",
              "Kissimmee", "Lake Mary", "Altamonte Springs", "Sanford",
            ],
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: "5.0",
              reviewCount: "164",
              bestRating: "5",
              worstRating: "1",
            },
          })}
        </script>
      </Helmet>

      {/* SEO schemas */}
      <FAQSchema
        faqs={[
          {
            question: "How much does a mobile blood draw cost?",
            answer:
              "ConveLabs in-office blood draws start at $55. Mobile blood draws start at $150 per visit. Additional patients at the same location are $75 each. No hidden fees.",
          },
          {
            question: "Do you offer same-day appointments?",
            answer:
              "Yes, ConveLabs offers same-day mobile phlebotomy appointments when available across Orlando and Central Florida.",
          },
          {
            question: "What areas do you serve?",
            answer:
              "We serve Orlando, Winter Park, Windermere, Dr. Phillips, Bay Hill, Lake Nona, Celebration, Heathrow, Kissimmee, Lake Mary, Altamonte Springs, Sanford, Oviedo, Maitland, Clermont, and surrounding areas.",
          },
          {
            question: "Is mobile blood work covered by insurance?",
            answer:
              "Many insurance plans cover the lab tests. The mobile service fee ($150) is typically out-of-pocket. In-office visits start at $55. We provide superbills for reimbursement.",
          },
          {
            question: "How quickly can you come to my location?",
            answer:
              "We offer same-day scheduling with early morning fasting appointments available starting at 6:00 AM.",
          },
        ]}
      />
      <HowToSchema
        name="How to Book a Mobile Blood Draw with ConveLabs"
        description="Book a licensed phlebotomist to come to your home in 3 simple steps."
        estimatedCost="$55+"
        totalTime="PT30M"
        steps={[
          { name: "Book Online", text: "Enter your ZIP code and choose an available appointment time." },
          { name: "Phlebotomist Comes to You", text: "A licensed phlebotomist arrives at your location with professional equipment." },
          { name: "Specimen Delivery Confirmation", text: "Once your specimens are delivered to the lab, we send you a confirmation with your lab-generated tracking ID." },
        ]}
      />
      <OrganizationSchema />
      <ReviewSchema
        businessName="ConveLabs"
        ratingValue="5.0"
        reviewCount="164"
        reviews={[
          {
            author: "Dr. Michael Johnson, MD",
            rating: "5",
            reviewBody:
              "ConveLabs provides exceptional mobile lab services for my patients. Professional and reliable.",
          },
          {
            author: "Sarah W.",
            rating: "5",
            reviewBody:
              "Same-day mobile blood draw saved me hours. The phlebotomist was on time and professional.",
          },
          {
            author: "Robert T.",
            rating: "5",
            reviewBody:
              "Outstanding service. Easy to book online and the phlebotomist was excellent.",
          },
        ]}
      />

      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        <Header />
        <main>
          <PageTransition>
            <Hero />
            <MeetYourPhlebotomist />
            <TestimonialsSection />
            <GuaranteeBanner />
            <TrustBanner />
            <PartnersMarquee />
            <ComparisonTable />
            <ValueStack />
            <HowItWorks />
            <MembershipCTA />
            <FAQSection />
            <LeadCapture />
            <CallToAction />
          </PageTransition>
        </main>
        <Footer />
      </div>
    </VisitorOptimizationProvider>
  );
};

export default Home;
