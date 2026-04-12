import React from "react";
import { Calendar, FlaskConical, Percent, Clock, Award, Shield } from "lucide-react";

export const ValuePropositionsBar = () => {
  const propositions = [
    { icon: <Award className="h-5 w-5" />, text: "Executive Preferred Service" },
    { icon: <FlaskConical className="h-5 w-5" />, text: "TRT & Performance Monitoring" },
    { icon: <Clock className="h-5 w-5" />, text: "24/7 Concierge Scheduling" },
    { icon: <Calendar className="h-5 w-5" />, text: "Travel-Friendly Appointments" },
    { icon: <Shield className="h-5 w-5" />, text: "Corporate Wellness Programs" },
    { icon: <Shield className="h-5 w-5" />, text: "HIPAA-Certified Excellence" },
  ];

  return (
    <section className="bg-gradient-to-r from-conve-red to-red-700 text-white py-6">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          {propositions.map((prop, index) => (
            <div
              key={index}
              className="flex items-center justify-center gap-2 text-center"
            >
              <div className="flex-shrink-0">{prop.icon}</div>
              <span className="text-sm font-medium">{prop.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
