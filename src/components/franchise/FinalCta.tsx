
import React from "react";
import { Button } from "@/components/ui/button";

interface FinalCtaProps {
  scrollToForm: () => void;
}

const FinalCta: React.FC<FinalCtaProps> = ({ scrollToForm }) => {
  return (
    <section className="py-16 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
      <div className="container mx-auto px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Now is your chance to build a mobile healthcare business that serves high-income patients, 
            concierge doctors, and corporations—under the ConveLabs brand.
          </h2>
          <Button 
            size="lg" 
            variant="outline" 
            className="border-white text-blue-500 hover:bg-white hover:text-gray-800 font-medium"
            onClick={scrollToForm}
          >
            Get Started
          </Button>
        </div>
      </div>
    </section>
  );
};

export default FinalCta;
