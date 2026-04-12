
import React from 'react';
import { Button } from '@/components/ui/button';

interface SupplyDemoControlsProps {
  onUpdateSupply: (id: string, newLevel: number) => void;
}

export const SupplyDemoControls: React.FC<SupplyDemoControlsProps> = ({ onUpdateSupply }) => {
  return (
    <div className="mt-6 border-t pt-4">
      <h4 className="text-sm font-medium mb-3">Quick Update (Demo)</h4>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={() => onUpdateSupply('1', 5)}>
          Set Red Tubes Low
        </Button>
        <Button variant="outline" size="sm" onClick={() => onUpdateSupply('3', 3)}>
          Set Biohazard Bags Low
        </Button>
      </div>
    </div>
  );
};
