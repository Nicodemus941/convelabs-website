
import { useState } from "react";
import { motion } from "framer-motion";
import { ServiceGrid } from "@/components/services/ServiceGrid";
import { PricingHero } from "@/components/pricing/PricingHero";
import { PricingTabs } from "@/components/pricing/PricingTabs";
import { PricingWhyChoose } from "@/components/pricing/PricingWhyChoose";
import { PricingFAQ } from "@/components/pricing/PricingFAQ";
import { PricingCallToAction } from "@/components/pricing/PricingCallToAction";
import PricingFoundingMemberNote from "@/components/pricing/PricingFoundingMemberNote";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { PageTransition } from "@/components/ui/page-transition";

// Staggered animation for content sections
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      when: "beforeChildren",
      staggerChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

const Pricing = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <div className="flex-grow">
        <PageTransition>
          <div className="container mx-auto py-8 px-4">
            <motion.div 
              className="max-w-4xl mx-auto"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              viewport={{ once: true }}
            >
              {/* Hero Section with Value Proposition */}
              <motion.div variants={itemVariants}>
                <PricingHero />
              </motion.div>
              
              {/* Founding Member Note */}
              <motion.div variants={itemVariants}>
                <PricingFoundingMemberNote />
              </motion.div>

              {/* Main Plans Tabs */}
              <motion.div id="pricing-tabs" variants={itemVariants}>
                <PricingTabs />
              </motion.div>
              
              {/* Interactive Services Section */}
              <motion.div variants={itemVariants}>
                <ServiceGrid />
              </motion.div>
              
              {/* Why Choose Our Membership Section */}
              <motion.div variants={itemVariants}>
                <PricingWhyChoose />
              </motion.div>
              
              {/* FAQ Section */}
              <motion.div variants={itemVariants}>
                <PricingFAQ />
              </motion.div>

              {/* Call to Action */}
              <motion.div variants={itemVariants}>
                <PricingCallToAction />
              </motion.div>
            </motion.div>
          </div>
        </PageTransition>
      </div>
      
      <Footer />
    </div>
  );
};

export default Pricing;
