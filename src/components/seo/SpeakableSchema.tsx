import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SpeakableSchemaProps {
  cssSelector?: string[];
  xpath?: string[];
}

export const SpeakableSchema: React.FC<SpeakableSchemaProps> = ({ 
  cssSelector = ['.speakable-content', '.hero-title', '.service-description'],
  xpath 
}) => {
  const speakableSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "ConveLabs - Luxury Mobile Lab Services Orlando",
    "speakable": {
      "@type": "SpeakableSpecification",
      ...(cssSelector && { "cssSelector": cssSelector }),
      ...(xpath && { "xpath": xpath })
    }
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(speakableSchema)}
      </script>
    </Helmet>
  );
};