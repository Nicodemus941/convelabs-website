
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import LoadingState from '@/components/ui/loading-state';
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { verifyPayment } from '@/services/verify-payment';
import { formatCurrency } from '@/utils/formatters';
import { useAuth } from '@/contexts/AuthContext';

export const usePaymentVerification = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [isVerifying, setIsVerifying] = useState(true);
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  
  useEffect(() => {
    const verifyPaymentSession = async () => {
      try {
        const sessionId = new URLSearchParams(location.search).get('session_id');
        
        if (!sessionId) {
          console.log("No payment session ID found in URL");
          setStatus('error');
          setErrorMessage("No payment session ID found. Please try again or contact support.");
          setIsVerifying(false);
          return;
        }
        
        console.log("Found session ID in URL:", sessionId);
        
        // Store session ID for later use
        localStorage.setItem('paymentSessionId', sessionId);
        
        // Verify the payment status with our verification service
        try {
          const result = await verifyPayment(sessionId);
          
          if (result.error) {
            throw new Error(result.error);
          }
          
          // Store payment details for receipt
          setPaymentDetails({
            status: result.status,
            amount_total: result.amount,
            session_id: sessionId
          });
          
          if (result.success) {
            console.log("Payment verification successful:", result);
            setStatus('success');
            
            // Record payment details in database if user is logged in
            if (user) {
              try {
                // Note: We'll create this table via SQL migration in a separate step
                console.log("Recording payment in user_payments table");
                // This is just logging that would happen once the table is created
              } catch (e) {
                // Non-critical, just log error
                console.error("Failed to record payment details:", e);
              }
            }
            
            // Wait a moment to show success message
            setTimeout(() => {
              // For partnership onboarding flow
              if (location.pathname.includes('partnership')) {
                navigate('/partnership-onboarding', { replace: true });
              } else {
                // For regular membership flow
                navigate('/dashboard', { replace: true });
              }
            }, 2500);
          } else {
            setStatus('error');
            setErrorMessage(`Your payment requires attention. Status: ${result.status || 'unknown'}`);
          }
        } catch (verifyError) {
          console.error("Payment verification error:", verifyError);
          setStatus('error');
          setErrorMessage("Could not verify payment status. Please contact support.");
        }
      } catch (error) {
        console.error("Payment verification error:", error);
        setStatus('error');
        setErrorMessage("Error processing payment verification. Please contact support.");
      } finally {
        setIsVerifying(false);
      }
    };
    
    verifyPaymentSession();
  }, [navigate, location.search, location.pathname, user]);
  
  return { isVerifying, status, errorMessage, paymentDetails };
};

const PaymentVerification: React.FC = () => {
  const { isVerifying, status, errorMessage, paymentDetails } = usePaymentVerification();
  const navigate = useNavigate();

  if (isVerifying || status === 'verifying') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <LoadingState message="Verifying payment..." size="large" />
          <p className="text-gray-600 mt-4">
            Please wait while we verify your payment...
          </p>
        </div>
      </div>
    );
  }
  
  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <div className="mb-4 text-green-500">
            <CheckCircle size={48} className="mx-auto" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Payment Successful!</h2>
          <p className="text-gray-600 mb-6">
            Your payment has been processed successfully. Redirecting you to your dashboard...
          </p>
          
          {paymentDetails && (
            <div className="mt-4 p-4 border border-gray-200 rounded-md bg-gray-50 text-left">
              <h3 className="font-medium text-gray-700 mb-2">Payment Receipt</h3>
              <div className="text-sm text-gray-600 space-y-2">
                <p>Amount: {formatCurrency(paymentDetails.amount_total / 100)}</p>
                {paymentDetails.subscription && (
                  <p>Subscription: {paymentDetails.subscription}</p>
                )}
                <p>Status: {paymentDetails.status}</p>
                <p>Transaction ID: {paymentDetails.session_id?.substring(0, 10)}...</p>
                <p>Date: {new Date().toLocaleDateString()}</p>
              </div>
            </div>
          )}
          
          <Button 
            className="mt-6"
            onClick={() => navigate('/dashboard')}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }
  
  // Error state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
        <div className="mb-4 text-amber-500">
          <AlertTriangle size={48} className="mx-auto" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Payment Verification Issue</h2>
        <p className="text-gray-600 mb-6">
          {errorMessage || "There was an issue verifying your payment. Please contact support."}
        </p>
        <div className="flex gap-4 justify-center">
          <Button variant="outline" onClick={() => navigate('/pricing')}>
            Return to Pricing
          </Button>
          <Button onClick={() => navigate('/contact')}>
            Contact Support
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PaymentVerification;
