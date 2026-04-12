
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import FunnelStep1Welcome from "./FunnelStep1Welcome";
import FunnelStep3HealthAssessment from "./FunnelStep3HealthAssessment";
import FunnelStep4Preferences from "./FunnelStep4Preferences";
import FunnelStep5Recommendation from "./FunnelStep5Recommendation";
import FunnelProgressBar from "./FunnelProgressBar";

export interface FunnelData {
  // Health Assessment
  labFrequency: string;
  healthGoals: string[];
  serviceLocation: string;
  
  // Preferences
  householdSize: number;
  preferredTimes: string[];
  specialRequirements: string[];
  
  // Tracking
  startedAt: Date;
  currentStep: number;
}

const initialData: FunnelData = {
  labFrequency: "",
  healthGoals: [],
  serviceLocation: "",
  householdSize: 1,
  preferredTimes: [],
  specialRequirements: [],
  startedAt: new Date(),
  currentStep: 1
};

const SalesFunnel = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [funnelData, setFunnelData] = useState<FunnelData>(initialData);
  const [direction, setDirection] = useState(0);

  // Load from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('convelabs-funnel-data');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setFunnelData({ ...parsed, startedAt: new Date(parsed.startedAt) });
        setCurrentStep(parsed.currentStep || 1);
      } catch (error) {
        console.error('Error loading saved funnel data:', error);
      }
    }
  }, []);

  // Save to localStorage whenever data changes
  useEffect(() => {
    localStorage.setItem('convelabs-funnel-data', JSON.stringify({
      ...funnelData,
      currentStep
    }));
  }, [funnelData, currentStep]);

  const updateData = (newData: Partial<FunnelData>) => {
    setFunnelData(prev => ({ ...prev, ...newData }));
  };

  const nextStep = () => {
    setDirection(1);
    setCurrentStep(prev => Math.min(prev + 1, 4));
  };

  const prevStep = () => {
    setDirection(-1);
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const stepVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 50 : -50,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 50 : -50,
      opacity: 0
    })
  };

  const stepTransition = {
    x: { type: "spring", stiffness: 300, damping: 30 },
    opacity: { duration: 0.2 }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <FunnelStep1Welcome onNext={nextStep} />;
      case 2:
        return (
          <FunnelStep3HealthAssessment
            data={funnelData}
            updateData={updateData}
            onNext={nextStep}
            onPrev={prevStep}
          />
        );
      case 3:
        return (
          <FunnelStep4Preferences
            data={funnelData}
            updateData={updateData}
            onNext={nextStep}
            onPrev={prevStep}
          />
        );
      case 4:
        return (
          <FunnelStep5Recommendation
            data={funnelData}
            onPrev={prevStep}
          />
        );
      default:
        return <FunnelStep1Welcome onNext={nextStep} />;
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute top-20 right-20 w-96 h-96 bg-conve-red rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
      </div>

      {/* Progress bar - only show after step 1 */}
      {currentStep > 1 && (
        <FunnelProgressBar currentStep={currentStep - 1} totalSteps={4} />
      )}

      {/* Step content */}
      <div className="relative z-10">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={stepTransition}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SalesFunnel;
