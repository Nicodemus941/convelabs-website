
import React from "react";
import { Button } from "@/components/ui/button";

interface TabNavigationProps {
  onPrevious?: () => void;
  onNext?: () => void;
  showPrevious?: boolean;
  showNext?: boolean;
  isSubmitting?: boolean;
  activeTab?: string;
  onPrev?: () => void;
  isLastStep?: boolean;
}

const TabNavigation: React.FC<TabNavigationProps> = ({ 
  onPrevious, 
  onNext, 
  showPrevious = true, 
  showNext = true,
  isSubmitting = false,
  onPrev,
  isLastStep = false
}) => {
  // Use onPrev if provided, otherwise use onPrevious
  const handlePrevious = onPrev || onPrevious;
  
  return (
    <div className="pt-4 flex justify-between">
      {showPrevious ? (
        <Button type="button" variant="outline" onClick={handlePrevious}>
          Previous
        </Button>
      ) : <div />}
      
      {showNext && (
        <Button type="button" onClick={onNext} disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : isLastStep ? "Submit" : "Next"}
        </Button>
      )}
    </div>
  );
};

export default TabNavigation;
