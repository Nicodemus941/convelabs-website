
import React from "react";
import { Code, Rocket, HeartPulse, Briefcase } from "lucide-react";
import FeatureCard from "./FeatureCard";

const WhyConveLabs: React.FC = () => {
  const features = [
    {
      icon: <Code className="w-8 h-8 text-conve-red" />,
      title: "Experienced Development Team",
      description: "Our team has built medical software solutions for clinics and hospitals across the country."
    },
    {
      icon: <Rocket className="w-8 h-8 text-conve-red" />,
      title: "Ready to Scale",
      description: "Our platform infrastructure is designed to grow with your practice, from startup to enterprise."
    },
    {
      icon: <HeartPulse className="w-8 h-8 text-conve-red" />,
      title: "Healthcare Focused",
      description: "Built specifically for the medical industry with features tailored to healthcare providers."
    },
    {
      icon: <Briefcase className="w-8 h-8 text-conve-red" />,
      title: "Business Development",
      description: "We're not just tech providers—we're partners in helping your practice grow and succeed."
    }
  ];

  return (
    <section className="py-16 md:py-24 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Why Partner with ConveLabs?</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            We've built a proven system that helps medical practices establish a strong digital presence and grow their patient base.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <FeatureCard 
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyConveLabs;
