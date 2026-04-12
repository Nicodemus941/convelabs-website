
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ContactOfficeSection from "./communications/ContactOfficeSection";
import AlertStatusSection from "./communications/AlertStatusSection";
import RecentCommunicationsSection from "./communications/RecentCommunicationsSection";

const CommunicationsTab: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Communications</CardTitle>
        <CardDescription>Stay connected with the office and patients</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <ContactOfficeSection />
          <AlertStatusSection />
          <RecentCommunicationsSection />
        </div>
      </CardContent>
    </Card>
  );
};

export default CommunicationsTab;
