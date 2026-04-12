
import React from "react";
import { MapPin } from "lucide-react";

interface ServiceAreasProps {
  locationName: string;
  areas: string[];
}

export const ServiceAreas: React.FC<ServiceAreasProps> = ({ locationName, areas }) => {
  return (
    <div className="bg-gray-50 rounded-xl p-8 mb-10">
      <h2 className="text-2xl font-bold mb-6">{locationName} Service Areas</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {areas.map((area, index) => (
          <div key={index} className="flex items-center">
            <MapPin className="h-5 w-5 text-primary mr-2" />
            <span>{area}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
