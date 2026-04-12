
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isVerifying, setIsVerifying] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState({
    verified: false,
    message: '',
  });
  
  const queryParams = new URLSearchParams(location.search);
  const sessionId = queryParams.get('session_id');
  const isUpgrade = queryParams.get('upgrade') === 'true';
  
  useEffect(() => {
    const verifyCheckout = async () => {
      if (!sessionId) return;
      
      setIsVerifying(true);
      
      try {
        const { data, error } = await supabase.functions.invoke('verify-checkout-session', {
          body: { sessionId, isGuestCheckout: false },
        });
        
        if (error) {
          console.error('Error verifying checkout:', error);
          toast.error('Could not verify your payment. Please contact support.');
          setPaymentStatus({
            verified: false,
            message: 'Payment verification failed. Please contact support.',
          });
          return;
        }
        
        if (data.success) {
          setPaymentStatus({
            verified: true,
            message: isUpgrade ? 'Your membership has been successfully upgraded!' : 'Your membership is now active!',
          });
          
          // Refresh the auth context
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) console.error('Error refreshing auth session:', refreshError);
        } else {
          setPaymentStatus({
            verified: false,
            message: data.error || 'Payment could not be verified. Please contact support.',
          });
        }
      } catch (err) {
        console.error('Verification failed:', err);
        setPaymentStatus({
          verified: false,
          message: 'An unexpected error occurred. Please contact support.',
        });
      } finally {
        setIsVerifying(false);
      }
    };
    
    verifyCheckout();
  }, [sessionId, isUpgrade]);
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-lg text-center">
        <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
        
        <h1 className="text-2xl font-bold mb-2">Thank You!</h1>
        
        <p className="text-gray-700 mb-6">
          {isVerifying
            ? 'Verifying your payment...'
            : paymentStatus.verified
            ? paymentStatus.message
            : paymentStatus.message || 'Your payment has been received and is being processed.'}
        </p>
        
        <div className="space-y-4">
          <Button 
            onClick={() => navigate('/dashboard')} 
            className="w-full"
          >
            Go to Dashboard
          </Button>
          
          {isUpgrade && (
            <p className="text-sm text-gray-500">
              Your membership has been upgraded. It may take a few moments for all changes to reflect in your account.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
