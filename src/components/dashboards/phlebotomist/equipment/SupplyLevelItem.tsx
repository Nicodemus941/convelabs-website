
import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { SupplyItem } from './SupplyTypes';

interface SupplyLevelItemProps {
  supply: SupplyItem;
  onRequestRestock: (id: string) => void;
  getLevelColor: (level: number, threshold: number) => string;
  getPercentage: (level: number, threshold: number) => number;
}

export const SupplyLevelItem: React.FC<SupplyLevelItemProps> = ({
  supply,
  onRequestRestock,
  getLevelColor,
  getPercentage
}) => {
  const isLow = supply.level <= supply.threshold;
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <span className="text-sm font-medium">{supply.name}</span>
          {isLow && (
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              <AlertTriangle className="h-3 w-3 mr-1" /> Low
            </span>
          )}
        </div>
        <span className="text-sm">{supply.level} {supply.unit}</span>
      </div>
      <Progress 
        value={getPercentage(supply.level, supply.threshold)} 
        className="h-2"
        indicatorClassName={getLevelColor(supply.level, supply.threshold)} 
      />
      <div className="flex justify-between pt-1">
        <div className="text-xs text-muted-foreground">
          Last updated: {supply.lastUpdated.toLocaleTimeString()}
        </div>
        {isLow && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => onRequestRestock(supply.id)}
          >
            Request restock
          </Button>
        )}
      </div>
    </div>
  );
};
