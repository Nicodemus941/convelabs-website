
import React from 'react';
import { Check } from 'lucide-react';

const PaymentSuccess: React.FC = () => {
  return (
    <div className="bg-green-50 border border-green-100 rounded-lg p-4 mb-6">
      <div className="flex items-start">
        <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
        <div>
          <h3 className="text-green-700 font-medium mb-1">All Set!</h3>
          <p className="text-sm text-green-600">
            You have successfully accepted all agreements. Click below to proceed to payment and complete your registration.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
