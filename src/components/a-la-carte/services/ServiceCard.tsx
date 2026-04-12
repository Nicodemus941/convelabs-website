
import React from "react";
import { RadioGroupItem } from "@/components/ui/radio-group";

interface ServiceCardProps {
  id: string;
  name: string;
  price: number;
  description: string;
  isSelected: boolean;
}

const ServiceCard: React.FC<ServiceCardProps> = ({
  id,
  name,
  price,
  description,
  isSelected,
}) => {
  return (
    <div className="flex items-center space-x-2 border rounded-md p-4">
      <RadioGroupItem value={id} id={id} />
      <div className="grid gap-1.5 flex-1">
        <div className="flex justify-between">
          <label 
            htmlFor={id} 
            className="text-base font-semibold cursor-pointer"
          >
            {name}
          </label>
          <span className="text-sm font-medium">
            ${price}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
};

export default ServiceCard;
