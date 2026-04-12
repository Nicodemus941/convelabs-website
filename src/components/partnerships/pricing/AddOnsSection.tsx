
import React from "react";
import AddOnItem from "./AddOnItem";
import { AddOn } from "@/hooks/usePricingSelection";

interface AddOnsSectionProps {
  addOns: AddOn[];
  selectedAddOns: string[];
  onToggleAddOn: (addOnId: string) => void;
}

const AddOnsSection: React.FC<AddOnsSectionProps> = ({ addOns, selectedAddOns, onToggleAddOn }) => {
  return (
    <div className="mb-8">
      <h3 className="text-2xl font-semibold text-gray-800 mb-4">
        Add-Ons
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {addOns.map((addon) => (
          <AddOnItem
            key={addon.id}
            addon={addon}
            isSelected={selectedAddOns.includes(addon.id)}
            onToggle={() => onToggleAddOn(addon.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default AddOnsSection;
