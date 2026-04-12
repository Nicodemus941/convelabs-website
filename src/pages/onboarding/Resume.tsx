
import React from 'react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const ResumePage: React.FC = () => {
  const navigate = useNavigate();
  
  const handleContinue = () => {
    navigate('/onboarding/plan-selection');
  };
  
  return (
    <OnboardingLayout currentStep={1} totalSteps={4}>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Resume Your Onboarding</h2>
        <p className="text-gray-600">
          You've already started the onboarding process. Would you like to continue
          from where you left off?
        </p>
        
        <div className="space-y-4">
          <Button 
            onClick={handleContinue}
            className="w-full"
          >
            Continue Onboarding
          </Button>
          
          <div className="text-center">
            <Button 
              variant="link" 
              onClick={() => navigate('/')}
            >
              Start Over
            </Button>
          </div>
        </div>
      </div>
    </OnboardingLayout>
  );
};

export default ResumePage;
