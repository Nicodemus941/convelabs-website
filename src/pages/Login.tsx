
import React, { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";
import { useSuperAdminLogin } from "@/utils/auth/superAdminLogin";
import { useToast } from "@/components/ui/use-toast";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { LoginHeader } from "@/components/auth/LoginHeader";
import { AuthFooter } from "@/components/auth/AuthFooter";
import { Loader2 } from "lucide-react";

const Login = () => {
  const { resetError, error: authError, user, isLoading } = useAuth();
  const { toast } = useToast();
  const { handleSuperAdminLogin } = useSuperAdminLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // Extract redirect path from query params if exists
  const redirectPath = searchParams.get('redirect') || '/dashboard';
  
  // Redirect logged in users
  useEffect(() => {
    if (user) {
      // Prevent redirect loops - don't redirect back to login or auth pages
      const targetPath = redirectPath.includes('/login') || redirectPath.includes('/auth') 
        ? '/dashboard' 
        : redirectPath;
      
      console.log('User already logged in, redirecting to:', targetPath);
      navigate(targetPath, { replace: true });
    }
  }, [user, navigate, redirectPath]);

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
        <LoginHeader />

        <Card className="luxury-card">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Welcome Back</CardTitle>
            <CardDescription>
              Sign in to access your account
            </CardDescription>
          </CardHeader>

          <CardContent>
            <LoginForm handleSuperAdminLogin={handleSuperAdminLogin} redirectPath={redirectPath} />
            <AuthFooter type="login" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
