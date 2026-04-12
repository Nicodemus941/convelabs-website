
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AccountSecurityStep from '../onboarding-steps/AccountSecurityStep';
import UserDetailsStep from '../onboarding-steps/UserDetailsStep';
import BookingStep from '../onboarding-steps/BookingStep';
import ConciergeSetupStep from '../onboarding-steps/ConciergeSetupStep';

interface OnboardingTabsProps {
  activeStep: string;
  isConciergeDoctor: boolean;
  onStepChange: (step: string) => void;
}

const OnboardingTabs: React.FC<OnboardingTabsProps> = ({
  activeStep,
  isConciergeDoctor,
  onStepChange
}) => {
  return (
    <Tabs value={activeStep} onValueChange={onStepChange} className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="security">Account Security</TabsTrigger>
        <TabsTrigger value="details">Personal Details</TabsTrigger>
        <TabsTrigger value={isConciergeDoctor ? "concierge" : "booking"}>
          {isConciergeDoctor ? "Practice Setup" : "Book First Visit"}
        </TabsTrigger>
      </TabsList>
      
      <div className="mt-8">
        <TabsContent value="security" className="space-y-4">
          <AccountSecurityStep />
        </TabsContent>
        
        <TabsContent value="details" className="space-y-4">
          <UserDetailsStep />
        </TabsContent>
        
        <TabsContent value="booking" className="space-y-4">
          <BookingStep />
        </TabsContent>
        
        <TabsContent value="concierge" className="space-y-4">
          <ConciergeSetupStep />
        </TabsContent>
      </div>
    </Tabs>
  );
};

export default OnboardingTabs;
