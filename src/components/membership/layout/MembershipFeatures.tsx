
import React from "react";
import { Check } from "lucide-react";

interface FeatureItem {
  text: string;
}

interface MembershipFeaturesProps {
  features: FeatureItem[];
  type?: string;
}

export const MembershipFeatures: React.FC<MembershipFeaturesProps> = ({ features, type }) => {
  return (
    <section className="py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-12">Plan Features</h2>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {features.map((feature, index) => (
            <div key={index} className="bg-white p-6 rounded-lg shadow-md flex items-start gap-4">
              <div className="flex-shrink-0 bg-conve-red/10 w-10 h-10 rounded-full flex items-center justify-center">
                <Check className="text-conve-red w-5 h-5" />
              </div>
              <div>
                <p className="text-gray-800">{feature.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
