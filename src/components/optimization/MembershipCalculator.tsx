import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useVisitorOptimization } from '@/hooks/useVisitorOptimization';

const MembershipCalculator = () => {
  const [testsPerYear, setTestsPerYear] = useState([6]);
  const { trackCTAClick } = useVisitorOptimization();

  const calculations = useMemo(() => {
    const tests = testsPerYear[0];
    const payPerServiceCost = tests * 199; // $199 per service
    
    // Membership costs
    const individualCost = 99 * 12; // $99/month
    const individualPlusCost = 199 * 12; // $199/month  
    const familyCost = 299 * 12; // $299/month
    
    // Savings calculations
    const individualSavings = payPerServiceCost - individualCost;
    const individualPlusSavings = payPerServiceCost - individualPlusCost;
    const familySavings = payPerServiceCost - familyCost;
    
    return {
      payPerService: payPerServiceCost,
      individual: {
        cost: individualCost,
        savings: individualSavings,
        credits: 4,
        breakEven: Math.ceil(individualCost / 199)
      },
      individualPlus: {
        cost: individualPlusCost,
        savings: individualPlusSavings,
        credits: 8,
        breakEven: Math.ceil(individualPlusCost / 199)
      },
      family: {
        cost: familyCost,
        savings: familySavings,
        credits: 10,
        breakEven: Math.ceil(familyCost / 199)
      }
    };
  }, [testsPerYear]);

  const handleMembershipClick = (planName: string) => {
    trackCTAClick(`Join ${planName} Membership`, 'calculator_widget');
  };

  const getBestValue = () => {
    const tests = testsPerYear[0];
    if (tests <= 4) return null;
    if (tests <= 8) return 'individual';
    if (tests <= 10) return 'individualPlus';
    return 'family';
  };

  const bestValue = getBestValue();

  return (
    <Card className="w-full max-w-4xl mx-auto bg-gradient-to-br from-background to-background/80">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-primary">
          Membership Savings Calculator
        </CardTitle>
        <p className="text-muted-foreground">
          See how much you could save with a ConveLabs membership
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Test Frequency Slider */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium">
              How many lab tests do you need per year?
            </label>
            <span className="text-lg font-bold text-primary">
              {testsPerYear[0]} tests
            </span>
          </div>
          <Slider
            value={testsPerYear}
            onValueChange={setTestsPerYear}
            max={20}
            min={1}
            step={1}
            className="w-full"
          />
        </div>

        {/* Cost Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Pay Per Service */}
          <Card className="border-2 border-muted">
            <CardContent className="p-4 text-center">
              <h3 className="font-semibold text-sm mb-2">Pay Per Service</h3>
              <div className="text-2xl font-bold text-destructive mb-2">
                ${calculations.payPerService.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                ${199} × {testsPerYear[0]} tests
              </p>
            </CardContent>
          </Card>

          {/* Individual Membership */}
          <Card className={`border-2 ${bestValue === 'individual' ? 'border-primary bg-primary/5' : 'border-muted'}`}>
            <CardContent className="p-4 text-center">
              <h3 className="font-semibold text-sm mb-2">
                Individual
                {bestValue === 'individual' && (
                  <span className="ml-1 px-2 py-1 bg-primary text-primary-foreground text-xs rounded">
                    Best Value
                  </span>
                )}
              </h3>
              <div className="text-2xl font-bold text-primary mb-2">
                ${calculations.individual.cost.toLocaleString()}
              </div>
              <div className="text-sm text-green-600 font-semibold mb-2">
                Save ${calculations.individual.savings.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                4 credits • $99/month
              </p>
              <Button 
                size="sm" 
                className="w-full"
                onClick={() => handleMembershipClick('Individual')}
                disabled={testsPerYear[0] < calculations.individual.breakEven}
              >
                Join Now
              </Button>
            </CardContent>
          </Card>

          {/* Individual +1 Membership */}
          <Card className={`border-2 ${bestValue === 'individualPlus' ? 'border-primary bg-primary/5' : 'border-muted'}`}>
            <CardContent className="p-4 text-center">
              <h3 className="font-semibold text-sm mb-2">
                Individual +1
                {bestValue === 'individualPlus' && (
                  <span className="ml-1 px-2 py-1 bg-primary text-primary-foreground text-xs rounded">
                    Best Value
                  </span>
                )}
              </h3>
              <div className="text-2xl font-bold text-primary mb-2">
                ${calculations.individualPlus.cost.toLocaleString()}
              </div>
              <div className="text-sm text-green-600 font-semibold mb-2">
                Save ${calculations.individualPlus.savings.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                8 credits • $199/month
              </p>
              <Button 
                size="sm" 
                className="w-full"
                onClick={() => handleMembershipClick('Individual +1')}
                disabled={testsPerYear[0] < calculations.individualPlus.breakEven}
              >
                Join Now
              </Button>
            </CardContent>
          </Card>

          {/* Family Membership */}
          <Card className={`border-2 ${bestValue === 'family' ? 'border-primary bg-primary/5' : 'border-muted'}`}>
            <CardContent className="p-4 text-center">
              <h3 className="font-semibold text-sm mb-2">
                Family
                {bestValue === 'family' && (
                  <span className="ml-1 px-2 py-1 bg-primary text-primary-foreground text-xs rounded">
                    Best Value
                  </span>
                )}
              </h3>
              <div className="text-2xl font-bold text-primary mb-2">
                ${calculations.family.cost.toLocaleString()}
              </div>
              <div className="text-sm text-green-600 font-semibold mb-2">
                Save ${calculations.family.savings.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                10 credits • $299/month
              </p>
              <Button 
                size="sm" 
                className="w-full"
                onClick={() => handleMembershipClick('Family')}
                disabled={testsPerYear[0] < calculations.family.breakEven}
              >
                Join Now
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Additional Info */}
        <div className="text-center text-sm text-muted-foreground">
          <p>
            * Calculations based on standard lab service pricing of $199 per test
          </p>
          <p>
            Memberships include same-day service, professional phlebotomists, and comprehensive lab panels
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default MembershipCalculator;