import React from 'react';
import { Helmet } from 'react-helmet-async';

export const MultilangSEO: React.FC = () => {
  return (
    <Helmet>
      {/* Multilingual Support - English Primary, Spanish Secondary */}
      <link rel="alternate" hrefLang="en" href="https://convelabs.com/" />
      <link rel="alternate" hrefLang="es" href="https://convelabs.com/es/" />
      <link rel="alternate" hrefLang="x-default" href="https://convelabs.com/" />
      
      {/* Accessibility & ADA Compliance Signals */}
      <meta name="accessibility" content="WCAG2.1 AA compliant" />
      <meta name="accessible-for" content="mobility,visual,hearing,cognitive" />
      <meta name="accessibility-features" content="keyboard-navigation,screen-reader-friendly,high-contrast-mode" />
      
      {/* COVID-19 Safety Schema */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CovidTestingFacility",
          "name": "ConveLabs Mobile Lab Services",
          "description": "Mobile lab services with enhanced COVID-19 safety protocols",
          "url": "https://convelabs.com",
          "telephone": "+1-941-527-9169",
          "covidTestingFacility": true,
          "healthcareReportingStructure": {
            "@type": "GovernmentOrganization",
            "name": "Florida Department of Health"
          },
          "hasHealthAspect": {
            "@type": "HealthAspectEnumeration",
            "name": "Prevention"
          },
          "additionalProperty": [
            {
              "@type": "PropertyValue",
              "name": "COVID-19 Safety Protocol",
              "value": "Enhanced PPE, sanitization, and social distancing measures"
            },
            {
              "@type": "PropertyValue", 
              "name": "Contactless Service",
              "value": "Minimal contact mobile phlebotomy with safety protocols"
            }
          ]
        })}
      </script>
      
      {/* Sustainability & Green Business Signals */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "ConveLabs Mobile Lab Services",
          "url": "https://convelabs.com",
          "sustainabilityPolicy": "https://convelabs.com/sustainability",
          "additionalProperty": [
            {
              "@type": "PropertyValue",
              "name": "Green Business Practice",
              "value": "Eco-friendly lab supplies and reduced carbon footprint through mobile services"
            },
            {
              "@type": "PropertyValue",
              "name": "Sustainability Commitment", 
              "value": "Reduced travel emissions through efficient mobile lab routing"
            }
          ]
        })}
      </script>
      
      {/* Military & Senior Discount Schema */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Offer",
          "name": "Military & Senior Discount Program",
          "description": "Special pricing for military personnel, veterans, and senior citizens",
          "url": "https://convelabs.com/discounts",
          "eligibleCustomerType": [
            "Military Personnel",
            "Veterans", 
            "Senior Citizens 65+"
          ],
          "priceSpecification": {
            "@type": "UnitPriceSpecification",
            "price": "79.00",
            "priceCurrency": "USD",
            "eligibleQuantity": {
              "@type": "QuantitativeValue",
              "value": "10% discount"
            }
          },
          "seller": {
            "@type": "Organization",
            "name": "ConveLabs Mobile Lab Services"
          }
        })}
      </script>
      
      {/* Partner & Affiliate Schemas */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "ConveLabs Mobile Lab Services",
          "url": "https://convelabs.com",
          "partner": [
            {
              "@type": "Organization",
              "name": "Quest Diagnostics",
              "url": "https://questdiagnostics.com"
            },
            {
              "@type": "Organization",
              "name": "LabCorp",
              "url": "https://labcorp.com"
            },
            {
              "@type": "Organization",
              "name": "Orlando Health",
              "url": "https://orlandohealth.com"
            }
          ],
          "memberOf": [
            {
              "@type": "Organization",
              "name": "Florida Medical Association"
            },
            {
              "@type": "Organization",
              "name": "American Society for Clinical Pathology"
            }
          ]
        })}
      </script>
      
      {/* Industry Award Schemas */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "ConveLabs Mobile Lab Services",
          "url": "https://convelabs.com",
          "award": [
            "Orlando Business Journal Best Healthcare Innovation 2024",
            "Central Florida Excellence in Patient Care Award 2024",
            "Florida Mobile Healthcare Provider of the Year 2023",
            "Customer Choice Award - Best Mobile Lab Service 2024"
          ],
          "hasCredential": [
            {
              "@type": "EducationalOccupationalCredential",
              "name": "HIPAA Compliance Certification",
              "credentialCategory": "Healthcare Compliance"
            },
            {
              "@type": "EducationalOccupationalCredential",
              "name": "Florida Licensed Phlebotomy Services",
              "credentialCategory": "Medical License"
            },
            {
              "@type": "EducationalOccupationalCredential",
              "name": "CLIA Waived Testing Certification",
              "credentialCategory": "Lab Testing"
            }
          ]
        })}
      </script>
    </Helmet>
  );
};