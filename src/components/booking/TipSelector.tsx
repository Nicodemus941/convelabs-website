import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TipSelectorProps {
  value: number;
  onChange: (amount: number) => void;
}

const PRESETS = [0, 5, 10, 15, 20];

const TipSelector: React.FC<TipSelectorProps> = ({ value, onChange }) => {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const handlePreset = (amount: number) => {
    setShowCustom(false);
    setCustomValue('');
    onChange(amount);
  };

  const handleCustomClick = () => {
    setShowCustom(true);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    setCustomValue(raw);
    const parsed = parseFloat(raw);
    onChange(isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100);
  };

  const isPresetSelected = (amount: number) =>
    !showCustom && value === amount;

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground">
        Add a tip for your phlebotomist
      </label>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((amount) => (
          <Button
            key={amount}
            type="button"
            variant={isPresetSelected(amount) ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePreset(amount)}
            className="min-w-[60px]"
          >
            {amount === 0 ? 'No Tip' : `$${amount}`}
          </Button>
        ))}
        <Button
          type="button"
          variant={showCustom ? 'default' : 'outline'}
          size="sm"
          onClick={handleCustomClick}
        >
          Custom
        </Button>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 max-w-[200px]">
          <span className="text-sm font-medium">$</span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={customValue}
            onChange={handleCustomChange}
            autoFocus
            className="h-9"
          />
        </div>
      )}

      {value > 0 && (
        <p className="text-sm text-muted-foreground">
          Tip: <span className="font-semibold text-foreground">${value.toFixed(2)}</span>
        </p>
      )}
    </div>
  );
};

export default TipSelector;
