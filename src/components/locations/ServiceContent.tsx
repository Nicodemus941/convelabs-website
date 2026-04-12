
import React from "react";

export interface ServiceContentType {
  title: string;
  description: string;
  benefits: string[];
  process: string[];
  faqs: {
    question: string;
    answer: string;
  }[];
}

export interface ServiceContentProps {
  service: ServiceContentType;
  locationName: string;
}

export const ServiceHeader: React.FC<ServiceContentProps> = ({ service, locationName }) => {
  return (
    <>
      <h1 className="text-4xl font-bold mb-6">{service.title}</h1>
      <p className="text-xl text-gray-700 mb-10">{service.description}</p>
    </>
  );
};

export const BenefitsSection: React.FC<ServiceContentProps> = ({ service, locationName }) => {
  return (
    <div className="bg-gray-50 rounded-xl p-8 mb-10">
      <h2 className="text-2xl font-bold mb-6">Benefits for {locationName} Residents</h2>
      <div className="space-y-3">
        {service.benefits.map((benefit, index) => (
          <div key={index} className="flex items-start">
            <div className="mt-1 bg-primary/10 p-1 rounded-full">
              <Check className="h-5 w-5 text-primary" />
            </div>
            <p className="ml-4 text-lg">{benefit}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ProcessSection: React.FC<ServiceContentProps> = ({ service, locationName }) => {
  return (
    <div className="mb-10">
      <h2 className="text-2xl font-bold mb-6">How It Works in {locationName}</h2>
      <div className="space-y-4">
        {service.process.map((step, index) => (
          <div key={index} className="flex items-start">
            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">
              {index + 1}
            </div>
            <p className="ml-4 text-lg pt-1">{step}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export const FAQSection: React.FC<ServiceContentProps> = ({ service }) => {
  return (
    <div className="mb-12">
      <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
      <div className="space-y-6">
        {service.faqs.map((faq, index) => (
          <div key={index} className="border border-gray-200 rounded-lg p-6 hover:border-primary/30 transition-colors">
            <h3 className="text-lg font-bold mb-2">{faq.question}</h3>
            <p className="text-gray-700">{faq.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export const CTASection: React.FC<{ locationName: string }> = ({ locationName }) => {
  return (
    <div className="text-center bg-primary/5 p-8 rounded-xl border border-primary/10">
      <h2 className="text-2xl font-bold mb-4">Ready to Experience Premium Service in {locationName}?</h2>
      <p className="text-lg mb-6">
        Join our members who enjoy convenient, professional lab services throughout {locationName}.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Button size="lg" asChild>
          <Link to="/appointments">Schedule Now <ArrowRight className="ml-2 h-5 w-5" /></Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link to="/pricing">View Membership Plans</Link>
        </Button>
      </div>
    </div>
  );
};

// Missing imports
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
