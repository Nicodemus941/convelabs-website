
import React from "react";
import { Globe, Shield, Zap, Users, BarChart, Award } from "lucide-react";
import PartnershipBenefitItem from "./PartnershipBenefitItem";

const PartnershipBenefits: React.FC = () => {
  const benefits = [
    {
      icon: <Globe className="w-6 h-6 text-conve-red" />,
      title: "Custom Web Presence",
      description: "Your own branded medical platform, accessible to patients 24/7 from any device."
    },
    {
      icon: <Shield className="w-6 h-6 text-conve-red" />,
      title: "HIPAA Compliant",
      description: "Fully secure platform with robust patient data protection built in from the ground up."
    },
    {
      icon: <Zap className="w-6 h-6 text-conve-red" />,
      title: "Rapid Deployment",
      description: "Go from concept to launch in 30 days or less with our streamlined process."
    },
    {
      icon: <Users className="w-6 h-6 text-conve-red" />,
      title: "Patient Portal",
      description: "Patients can schedule, pay for services, and access their results all in one place."
    },
    {
      icon: <BarChart className="w-6 h-6 text-conve-red" />,
      title: "Analytics Dashboard",
      description: "Track patient engagement, conversions, and revenue with real-time metrics."
    },
    {
      icon: <Award className="w-6 h-6 text-conve-red" />,
      title: "Ongoing Support",
      description: "Regular updates, tech support, and platform enhancements included."
    }
  ];

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need to Launch</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Our partnership platform includes all the features you need to digitize your medical practice.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {benefits.map((benefit, index) => (
            <PartnershipBenefitItem
              key={index}
              icon={benefit.icon}
              title={benefit.title}
              description={benefit.description}
              delay={index * 0.1}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default PartnershipBenefits;
