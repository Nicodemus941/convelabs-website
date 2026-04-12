
import React from "react";

interface MaintenanceFeatureProps {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const MaintenanceFeature: React.FC<MaintenanceFeatureProps> = ({ title, description, icon }) => {
  return (
    <div className="flex gap-4">
      <div className="bg-conve-red/10 p-3 rounded-full h-12 w-12 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-lg mb-1">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </div>
    </div>
  );
};

export default MaintenanceFeature;
