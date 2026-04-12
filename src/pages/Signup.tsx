
import React, { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "@/components/auth/SignupForm";
import { useToast } from "@/components/ui/use-toast";
import { useLocation, useNavigate } from "react-router-dom";
import { SignupHeader } from "@/components/auth/SignupHeader";
import { AuthFooter } from "@/components/auth/AuthFooter";
import { Loader2 } from "lucide-react";

const Signup = () => {
  const { resetError, error: authError, user, isLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Redirect logged in users
  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Handle auth context errors
  useEffect(() => {
    if (authError) {
      // Show toast for auth errors
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: authError,
      });
      
      // Clear error after displaying toast
      setTimeout(() => resetError(), 100);
    }
  }, [authError, toast, resetError]);

  // Reset errors when component unmounts
  useEffect(() => {
    return () => {
      resetError();
    };
  }, [resetError]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-t-conve-red border-r-conve-red border-b-gray-200 border-l-gray-200 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-600">Checking authentication status...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <SignupHeader />

        <Card className="luxury-card">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Create your account</CardTitle>
            <CardDescription>
              Join ConveLabs to access personalized healthcare services
            </CardDescription>
          </CardHeader>

          <CardContent>
            <SignupForm />
            <AuthFooter type="signup" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Signup;
