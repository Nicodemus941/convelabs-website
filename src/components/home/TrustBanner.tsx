import React from "react";
import { Shield, Clock, CheckCircle, Users, FlaskConical } from "lucide-react";

const trustItems = [
  { icon: <CheckCircle className="h-5 w-5" />, label: "Licensed phlebotomists" },
  { icon: <FlaskConical className="h-5 w-5" />, label: "Quest / LabCorp / AdventHealth delivery" },
  { icon: <Shield className="h-5 w-5" />, label: "HIPAA-compliant handling" },
  { icon: <Clock className="h-5 w-5" />, label: "Same-day when available" },
  { icon: <Users className="h-5 w-5" />, label: "164 five-star reviews" },
];

const TrustBanner = () => {
  return (
    <section className="py-4 bg-brand-cream border-y border-brand-gold/20">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap justify-center items-center gap-x-4 sm:gap-x-6 md:gap-x-8 gap-y-3 overflow-x-auto">
          {trustItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs sm:text-sm font-medium uppercase tracking-wider text-brand-gray-warm">
              <span className="text-brand-gold-deep">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustBanner;
