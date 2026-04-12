
import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

interface MembershipPricingPreviewProps {
  title: string;
  pricing: {
    monthly: string;
    quarterly: string;
    annually: string;
  };
}

export const MembershipPricingPreview: React.FC<MembershipPricingPreviewProps> = ({ title, pricing }) => {
  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-12">{title} Membership Pricing</h2>
        
        <div className="max-w-3xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden">
          <div className="p-8 border-b">
            <h3 className="text-2xl font-bold mb-6 text-center">{title} Plan</h3>
            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div className="p-4 rounded-lg">
                <div className="text-lg font-medium mb-2">Monthly</div>
                <div className="text-2xl font-bold text-conve-red">{pricing.monthly}</div>
              </div>
              
              <div className="p-4 rounded-lg bg-gray-50">
                <div className="text-lg font-medium mb-2">Quarterly</div>
                <div className="text-2xl font-bold text-conve-red">{pricing.quarterly}</div>
              </div>
              
              <div className="p-4 rounded-lg">
                <div className="text-lg font-medium mb-2">Annually</div>
                <div className="text-2xl font-bold text-conve-red">{pricing.annually}</div>
                <div className="text-sm text-conve-red mt-1">Best Value</div>
              </div>
            </div>
          </div>
          
          <div className="p-8 text-center">
            <Link 
              to="/pricing"
              className="inline-flex items-center text-lg text-conve-red font-medium hover:underline"
            >
              View Full Pricing Options <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
