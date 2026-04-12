
import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FunnelFormInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  className?: string;
}

const FunnelFormInput = ({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
  error,
  className
}: FunnelFormInputProps) => {
  return (
    <div className={cn("space-y-2", className)}>
      <Label 
        htmlFor={label.toLowerCase().replace(/\s+/g, '-')}
        className="text-sm font-semibold text-gray-700"
      >
        {label}
        {required && <span className="text-conve-red ml-1">*</span>}
      </Label>
      <Input
        id={label.toLowerCase().replace(/\s+/g, '-')}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "luxury-input h-12 text-base touch-manipulation",
          "min-h-[48px]", // Ensure minimum touch target size
          error && "border-red-300 focus:border-red-500"
        )}
        style={{ fontSize: '16px' }} // Prevent zoom on iOS
      />
      {error && (
        <p className="text-sm text-red-600 font-medium">{error}</p>
      )}
    </div>
  );
};

export default FunnelFormInput;
