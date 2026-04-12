import React from "react";
import { Shield, Award, CheckCircle, Lock, FileCheck, CreditCard } from "lucide-react";

export const TrustBadgeRow = () => {
  const badges = [
    { icon: <Award className="h-6 w-6" />, text: "Executive Preferred" },
    { icon: <Shield className="h-6 w-6" />, text: "TRT Specialist" },
    { icon: <Award className="h-6 w-6" />, text: "Corporate Wellness Partner" },
    { icon: <CheckCircle className="h-6 w-6" />, text: "Licensed Phlebotomists" },
    { icon: <Lock className="h-6 w-6" />, text: "HIPAA Compliant" },
    { icon: <Award className="h-6 w-6" />, text: "CLIA Certified" },
  ];

  return (
    <section className="py-8 bg-gray-50 border-y border-gray-200">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {badges.map((badge, index) => (
            <div
              key={index}
              className="flex flex-col items-center justify-center p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300"
            >
              <div className="text-conve-red mb-2">{badge.icon}</div>
              <span className="text-xs font-semibold text-gray-700 text-center">
                {badge.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
