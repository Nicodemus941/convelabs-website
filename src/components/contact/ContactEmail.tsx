
import React from "react";
import { Mail } from "lucide-react";

const ContactEmail: React.FC = () => {
  return (
    <div className="flex items-start">
      <Mail className="w-5 h-5 mr-3 text-conve-red shrink-0 mt-1" />
      <div>
        <h3 className="font-medium">Email</h3>
        <p className="text-gray-600">orders@convelabs.com</p>
        <p className="text-xs text-gray-500 mt-1">We'll respond within 24 hours</p>
      </div>
    </div>
  );
};

export default ContactEmail;
