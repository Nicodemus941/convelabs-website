
import React from 'react';

interface OnboardingLayoutProps {
  children: React.ReactNode;
  currentStep: number;
  totalSteps: number;
}

const OnboardingLayout: React.FC<OnboardingLayoutProps> = ({ children, currentStep, totalSteps }) => {
  const percentage = (currentStep / totalSteps) * 100;
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-grow container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Progress bar */}
          <div className="mb-6">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-conve-red h-2.5 rounded-full" 
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-sm">Step {currentStep} of {totalSteps}</span>
              <span className="text-sm">{Math.round(percentage)}%</span>
            </div>
          </div>
          
          {/* Content */}
          <div className="bg-white p-6 rounded-lg shadow-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingLayout;
