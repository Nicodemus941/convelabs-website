
import React from "react";
import { motion } from "framer-motion";

interface FunnelProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

const FunnelProgressBar = ({ currentStep, totalSteps }: FunnelProgressBarProps) => {
  const progress = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-b border-gray-100/60">
      <div className="container mx-auto px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs sm:text-sm font-medium text-gray-600">
            Step {currentStep} of {totalSteps}
          </div>
          <div className="text-xs sm:text-sm text-conve-red font-semibold">
            {Math.round(progress)}% Complete
          </div>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-conve-red to-conve-red-dark rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>
    </div>
  );
};

export default FunnelProgressBar;
