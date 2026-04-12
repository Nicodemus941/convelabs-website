
import React from "react";

interface StepCardProps {
  step: number;
  title: string;
  description: string;
}

const StepCard = ({ step, title, description }: StepCardProps) => {
  return (
    <div className="text-center p-6 relative">
      <div className="w-14 h-14 bg-conve-red text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-md">
        <span className="font-bold text-lg">{step}</span>
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-gray-700">{description}</p>
      
      {/* Connection line between steps (hidden on mobile) */}
      {step < 4 && (
        <div className="hidden lg:block absolute top-[2.75rem] left-[calc(50%+2rem)] w-[calc(100%-4rem)] h-0.5 bg-gray-200"></div>
      )}
    </div>
  );
};

export default StepCard;
