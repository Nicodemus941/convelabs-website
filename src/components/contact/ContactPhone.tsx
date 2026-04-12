
import React from "react";
import { Phone } from "lucide-react";

const ContactPhone: React.FC = () => {
  return (
    <div className="flex items-start">
      <Phone className="w-5 h-5 mr-3 text-conve-red shrink-0 mt-1" />
      <div>
        <h3 className="font-medium">Phone</h3>
        <p className="text-gray-600">(941) 527-9169</p>
        <p className="text-xs text-gray-500 mt-1">Monday-Friday: 6am-2pm</p>
      </div>
    </div>
  );
};

export default ContactPhone;
