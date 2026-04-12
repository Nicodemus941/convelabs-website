
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PricingIndividualTab } from "./PricingIndividualTab";
import { PricingDoctorTab } from "./PricingDoctorTab";

export const PricingTabs = () => {
  const [activeTab, setActiveTab] = useState("individual");

  return (
    <Tabs defaultValue="individual" value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="flex justify-center mb-8">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="individual" className="text-base">Individual & Family</TabsTrigger>
          <TabsTrigger value="doctor" className="text-base">Concierge Doctors</TabsTrigger>
        </TabsList>
      </div>
      
      <TabsContent value="individual">
        <PricingIndividualTab />
      </TabsContent>
      
      <TabsContent value="doctor">
        <PricingDoctorTab />
      </TabsContent>
    </Tabs>
  );
};
