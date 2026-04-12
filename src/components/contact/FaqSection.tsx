
import React from "react";
import { Link } from "react-router-dom";

const FaqSection: React.FC = () => {
  return (
    <div className="mt-16 bg-gray-50 rounded-lg p-8 text-center">
      <h2 className="text-2xl font-semibold mb-4">Frequently Asked Questions</h2>
      <p className="mb-6">
        Find quick answers to common questions about our services.
      </p>
      <Link 
        to="/faq" 
        className="bg-conve-red hover:bg-red-700 text-white px-6 py-3 rounded-md inline-block transition-colors"
      >
        Visit FAQ Page
      </Link>
    </div>
  );
};

export default FaqSection;
