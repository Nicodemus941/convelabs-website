import React from 'react';
import { Helmet } from 'react-helmet-async';

export const OrganizationSchema: React.FC = () => {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "ConveLabs Mobile Lab Services",
    "alternateName": "ConveLabs",
    "url": "https://convelabs.com",
    "logo": "https://convelabs.com/logo.png",
    "image": "https://convelabs.com/convelabs-team.jpg",
    "description": "Central Florida's premier luxury mobile phlebotomy and concierge lab services for executives, high-net-worth individuals, and busy professionals.",
    "telephone": "+1-941-527-9169",
    "email": "info@convelabs.com",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Orlando",
      "addressRegion": "FL",
      "addressCountry": "US"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": 28.5383,
      "longitude": -81.3792
    },
    "openingHoursSpecification": [
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
        "opens": "06:00",
        "closes": "13:30"
      },
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Saturday","Sunday"],
        "opens": "06:00",
        "closes": "13:30"
      }
    ],
    "sameAs": [
      "https://www.facebook.com/ConveLabs",
      "https://www.linkedin.com/company/convelabs",
      "https://www.instagram.com/convelabs",
      "https://twitter.com/convelabs"
    ],
    "founder": {
      "@type": "Person",
      "name": "ConveLabs Founder"
    },
    "numberOfEmployees": "15-25",
    "foundingDate": "2020",
    "memberOf": {
      "@type": "Organization",
      "name": "Florida Medical Association"
    },
    "awards": [
      "Orlando Business Journal Best Healthcare Innovation 2024",
      "Central Florida Excellence in Patient Care Award"
    ],
    "hasCredential": [
      {
        "@type": "EducationalOccupationalCredential",
        "name": "HIPAA Compliance Certification"
      },
      {
        "@type": "EducationalOccupationalCredential", 
        "name": "Florida Licensed Phlebotomy Services"
      }
    ],
    "knowsAbout": [
      "Mobile Phlebotomy",
      "Executive Health Screening", 
      "Concierge Medicine",
      "Luxury Healthcare Services",
      "Same-Day Lab Results"
    ],
    "areaServed": [
      "Orlando, FL",
      "Winter Park, FL", 
      "Windermere, FL",
      "Dr. Phillips, FL",
      "Bay Hill, FL",
      "Isleworth, FL"
    ]
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(organizationSchema)}
      </script>
    </Helmet>
  );
};