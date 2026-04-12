
import React from "react";
import { Clock } from "lucide-react";

const ContactHours: React.FC = () => {
  return (
    <div className="flex items-start">
      <Clock className="w-5 h-5 mr-3 text-conve-red shrink-0 mt-1" />
      <div>
        <h3 className="font-medium">Hours of Operation</h3>
        <div className="text-gray-600 space-y-2 mt-1">
          <div>
            <p className="font-medium text-gray-700 text-sm">Non-Members:</p>
            <p className="text-sm">Monday-Friday: 8:30 AM - 1:30 PM</p>
            <p className="text-xs text-gray-500">Restoration Place service: 7:30 AM start available</p>
          </div>
          <div>
            <p className="font-medium text-gray-700 text-sm">Members:</p>
            <p className="text-sm">Monday-Sunday: 6:00 AM - 1:30 PM</p>
            <p className="text-xs text-gray-500">Excluding holidays</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactHours;
