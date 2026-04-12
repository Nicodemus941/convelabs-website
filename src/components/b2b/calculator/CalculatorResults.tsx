import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { TrendingUp, DollarSign, PiggyBank, Calendar } from 'lucide-react';
import { ROICalculatorResults } from '@/types/b2bTypes';
import { generateCustomProposal } from '@/utils/generateCustomProposal';

interface CalculatorResultsProps {
  results: ROICalculatorResults;
  industry?: string;
  inputs?: { volume: number; avgValue: number; currentSpend?: number };
}

const CalculatorResults: React.FC<CalculatorResultsProps> = ({ results, industry = 'healthcare', inputs }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleGenerateProposal = async () => {
    if (!inputs) return;
    
    setIsGenerating(true);
    try {
      await generateCustomProposal(results, industry as any, inputs);
    } catch (error) {
      console.error('Error generating custom proposal:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6 }}
      className="space-y-6"
    >
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-gray-800 mb-2">Your Partnership Value</h3>
        <p className="text-gray-600">Projected annual benefits from ConveLabs partnership</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div
          className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-2xl border border-green-200"
          whileHover={{ scale: 1.02 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="w-8 h-8 text-green-600" />
            <div>
              <h4 className="font-semibold text-green-800">Additional Revenue</h4>
              <p className="text-sm text-green-600">Annual increase</p>
            </div>
          </div>
          <div className="text-3xl font-bold text-green-700">
            {formatCurrency(results.additionalRevenue)}
          </div>
        </motion.div>

        <motion.div
          className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-2xl border border-blue-200"
          whileHover={{ scale: 1.02 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <PiggyBank className="w-8 h-8 text-blue-600" />
            <div>
              <h4 className="font-semibold text-blue-800">Cost Savings</h4>
              <p className="text-sm text-blue-600">Annual reduction</p>
            </div>
          </div>
          <div className="text-3xl font-bold text-blue-700">
            {formatCurrency(results.costSavings)}
          </div>
        </motion.div>
      </div>

      <motion.div
        className="bg-gradient-to-br from-conve-red to-purple-700 p-8 rounded-2xl text-white text-center"
        whileHover={{ scale: 1.02 }}
      >
        <DollarSign className="w-12 h-12 mx-auto mb-4 text-conve-gold" />
        <h4 className="text-xl font-semibold mb-2">Total Annual Value</h4>
        <div className="text-5xl font-bold mb-4">
          {formatCurrency(results.totalValue)}
        </div>
        <div className="flex items-center justify-center gap-2 text-conve-gold">
          <Calendar className="w-5 h-5" />
          <span>Monthly: {formatCurrency(results.monthlyValue)}</span>
        </div>
      </motion.div>

      <div className="text-center pt-6">
        <Button 
          size="lg" 
          className="bg-conve-red hover:bg-conve-red-dark text-white px-8 py-4 h-auto text-lg font-semibold shadow-luxury-red"
          onClick={handleGenerateProposal}
          disabled={isGenerating || !inputs}
        >
          {isGenerating ? 'Generating Proposal...' : 'Generate Custom Proposal'}
        </Button>
        <p className="text-sm text-gray-500 mt-3">
          Get a detailed partnership proposal based on your calculations
        </p>
      </div>
    </motion.div>
  );
};

export default CalculatorResults;