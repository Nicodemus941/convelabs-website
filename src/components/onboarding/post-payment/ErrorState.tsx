
import React from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const ErrorState: React.FC = () => {
  const navigate = useNavigate();
  
  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-4">Session Not Found</h2>
      <p className="mb-6">We couldn't verify your payment session. Please try again or contact support.</p>
      <Button onClick={() => navigate('/pricing')}>View Membership Plans</Button>
    </div>
  );
};

export default ErrorState;
