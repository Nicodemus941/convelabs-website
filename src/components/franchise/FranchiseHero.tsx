
import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface FranchiseHeroProps {
  scrollToForm: () => void;
}

const FranchiseHero: React.FC<FranchiseHeroProps> = ({ scrollToForm }) => {
  return (
    <section className="relative bg-gradient-to-r from-gray-50 to-white py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Bring Luxury Healthcare to Your City
          </h1>
          <p className="text-xl text-gray-700 mb-8">
            Franchise ConveLabs — a leader in high-end, mobile lab services for elite clientele.
          </p>
          <Button 
            size="lg" 
            className="bg-conve-red hover:bg-conve-red/90 text-white flex items-center gap-2"
            onClick={scrollToForm}
          >
            Apply to Franchise Now <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default FranchiseHero;
