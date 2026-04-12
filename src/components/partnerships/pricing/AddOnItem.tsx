
import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';

interface AddOnItemProps {
  addon: {
    id: string;
    name: string;
    price: number;
    description: string;
  };
  isSelected: boolean;
  onToggle: () => void;
}

const AddOnItem: React.FC<AddOnItemProps> = ({ addon, isSelected, onToggle }) => {
  return (
    <div 
      className={`border p-4 rounded-lg cursor-pointer transition-all ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={`addon-${addon.id}`}
          checked={isSelected}
          onCheckedChange={onToggle}
          className="mt-1"
        />
        <div className="flex-1">
          <div className="flex justify-between">
            <label 
              htmlFor={`addon-${addon.id}`} 
              className="text-base font-medium cursor-pointer"
            >
              {addon.name}
            </label>
            <span className="font-semibold">${(addon.price / 100).toFixed(0)}</span>
          </div>
          <p className="text-gray-600 text-sm mt-1">{addon.description}</p>
        </div>
      </div>
    </div>
  );
};

export default AddOnItem;
