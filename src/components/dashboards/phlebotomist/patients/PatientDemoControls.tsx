
import React from 'react';
import { Button } from '@/components/ui/button';

interface PatientDemoControlsProps {
  onSimulatePatientArrival: () => void;
}

export const PatientDemoControls: React.FC<PatientDemoControlsProps> = ({ 
  onSimulatePatientArrival 
}) => {
  return (
    <div className="border-t pt-4 mt-4">
      <h4 className="text-sm font-medium mb-3">Demo Controls</h4>
      <Button variant="outline" onClick={onSimulatePatientArrival}>
        Simulate Patient Arrival
      </Button>
    </div>
  );
};
