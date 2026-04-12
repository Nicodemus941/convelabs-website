
import React from "react";
import { MapPin } from "lucide-react";

const ContactAddress: React.FC = () => {
  return (
    <div className="flex items-start">
      <MapPin className="w-5 h-5 mr-3 text-conve-red shrink-0 mt-1" />
      <div>
        <h3 className="font-medium">Office Location</h3>
        <p className="text-gray-600">
          1800 Pembrook Drive<br />
          Suite 300<br />
          Orlando, FL 32810
        </p>
      </div>
    </div>
  );
};

export default ContactAddress;
