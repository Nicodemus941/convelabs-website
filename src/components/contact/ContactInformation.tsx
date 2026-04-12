
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import ContactPhone from "./ContactPhone";
import ContactEmail from "./ContactEmail";
import ContactAddress from "./ContactAddress";
import ContactHours from "./ContactHours";
import ServiceAreas from "./ServiceAreas";

const ContactInformation: React.FC = () => {
  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-xl font-semibold mb-6">Get In Touch</h2>
        
        <div className="space-y-6">
          <ContactPhone />
          <ContactEmail />
          <ContactAddress />
          <ContactHours />
        </div>
        
        <ServiceAreas />
      </CardContent>
    </Card>
  );
};

export default ContactInformation;
