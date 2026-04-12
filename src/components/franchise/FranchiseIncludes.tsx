
import React from "react";
import { Check } from "lucide-react";

interface FeatureItemProps {
  children: React.ReactNode;
}

const FeatureItem = ({ children }: FeatureItemProps) => (
  <div className="flex items-start space-x-3">
    <div className="flex-shrink-0 mt-1">
      <Check className="h-5 w-5 text-conve-red" />
    </div>
    <p>{children}</p>
  </div>
);

const FranchiseIncludes: React.FC = () => {
  return (
    <section className="py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">What's Included in Your Franchise</h2>
        
        <div className="grid md:grid-cols-2 gap-x-12 gap-y-6 max-w-4xl mx-auto">
          <FeatureItem>
            Use of the ConveLabs brand and visual assets
          </FeatureItem>
          <FeatureItem>
            Access to the proprietary ConveLabs booking system and dashboard
          </FeatureItem>
          <FeatureItem>
            Integrated payment processing and user authentication
          </FeatureItem>
          <FeatureItem>
            Scheduling automation with phlebotomist dashboards
          </FeatureItem>
          <FeatureItem>
            Pre-written SOPs for hiring, training, and service delivery
          </FeatureItem>
          <FeatureItem>
            Marketing toolkit (flyers, Google ads, social content)
          </FeatureItem>
          <FeatureItem>
            Access to national lab partnerships
          </FeatureItem>
          <FeatureItem>
            Ongoing tech, business, and growth mentorship
          </FeatureItem>
        </div>
      </div>
    </section>
  );
};

export default FranchiseIncludes;
