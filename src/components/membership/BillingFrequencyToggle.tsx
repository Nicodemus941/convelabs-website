
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface BillingFrequencyToggleProps {
  billingFrequency: 'monthly' | 'quarterly' | 'annual';
  setBillingFrequency: (frequency: 'monthly' | 'quarterly' | 'annual') => void;
  annualOnly?: boolean;
}

export const BillingFrequencyToggle = ({ 
  billingFrequency, 
  setBillingFrequency,
  annualOnly = false
}: BillingFrequencyToggleProps) => {
  return (
    <div className="flex flex-col items-center space-y-2">
      <h2 className="text-lg font-medium">Billing Frequency</h2>
      <Tabs defaultValue={billingFrequency} value={billingFrequency} onValueChange={(value) => setBillingFrequency(value as 'monthly' | 'quarterly' | 'annual')}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger 
            value="monthly" 
            disabled={annualOnly}
            className={annualOnly ? "opacity-50 cursor-not-allowed" : ""}
          >
            Monthly
          </TabsTrigger>
          <TabsTrigger 
            value="quarterly" 
            disabled={annualOnly}
            className={annualOnly ? "opacity-50 cursor-not-allowed" : ""}
          >
            Quarterly
          </TabsTrigger>
          <TabsTrigger value="annual">
            Annual
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {annualOnly && (
        <p className="text-sm text-muted-foreground italic">
          This plan is available with annual billing only
        </p>
      )}
    </div>
  );
};
