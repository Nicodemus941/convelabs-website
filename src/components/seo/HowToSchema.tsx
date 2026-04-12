import React from 'react';
import { Helmet } from 'react-helmet-async';

interface HowToStep {
  name: string;
  text: string;
  image?: string;
  url?: string;
}

interface HowToSchemaProps {
  name: string;
  description: string;
  estimatedCost?: string;
  totalTime?: string;
  steps: HowToStep[];
}

export const HowToSchema: React.FC<HowToSchemaProps> = ({ 
  name, 
  description, 
  estimatedCost, 
  totalTime, 
  steps 
}) => {
  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": name,
    "description": description,
    "image": "https://convelabs.com/how-to-book-mobile-lab.jpg",
    "estimatedCost": estimatedCost || "$89+",
    "totalTime": totalTime || "PT30M",
    "supply": [
      {
        "@type": "HowToSupply",
        "name": "Mobile Phlebotomy Kit"
      },
      {
        "@type": "HowToSupply", 
        "name": "HIPAA Compliant Lab Forms"
      }
    ],
    "tool": [
      {
        "@type": "HowToTool",
        "name": "ConveLabs Mobile App"
      }
    ],
    "step": steps.map((step, index) => ({
      "@type": "HowToStep",
      "name": step.name,
      "text": step.text,
      "image": step.image || `https://convelabs.com/step-${index + 1}.jpg`,
      "url": step.url || `https://convelabs.com/booking-step-${index + 1}`
    }))
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(howToSchema)}
      </script>
    </Helmet>
  );
};