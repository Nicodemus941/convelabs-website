
import React from "react";
import { Button } from "@/components/ui/button";

const PartnershipCTA: React.FC = () => {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };
  
  return (
    <section className="py-16 md:py-24 bg-conve-red text-white">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Launch Your Platform?</h2>
        <p className="text-xl md:text-2xl mb-8 max-w-2xl mx-auto">
          Join the growing community of medical providers who are expanding their reach with a custom digital platform.
        </p>
        <Button 
          size="lg"
          variant="outline" 
          className="bg-white text-conve-red hover:bg-gray-100 border-white text-lg px-8 py-6 h-auto"
          onClick={() => scrollToSection('pricing')}
        >
          View Pricing & Build My Platform
        </Button>
      </div>
    </section>
  );
};

export default PartnershipCTA;
