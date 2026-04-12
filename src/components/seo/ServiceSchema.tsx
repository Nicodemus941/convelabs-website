import React from 'react';
import { Helmet } from 'react-helmet-async';

interface ServiceOfferProps {
  name: string;
  description: string;
  price?: string;
  category: string;
  areaServed: string[];
  provider: string;
}

export const ServiceSchema: React.FC<ServiceOfferProps> = ({ 
  name, 
  description, 
  price, 
  category,
  areaServed,
  provider 
}) => {
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": name,
    "description": description,
    "provider": {
      "@type": "MedicalBusiness",
      "name": provider,
      "telephone": "+1-941-527-9169",
      "url": "https://convelabs.com"
    },
    "areaServed": areaServed.map(area => ({
      "@type": "City",
      "name": area
    })),
    "serviceType": category,
    "offers": {
      "@type": "Offer",
      "price": price || "89.00",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
      "validFrom": "2024-01-01",
      "priceValidUntil": "2024-12-31"
    },
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Mobile Lab Services",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Executive Health Panel",
            "description": "Comprehensive blood work for busy executives"
          }
        },
        {
          "@type": "Offer", 
          "itemOffered": {
            "@type": "Service",
            "name": "Same-Day Results",
            "description": "Urgent lab results within hours"
          }
        }
      ]
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "5.0",
      "reviewCount": "127",
      "bestRating": "5",
      "worstRating": "1"
    }
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(serviceSchema)}
      </script>
    </Helmet>
  );
};