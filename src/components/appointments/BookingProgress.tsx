
import React from "react";

type BookingProgressProps = {
  currentStep: number;
};

const BookingProgress: React.FC<BookingProgressProps> = ({ currentStep }) => {
  return (
    <div className="mb-10">
      <div className="flex justify-between items-center">
        {[1, 2, 3, 4, 5].map((step) => (
          <div key={step} className="flex flex-col items-center">
            <div 
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                step < currentStep 
                  ? "bg-green-500 text-white" 
                  : step === currentStep 
                  ? "bg-conve-red text-white" 
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {step < currentStep ? "✓" : step}
            </div>
            <div className="text-xs text-gray-500 mt-2 text-center">
              {step === 1 && "Date & Time"}
              {step === 2 && "Patient Info"}
              {step === 3 && "Services"}
              {step === 4 && "Location"}
              {step === 5 && "Review"}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 relative">
        <div className="absolute top-0 h-1 bg-gray-200 w-full"></div>
        <div 
          className="absolute top-0 h-1 bg-conve-red transition-all duration-300" 
          style={{ width: `${(currentStep - 1) * 25}%` }}
        ></div>
      </div>
    </div>
  );
};

export default BookingProgress;
