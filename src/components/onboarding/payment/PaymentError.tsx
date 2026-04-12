
import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface PaymentErrorProps {
  errorMessage: string | null;
}

const PaymentError: React.FC<PaymentErrorProps> = ({ errorMessage }) => {
  return (
    <div className="bg-red-50 border border-red-100 rounded-lg p-4 mb-6">
      <div className="flex items-start">
        <AlertTriangle className="h-5 w-5 text-red-500 mr-2 flex-shrink-0" />
        <div>
          <h3 className="text-red-700 font-medium mb-1">Payment Error</h3>
          <p className="text-sm text-red-600">{errorMessage}</p>
          <p className="text-sm text-red-500 mt-2">
            Please try again or contact support if the issue persists.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PaymentError;
