
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plan } from './PlanTypes';
import { formatCurrency, getBillingPrice } from './PlanUtils';

interface BillingSectionProps {
  selectedPlan: Plan;
  selectedBilling: 'monthly' | 'quarterly' | 'annual';
  setSelectedBilling: (billing: 'monthly' | 'quarterly' | 'annual') => void;
}

const BillingSection: React.FC<BillingSectionProps> = ({
  selectedPlan,
  selectedBilling,
  setSelectedBilling
}) => {
  if (selectedPlan?.isConciergeDoctor) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold mb-4">Billing Frequency</h3>
        <Tabs 
          value={selectedBilling} 
          onValueChange={(v: string) => setSelectedBilling(v as 'monthly' | 'quarterly' | 'annual')}
        >
          <TabsList className="grid grid-cols-3 mb-6">
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
            <TabsTrigger value="annual">Annual (Save 10%)</TabsTrigger>
          </TabsList>
          
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium">{selectedPlan.name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedBilling === 'annual' && '10% discount applied'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">
                {formatCurrency(getBillingPrice(selectedPlan, selectedBilling))}
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedBilling === 'monthly' && 'per month'}
                {selectedBilling === 'quarterly' && 'per quarter'}
                {selectedBilling === 'annual' && 'per year'}
              </div>
            </div>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default BillingSection;
