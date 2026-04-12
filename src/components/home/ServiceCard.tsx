
import React from "react";
import { ArrowRight } from "lucide-react";

interface ServiceCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  learnMoreLink?: string;
}

const ServiceCard = ({ icon, description, title, learnMoreLink }: ServiceCardProps) => {
  return (
    <div className="luxury-card p-8 h-full flex flex-col transition-all duration-300 hover:shadow-lg bg-white border border-gray-100">
      <div className="mb-6 inline-flex p-4 bg-conve-red/5 rounded-lg">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-gray-700 mb-6 flex-grow">{description}</p>
      {learnMoreLink && (
        <div className="mt-auto flex items-center text-conve-red font-medium">
          Learn More <ArrowRight className="ml-2 h-4 w-4" />
        </div>
      )}
    </div>
  );
};

export default ServiceCard;
