
import React from "react";
import { useParams, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import { Container } from "@/components/ui/container";
import { 
  ServiceHeader, 
  BenefitsSection, 
  ProcessSection, 
  FAQSection, 
  CTASection 
} from "@/components/locations/ServiceContent";
import { ServiceAreas } from "@/components/locations/ServiceAreas";
import { winterParkServicesContent, winterParkAreas } from "@/data/locations/winterParkServices";

const WinterParkServices: React.FC = () => {
  const { serviceType } = useParams<{ serviceType: string }>();
  const locationName = "Winter Park";
  
  // If service type doesn't exist, redirect to Winter Park main page
  if (!serviceType || !winterParkServicesContent[serviceType]) {
    return <Navigate to="/winter-park" replace />;
  }
  
  const service = winterParkServicesContent[serviceType];
  
  return (
    <DashboardWrapper>
      <Helmet>
        <title>{service.title} | ConveLabs Winter Park</title>
        <meta name="description" content={service.description} />
        <meta property="og:title" content={service.title} />
        <meta property="og:description" content={service.description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://convelabs.com/winter-park/${serviceType}`} />
        <link rel="canonical" href={`https://convelabs.com/winter-park/${serviceType}`} />
      </Helmet>

      <Container className="py-12">
        <div className="max-w-4xl mx-auto">
          {/* Back to Winter Park link */}
          <Link to="/winter-park" className="inline-flex items-center text-muted-foreground hover:text-primary mb-8">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Winter Park Services
          </Link>
          
          {/* Service Header */}
          <ServiceHeader service={service} locationName={locationName} />
          
          {/* Benefits Section */}
          <BenefitsSection service={service} locationName={locationName} />
          
          {/* Process Section */}
          <ProcessSection service={service} locationName={locationName} />
          
          {/* Service Areas */}
          <ServiceAreas locationName={locationName} areas={winterParkAreas} />
          
          {/* FAQ Section */}
          <FAQSection service={service} locationName={locationName} />
          
          {/* CTA Section */}
          <CTASection locationName={locationName} />
        </div>
      </Container>
    </DashboardWrapper>
  );
};

export default WinterParkServices;
