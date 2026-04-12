
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, RefreshCw } from 'lucide-react';
import { SupplyLevelItem } from './equipment/SupplyLevelItem';
import { SupplyDemoControls } from './equipment/SupplyDemoControls';
import { useSuppliesState } from './equipment/useSuppliesState';

export const EquipmentAlertSystem = () => {
  const {
    supplies,
    getLevelColor,
    getPercentage,
    handleUpdateSupply,
    handleRequestRestock,
    updateAllSupplies
  } = useSuppliesState();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center">
              <Package className="mr-2 h-5 w-5" /> Equipment Status
            </CardTitle>
            <CardDescription>Monitor supply levels for your equipment</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={updateAllSupplies}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {supplies.map(supply => (
            <SupplyLevelItem
              key={supply.id}
              supply={supply}
              onRequestRestock={handleRequestRestock}
              getLevelColor={getLevelColor}
              getPercentage={getPercentage}
            />
          ))}
          
          <SupplyDemoControls onUpdateSupply={handleUpdateSupply} />
        </div>
      </CardContent>
    </Card>
  );
};
