
import React from "react";
import { cn } from "@/lib/utils";

interface IdealForItem {
  text: string;
}

interface MembershipIdealForProps {
  idealFor: IdealForItem[];
}

export const MembershipIdealFor: React.FC<MembershipIdealForProps> = ({ idealFor }) => {
  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-4">Ideal For</h2>
        <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
          Our membership is perfect for these lifestyles and needs:
        </p>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {idealFor.map((item, index) => (
            <div 
              key={index} 
              className={cn(
                "py-6 px-8 rounded-lg text-center",
                "bg-gradient-to-br from-white to-gray-50 shadow-md border border-gray-100"
              )}
            >
              <p className="text-gray-800">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
