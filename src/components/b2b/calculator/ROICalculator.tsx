import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { industryContent } from '@/data/b2bContent';
import CalculatorInputs from './CalculatorInputs';
import CalculatorResults from './CalculatorResults';
import { Button } from '@/components/ui/button';
import { Calculator } from 'lucide-react';
import { IndustryType, ROICalculatorInputs, ROICalculatorResults } from '@/types/b2bTypes';

interface ROICalculatorProps {
  selectedIndustry: IndustryType;
}

const ROICalculator: React.FC<ROICalculatorProps> = ({ selectedIndustry }) => {
  const [calculatorInputs, setCalculatorInputs] = useState<ROICalculatorInputs>({
    volume: 0,
    avgValue: 0,
    currentSpend: 0,
  });
  const [calculatorResults, setCalculatorResults] = useState<ROICalculatorResults | null>(null);
  const [showCalculatorResults, setShowCalculatorResults] = useState(false);

  const content = industryContent[selectedIndustry];

  const calculateROI = () => {
    const { volume, avgValue, currentSpend = 0 } = calculatorInputs;
    
    if (!volume || !avgValue) {
      return;
    }

    const { revenueMultiplier, savingsMultiplier, baseValue } = content.roiMetrics;
    
    // Calculate based on industry-specific logic
    const annualVolume = volume * 12;
    const annualValue = annualVolume * avgValue;
    
    const additionalRevenue = Math.max(
      (annualValue * revenueMultiplier) + baseValue,
      baseValue
    );
    
    const costSavings = currentSpend > 0 
      ? currentSpend * savingsMultiplier 
      : annualValue * savingsMultiplier;
    
    const totalValue = additionalRevenue + costSavings;
    const monthlyValue = totalValue / 12;

    const results = {
      additionalRevenue,
      costSavings,
      totalValue,
      monthlyValue,
    };

    setCalculatorResults(results);
    setShowCalculatorResults(true);
  };

  // Reset results when industry changes
  useEffect(() => {
    setShowCalculatorResults(false);
    setCalculatorResults(null);
  }, [selectedIndustry, setShowCalculatorResults, setCalculatorResults]);

  return (
    <section id="roi-calculator" className="py-20 bg-gradient-to-br from-gray-50 to-white">
      <div className="container mx-auto px-4">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <Calculator className="w-10 h-10 text-conve-red" />
            <h2 className="text-4xl md:text-5xl font-bold text-gray-800">
              Partnership ROI Calculator
            </h2>
          </div>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Discover the measurable value a ConveLabs partnership can deliver to your {content.name.toLowerCase()}
          </p>
        </motion.div>

        <div className="max-w-6xl mx-auto">
          <motion.div
            className="bg-white rounded-3xl shadow-luxury p-8 md:p-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Input Section */}
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-6">
                  Tell us about your organization
                </h3>
                <CalculatorInputs 
                  inputs={calculatorInputs}
                  onInputChange={(inputs) => setCalculatorInputs(prev => ({ ...prev, ...inputs }))}
                  selectedIndustry={selectedIndustry}
                />
                
                <div className="mt-8">
                  <Button 
                    onClick={calculateROI}
                    size="lg"
                    className="w-full bg-gradient-to-r from-conve-red to-purple-700 hover:from-conve-red-dark hover:to-purple-800 text-white py-4 h-auto text-lg font-semibold shadow-luxury-red"
                    disabled={!calculatorInputs.volume || !calculatorInputs.avgValue}
                  >
                    Calculate Partnership Value
                  </Button>
                </div>
              </div>

              {/* Results Section */}
              <div className="lg:pl-8">
                {showCalculatorResults && calculatorResults ? (
                  <CalculatorResults 
                    results={calculatorResults} 
                    industry={selectedIndustry}
                    inputs={calculatorInputs}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-400">
                      <Calculator className="w-24 h-24 mx-auto mb-6 opacity-30" />
                      <p className="text-lg">
                        Enter your information to see your personalized ROI calculation
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default ROICalculator;