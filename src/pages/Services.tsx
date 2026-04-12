
import React from "react";
import { ServiceGrid } from "@/components/services/ServiceGrid";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";

const Services: React.FC = () => {
  return (
    <DashboardWrapper requireAuth={false}>
      <div className="container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-center mb-8">Our Services</h1>
        <p className="text-lg text-center text-muted-foreground max-w-3xl mx-auto mb-12">
          ConveLabs offers a comprehensive range of high-quality laboratory services, 
          all delivered with white-glove care and convenience.
        </p>
        
        <ServiceGrid />
      </div>
    </DashboardWrapper>
  );
};

export default Services;
