
import React from "react";

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

const FormSection: React.FC<FormSectionProps> = ({ title, description, children }) => {
  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold">{title}</h3>
      {description && <p className="text-gray-600 mb-4">{description}</p>}
      {children}
    </div>
  );
};

export default FormSection;
