import React from 'react';
import { Helmet } from 'react-helmet-async';

interface EventSchemaProps {
  name: string;
  description: string;
  startDate: string;
  endDate?: string;
  location: {
    name: string;
    address: string;
  };
  organizer: string;
  eventType?: string;
}

export const EventSchema: React.FC<EventSchemaProps> = ({ 
  name, 
  description, 
  startDate, 
  endDate, 
  location, 
  organizer,
  eventType = "HealthcareBusiness"
}) => {
  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": name,
    "description": description,
    "startDate": startDate,
    "endDate": endDate || startDate,
    "eventStatus": "https://schema.org/EventScheduled",
    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
    "location": {
      "@type": "Place",
      "name": location.name,
      "address": {
        "@type": "PostalAddress",
        "streetAddress": location.address,
        "addressLocality": "Orlando",
        "addressRegion": "FL",
        "addressCountry": "US"
      }
    },
    "organizer": {
      "@type": "Organization",
      "name": organizer,
      "telephone": "+1-941-527-9169",
      "url": "https://convelabs.com"
    },
    "offers": {
      "@type": "Offer",
      "url": "https://convelabs.com/contact",
      "price": "0",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock"
    }
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(eventSchema)}
      </script>
    </Helmet>
  );
};