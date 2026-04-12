import React from 'react';
import { industryContent } from '@/data/b2bContent';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IndustryType, ROICalculatorInputs } from '@/types/b2bTypes';

interface CalculatorInputsProps {
  selectedIndustry: IndustryType;
  inputs: ROICalculatorInputs;
  onInputChange: (inputs: Partial<ROICalculatorInputs>) => void;
}

const CalculatorInputs: React.FC<CalculatorInputsProps> = ({ selectedIndustry, inputs, onInputChange }) => {
  const content = industryContent[selectedIndustry];

  const handleInputChange = (field: keyof ROICalculatorInputs, value: string) => {
    const numericValue = parseInt(value) || 0;
    onInputChange({ [field]: numericValue });
  };

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="volume" className="text-gray-700 font-semibold mb-2 block">
          {content.calculatorFields.volumeLabel}
        </Label>
        <Input
          id="volume"
          type="number"
          placeholder={content.calculatorFields.volumePlaceholder}
          value={inputs.volume || ''}
          onChange={(e) => handleInputChange('volume', e.target.value)}
          className="luxury-input text-lg h-12"
        />
      </div>

      <div>
        <Label htmlFor="avgValue" className="text-gray-700 font-semibold mb-2 block">
          {content.calculatorFields.valueLabel}
        </Label>
        <Input
          id="avgValue"
          type="number"
          placeholder={content.calculatorFields.valuePlaceholder}
          value={inputs.avgValue || ''}
          onChange={(e) => handleInputChange('avgValue', e.target.value)}
          className="luxury-input text-lg h-12"
        />
      </div>

      {content.calculatorFields.spendLabel && (
        <div>
          <Label htmlFor="currentSpend" className="text-gray-700 font-semibold mb-2 block">
            {content.calculatorFields.spendLabel}
          </Label>
          <Input
            id="currentSpend"
            type="number"
            placeholder={content.calculatorFields.spendPlaceholder}
            value={inputs.currentSpend || ''}
            onChange={(e) => handleInputChange('currentSpend', e.target.value)}
            className="luxury-input text-lg h-12"
          />
        </div>
      )}
    </div>
  );
};

export default CalculatorInputs;