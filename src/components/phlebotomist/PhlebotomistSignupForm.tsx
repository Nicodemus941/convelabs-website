
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form } from '@/components/ui/form';

import { signupSchema, defaultValues, PhlebotomistSignupFormValues } from './utils/formUtils';
import { usePhlebotomistSignup } from './hooks/usePhlebotomistSignup';
import { useSubscriptionTiers } from '@/hooks/useSubscriptionTiers';
import { Loader2 } from 'lucide-react';
import SubscriptionTierCard from '../tenant/SubscriptionTierCard';

import OrganizationDetailsFields from './form-sections/OrganizationDetailsFields';
import ContactInfoFields from './form-sections/ContactInfoFields';
import OrganizationTypeFields from './form-sections/OrganizationTypeFields';
import MessageField from './form-sections/MessageField';
import PasswordFields from './form-sections/PasswordFields';
import SubmitButton from './form-sections/SubmitButton';

const PhlebotomistSignupForm: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const { isSubmitting, handleSignup } = usePhlebotomistSignup();
  const { tiers, isLoading: tiersLoading } = useSubscriptionTiers();
  
  const form = useForm<PhlebotomistSignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues
  });

  // Select the professional tier by default when tiers load
  useEffect(() => {
    if (tiers.length > 0 && !selectedTierId) {
      // Find the professional tier
      const professionalTier = tiers.find(tier => tier.name === 'Professional');
      setSelectedTierId(professionalTier?.id || tiers[0].id);
    }
  }, [tiers]);

  const handleSelectTier = (tierId: string) => {
    setSelectedTierId(tierId);
  };

  const nextStep = () => {
    setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const onSubmit = (data: PhlebotomistSignupFormValues) => {
    if (!selectedTierId) {
      return;
    }
    handleSignup({ ...data, subscriptionTierId: selectedTierId });
  };

  // Render account creation step
  const renderAccountStep = () => (
    <div className="space-y-6">
      <OrganizationDetailsFields form={form} />
      <ContactInfoFields form={form} />
      <OrganizationTypeFields form={form} />
      <PasswordFields form={form} />
      <MessageField form={form} />
      
      <div className="flex justify-end">
        <SubmitButton 
          isSubmitting={false}
          onClick={nextStep}
          text="Next: Select Plan"
          disabled={!form.formState.isValid}
        />
      </div>
    </div>
  );

  // Render subscription plan selection step
  const renderSubscriptionStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Select a Subscription Plan</h2>
        <p className="text-gray-500 text-sm">Choose the plan that best fits your organization's needs.</p>
      </div>
      
      {tiersLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tiers.map((tier) => (
            <SubscriptionTierCard
              key={tier.id}
              tier={tier}
              isSelected={tier.id === selectedTierId}
              onSelect={handleSelectTier}
              isPrimary={tier.name === 'Professional'} // Mark Professional as popular
            />
          ))}
        </div>
      )}
      
      <div className="flex justify-between">
        <SubmitButton 
          isSubmitting={false}
          variant="outline" 
          onClick={prevStep}
          text="Back"
        />
        
        <SubmitButton 
          isSubmitting={isSubmitting}
          onClick={form.handleSubmit(onSubmit)}
          text="Complete Sign Up"
          disabled={!selectedTierId}
        />
      </div>
    </div>
  );

  return (
    <Form {...form}>
      <form className="space-y-6">
        <div className="mb-6">
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 1 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>1</div>
            <div className={`h-1 flex-1 mx-2 ${currentStep > 1 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 2 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>2</div>
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-sm font-medium">Organization Details</span>
            <span className="text-sm font-medium">Select Plan</span>
          </div>
        </div>
        
        {currentStep === 1 ? renderAccountStep() : renderSubscriptionStep()}
      </form>
    </Form>
  );
};

export default PhlebotomistSignupForm;
