
import React, { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import FileUpload from "@/components/onboarding/FileUpload";
import { Check, Loader2 } from "lucide-react";

const ConciergeDoctorOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  
  const [isVerifying, setIsVerifying] = useState(true);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<any>(null);

  useEffect(() => {
    const verifyPayment = async () => {
      if (!sessionId) {
        toast.error("No payment session ID found");
        navigate("/pricing");
        return;
      }

      try {
        // Verify the payment session
        const { data, error } = await supabase.functions.invoke("verify-concierge-payment", {
          body: { sessionId }
        });

        if (error) throw new Error(error.message);
        
        if (data?.success) {
          setVerificationSuccess(true);
          setPaymentInfo(data.paymentInfo);
          toast.success("Payment verified successfully!");
        } else {
          throw new Error(data?.message || "Failed to verify payment");
        }
      } catch (error: any) {
        console.error("Payment verification error:", error);
        toast.error(error.message || "Error verifying payment");
        navigate("/pricing");
      } finally {
        setIsVerifying(false);
      }
    };

    if (sessionId) {
      verifyPayment();
    } else {
      setIsVerifying(false);
    }
  }, [sessionId, navigate]);

  if (isVerifying) {
    return (
      <>
        <Header />
        <Container className="py-16">
          <div className="flex flex-col items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Verifying your payment...</h2>
            <p className="text-gray-600">Please wait while we verify your payment and set up your account.</p>
          </div>
        </Container>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Welcome to ConveLabs | Doctor Onboarding</title>
        <meta name="description" content="Complete your onboarding as a concierge doctor partner." />
      </Helmet>

      <Header />

      <Container className="py-12">
        <div className="max-w-3xl mx-auto">
          {verificationSuccess ? (
            <>
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center bg-green-100 rounded-full p-4 mb-4">
                  <Check className="h-12 w-12 text-green-600" />
                </div>
                <h1 className="text-3xl font-bold">Welcome to ConveLabs!</h1>
                <p className="text-gray-600 mt-2">
                  Your enrollment as a concierge doctor has been completed successfully. Now let's get you set up to provide exceptional lab services to your patients.
                </p>
              </div>

              <div className="space-y-8">
                {/* Account Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle>Account Summary</CardTitle>
                    <CardDescription>Here's an overview of your concierge doctor plan</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h3 className="font-medium text-gray-500">Practice Name</h3>
                          <p className="text-lg">{paymentInfo?.practice_name || "Your Practice"}</p>
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-500">Monthly Payment</h3>
                          <p className="text-lg">${paymentInfo?.amount_total ? (paymentInfo.amount_total / 100).toFixed(2) : "0.00"}</p>
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-500">Enrolled Patients</h3>
                          <p className="text-lg">{paymentInfo?.num_patients || "0"} patients</p>
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-500">Lab Services Per Patient</h3>
                          <p className="text-lg">12 per year</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Next Steps */}
                <Card>
                  <CardHeader>
                    <CardTitle>Next Steps</CardTitle>
                    <CardDescription>Complete these steps to start using our services</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50">
                        <div className="bg-green-100 rounded-full p-1">
                          <Check className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <h3 className="font-medium">Account Created</h3>
                          <p className="text-sm text-gray-600">Your account has been set up successfully</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50">
                        <div className="bg-green-100 rounded-full p-1">
                          <Check className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <h3 className="font-medium">Membership Activated</h3>
                          <p className="text-sm text-gray-600">Your concierge doctor membership is now active</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50">
                        <div className="bg-blue-100 rounded-full p-1 flex items-center justify-center w-6 h-6">
                          <span className="font-medium text-blue-600">3</span>
                        </div>
                        <div>
                          <h3 className="font-medium">Upload Patient Lab Orders</h3>
                          <p className="text-sm text-gray-600 mb-4">Upload your first patient lab orders to schedule services</p>
                          
                          <FileUpload />
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                        <div className="bg-gray-200 rounded-full p-1 flex items-center justify-center w-6 h-6">
                          <span className="font-medium text-gray-600">4</span>
                        </div>
                        <div>
                          <h3 className="font-medium">Schedule Your First Lab Service</h3>
                          <p className="text-sm text-gray-600">Once your lab orders are uploaded, you can schedule your first appointment</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button size="lg" className="flex-1" asChild>
                    <Link to="/dashboard">Go to Dashboard</Link>
                  </Button>
                  <Button size="lg" className="flex-1" variant="outline" asChild>
                    <Link to="/appointments">Schedule Services</Link>
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center">
              <h1 className="text-3xl font-bold">Payment Processing Error</h1>
              <p className="text-gray-600 mt-2 mb-6">
                We encountered an issue verifying your payment. Please contact our support team for assistance.
              </p>
              <Button asChild>
                <Link to="/contact">Contact Support</Link>
              </Button>
            </div>
          )}
        </div>
      </Container>

      <Footer />
    </>
  );
};

export default ConciergeDoctorOnboarding;
