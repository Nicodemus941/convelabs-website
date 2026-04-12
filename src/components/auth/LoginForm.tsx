import React, { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Divider } from "@/components/auth/Divider";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, AlertCircle } from "lucide-react";
import { validateEmail, validatePassword, FormErrorMessage } from "@/components/auth/FormValidation";
import { supabase } from '@/integrations/supabase/client';

interface LoginFormProps {
  handleSuperAdminLogin: (email: string, password: string) => Promise<void>;
  redirectPath?: string;
}

export const LoginForm = ({ handleSuperAdminLogin, redirectPath = "/dashboard" }: LoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Get the return path from URL params if it exists
  const returnPath = searchParams.get("redirect") || redirectPath;

  // Clear errors when inputs change
  useEffect(() => {
    setEmailError(undefined);
  }, [email]);

  useEffect(() => {
    setPasswordError(undefined);
  }, [password]);

  const validateForm = (): boolean => {
    let isValid = true;
    
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      setEmailError(emailValidation.message);
      isValid = false;
    }
    
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      setPasswordError(passwordValidation.message);
      isValid = false;
    }
    
    return isValid;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);

    try {
      // Check for super admin login
      if (email.toLowerCase() === "admin@convelabs.com") {
        await handleSuperAdminLogin(email, password);
        toast.success("Logged in as admin");
        navigate(returnPath);
      } else {
        // Regular user login
        await login(email, password);
        toast.success("Logged in successfully");
        navigate(returnPath);
      }
    } catch (error) {
      console.error("Login error:", error);
      // Error is handled by AuthContext and displayed via toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setIsDemoLoading(true);
    try {
      // Try sign in first, since the user already exists
      const { error: signInError, data: signInData } = await supabase.auth.signInWithPassword({
        email: 'demo@gmail.com',
        password: 'Nick2024',
      });
      
      if (!signInError && signInData?.session) {
        toast.success('Signed in as demo patient');
        navigate('/appointments');
        return;
      }
      
      // If sign-in fails for some reason other than "user not found", show the error
      if (signInError && signInError.message !== "Invalid login credentials") {
        throw signInError;
      }
      
      // Otherwise, try to create the user
      const authResponse = await supabase.auth.signUp({
        email: 'demo@gmail.com',
        password: 'Nick2024',
        options: {
          data: {
            firstName: 'Demo',
            lastName: 'Patient',
            full_name: 'Demo Patient',
            role: 'patient'
          }
        }
      });
      
      if (authResponse.error) {
        // If user already exists, just try to sign in again
        if (authResponse.error.message.includes("User already registered")) {
          const { error: retrySignInError } = await supabase.auth.signInWithPassword({
            email: 'demo@gmail.com',
            password: 'Nick2024',
          });
          
          if (retrySignInError) throw retrySignInError;
          toast.success('Signed in as demo patient');
          navigate('/appointments');
          return;
        }
        throw authResponse.error;
      }
      
      const userId = authResponse.data?.user?.id;
      
      // Update user profile with additional info
      if (userId) {
        // Create a profile object with explicit typing and all required fields
        const profileData = {
          id: userId,
          full_name: 'Demo Patient',
          address_street: '123 Test Street',
          address_city: 'Orlando',
          address_state: 'FL',
          address_zipcode: '32801',
          date_of_birth: new Date('1990-01-01').toISOString(),
          phone: '555-123-4567'
        };
        
        const { error: profileError } = await supabase
          .from('user_profiles')
          .upsert(profileData);
          
        if (profileError) throw profileError;
      }
      
      toast.success('Demo patient account created and logged in successfully');
      navigate('/appointments');
    } catch (error: any) {
      console.error('Error with demo login:', error);
      toast.error(`Failed to log in as demo patient: ${error.message}`);
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={`luxury-input ${emailError ? 'border-destructive' : ''}`}
              disabled={isSubmitting}
              autoComplete="email"
            />
            {emailError && (
              <AlertCircle className="h-4 w-4 absolute right-3 top-3 text-destructive" />
            )}
          </div>
          <FormErrorMessage message={emailError} />
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-sm text-conve-red hover:underline">
              Forgot Password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={`luxury-input ${passwordError ? 'border-destructive' : ''}`}
              disabled={isSubmitting}
              autoComplete="current-password"
            />
            <button 
              type="button" 
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            {passwordError && (
              <AlertCircle className="h-4 w-4 absolute right-9 top-3 text-destructive" />
            )}
          </div>
          <FormErrorMessage message={passwordError} />
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full luxury-button"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing In...
            </>
          ) : (
            "Sign In"
          )}
        </Button>
      </form>

      {/* Demo Account Login Button */}
      <Button
        type="button"
        variant="outline" 
        onClick={handleDemoLogin}
        disabled={isDemoLoading}
        className="w-full border-conve-red text-conve-red hover:bg-conve-red/10"
      >
        {isDemoLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Accessing Demo Account...
          </>
        ) : (
          "Use Demo Account"
        )}
      </Button>

      <Divider text="OR" />
      
      <GoogleButton redirectUrl={returnPath} />
    </div>
  );
};
