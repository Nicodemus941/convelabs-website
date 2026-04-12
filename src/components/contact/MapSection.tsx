
import React from "react";

const MapSection: React.FC = () => {
  return (
    <div className="mt-12">
      <h2 className="text-2xl font-semibold mb-6 text-center">Our Service Areas</h2>
      <div className="aspect-[16/9] rounded-lg overflow-hidden">
        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
          {/* Replace with actual map component when available */}
          <div className="text-center px-4">
            <h3 className="text-xl font-medium mb-2">Central Florida Coverage</h3>
            <p className="text-gray-600 mb-4">
              We provide mobile phlebotomy services throughout the Greater Orlando and Tampa areas.
            </p>
            <p className="text-sm text-gray-500">
              Interactive map would be displayed here. We currently serve Orlando, Winter Park, Kissimmee, 
              Sanford, Lake Mary, Tampa, St. Petersburg, Clearwater and surrounding communities.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapSection;
