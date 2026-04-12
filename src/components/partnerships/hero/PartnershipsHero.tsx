
import React from "react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const PartnershipsHero: React.FC = () => {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className="relative bg-gradient-to-b from-gray-50 to-white pt-24 pb-16 md:pt-32 md:pb-24">
      <div className="absolute inset-0 z-0 bg-[url('/images/grid-pattern.svg')] bg-repeat opacity-5"></div>
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          <motion.h1 
            className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-conve-red to-conve-gold"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            Launch Your Own Medical Software Platform
          </motion.h1>
          
          <motion.h2 
            className="text-3xl md:text-4xl font-bold mb-6 text-conve-black"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            — Powered by ConveLabs
          </motion.h2>
          
          <motion.p 
            className="text-xl md:text-2xl text-gray-600 mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            You bring the patients. We bring the infrastructure.
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <Button 
              size="lg" 
              className="bg-conve-red hover:bg-conve-red/90 text-white text-lg px-8 py-6 h-auto"
              onClick={() => scrollToSection('pricing')}
            >
              Build My Platform
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Abstract shape decorations */}
      <div className="absolute bottom-0 left-0 w-1/3 h-64 bg-gradient-to-tr from-conve-red/10 to-transparent rounded-tr-full -z-10"></div>
      <div className="absolute top-1/4 right-0 w-1/4 h-48 bg-gradient-to-tl from-conve-gold/10 to-transparent rounded-tl-full -z-10"></div>
    </section>
  );
};

export default PartnershipsHero;
