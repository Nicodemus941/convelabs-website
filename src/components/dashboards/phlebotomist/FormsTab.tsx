
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PatientFormsSection from "./forms/PatientFormsSection";
import DigitalSignatureSection from "./forms/DigitalSignatureSection";
import PhotoDocumentationSection from "./forms/PhotoDocumentationSection";

const FormsTab: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Digital Forms</CardTitle>
        <CardDescription>Manage patient forms and signatures</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <PatientFormsSection />
          <DigitalSignatureSection />
          <PhotoDocumentationSection />
        </div>
      </CardContent>
    </Card>
  );
};

export default FormsTab;
