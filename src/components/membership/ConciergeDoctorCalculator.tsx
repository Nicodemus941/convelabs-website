
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { CheckCircle2, InfoIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const ConciergeDoctorCalculator = () => {
  const [patientCount, setPatientCount] = useState<number>(100);
  const [annualPrice, setAnnualPrice] = useState<number>(2400);
  const [labsPerPatient, setLabsPerPatient] = useState<number>(2);
  const [convenienceFee, setConvenienceFee] = useState<number>(50);

  const labSavingsPerPatient = 150;
  const annualRevenue = patientCount * annualPrice;
  const totalLabTests = patientCount * labsPerPatient;
  const labSavings = totalLabTests * labSavingsPerPatient;
  const convenienceFeeRevenue = totalLabTests * convenienceFee;
  const totalBenefit = labSavings + convenienceFeeRevenue;
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  };
  
  // Calculate membership tier based on patient count
  const calculateMembershipTier = () => {
    if (patientCount <= 50) return "Essential";
    if (patientCount <= 150) return "Professional";
    if (patientCount <= 300) return "Premium";
    return "Enterprise";
  };
  
  // Calculate monthly cost based on tier
  const calculateMonthlyCost = () => {
    const tier = calculateMembershipTier();
    switch (tier) {
      case "Essential": return 399;
      case "Professional": return 799;
      case "Premium": return 1499;
      default: return 2499; // Enterprise
    }
  };
  
  // Calculate annual cost
  const membershipCost = calculateMonthlyCost() * 12;
  
  // Calculate ROI
  const roi = (totalBenefit - membershipCost) / membershipCost * 100;

  // Handle slide change as string or number
  const handleSliderChange = (value: number | number[], setter: (value: number) => void) => {
    if (Array.isArray(value)) {
      setter(value[0]);
    } else {
      setter(value);
    }
  };
  
  return (
    <Card className="w-full shadow-lg border-2 border-gray-200">
      <CardHeader>
        <CardTitle className="text-2xl">Concierge Doctor ROI Calculator</CardTitle>
        <CardDescription>
          Estimate your practice's financial benefits from partnering with ConveLabs
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Patient Count Slider */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="patientCount">Number of Patients</Label>
            <Input 
              id="patientCountInput"
              type="number" 
              value={patientCount} 
              onChange={(e) => setPatientCount(parseInt(e.target.value) || 0)} 
              className="w-24 text-right" 
            />
          </div>
          <Slider 
            id="patientCount"
            min={10} 
            max={500}
            step={10}
            value={[patientCount]}
            onValueChange={(value) => handleSliderChange(value, setPatientCount)}
            className="py-4"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>10</span>
            <span>250</span>
            <span>500</span>
          </div>
        </div>
        
        {/* Annual Rate */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1">
              <Label htmlFor="annualRate">Annual Rate per Patient</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-4 w-4 text-gray-400" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Average annual membership fee charged to patients
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input 
              id="annualRateInput"
              type="number" 
              value={annualPrice} 
              onChange={(e) => setAnnualPrice(parseInt(e.target.value) || 0)} 
              className="w-28 text-right" 
              step={100}
            />
          </div>
          <Slider
            id="annualRate" 
            min={1000} 
            max={5000}
            step={100} 
            value={[annualPrice]}
            onValueChange={(value) => handleSliderChange(value, setAnnualPrice)}
            className="py-4"
          />
        </div>
        
        {/* Labs Per Patient */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="labsPerPatient">Lab Tests per Patient (Annual)</Label>
            <Input 
              id="labsPerPatientInput"
              type="number" 
              value={labsPerPatient} 
              onChange={(e) => setLabsPerPatient(parseInt(e.target.value) || 0)} 
              className="w-24 text-right" 
            />
          </div>
          <Slider 
            id="labsPerPatient"
            min={1} 
            max={6}
            step={1} 
            value={[labsPerPatient]}
            onValueChange={(value) => handleSliderChange(value, setLabsPerPatient)}
            className="py-4"
          />
        </div>
        
        {/* Convenience Fee */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1">
              <Label htmlFor="convenienceFee">Convenience Fee (per lab)</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-4 w-4 text-gray-400" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Additional fee charged to patients for at-home lab service
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input 
              id="convenienceFeeInput"
              type="number" 
              value={convenienceFee} 
              onChange={(e) => setConvenienceFee(parseInt(e.target.value) || 0)} 
              className="w-24 text-right" 
              step={5}
            />
          </div>
          <Slider 
            id="convenienceFee"
            min={0} 
            max={150}
            step={5} 
            value={[convenienceFee]}
            onValueChange={(value) => handleSliderChange(value, setConvenienceFee)}
            className="py-4"
          />
        </div>
        
        {/* Results */}
        <div className="p-4 bg-gray-50 rounded-lg space-y-4 mt-8">
          <h3 className="font-semibold text-lg">Your Estimated Benefits</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Membership Tier</p>
              <p className="font-medium text-lg">{calculateMembershipTier()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Monthly Cost</p>
              <p className="font-medium text-lg">{formatCurrency(calculateMonthlyCost())}</p>
            </div>
            
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Total Lab Tests</p>
              <p className="font-medium text-lg">{totalLabTests.toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Lab Savings</p>
              <p className="font-medium text-lg">{formatCurrency(labSavings)}</p>
            </div>
            
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Added Revenue (Fees)</p>
              <p className="font-medium text-lg">{formatCurrency(convenienceFeeRevenue)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Annual ROI</p>
              <p className="font-medium text-lg">{Math.round(roi)}%</p>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Total Annual Benefit</p>
                <p className="font-bold text-2xl text-green-600">{formatCurrency(totalBenefit - membershipCost)}</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-sm text-gray-500">Practice Revenue</p>
                <p className="font-medium">{formatCurrency(annualRevenue)}</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="flex flex-col space-y-4">
        <div className="flex items-start gap-2 text-sm text-gray-600">
          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
          <p>Based on actual data from our concierge doctor partners. Your results may vary depending on your specific practice and patient population.</p>
        </div>
        
        <Button className="w-full">Book a Consultation</Button>
      </CardFooter>
    </Card>
  );
};

export default ConciergeDoctorCalculator;
