import React, { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, AlertCircle, Mail, Sparkles } from "lucide-react";
import { validateEmail, validatePassword, FormErrorMessage } from "@/components/auth/FormValidation";
import { supabase } from "@/integrations/supabase/client";

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
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [isMigratedUser, setIsMigratedUser] = useState(false);
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
    } catch (error: any) {
      console.error("Login error:", error);
      if (error?.message?.includes('Invalid login credentials')) {
        // Check if this is a migrated patient who needs to reset password
        // Look up in tenant_patients to see if they exist
        const { data: existingPatient } = await supabase
          .from('tenant_patients')
          .select('id, first_name')
          .ilike('email', email.trim())
          .maybeSingle();

        if (existingPatient) {
          // Migrated user found — show welcome screen
          setIsMigratedUser(true);
          toast("We found your account!", {
            description: "Welcome to the new ConveLabs system. Please reset your password to continue.",
          });
        } else {
          toast.error("Invalid email or password. Please try again.");
        }
      } else {
        toast.error(error?.message || "Login failed. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendMagicLink = async () => {
    setIsSubmitting(true);
    try {
      // Use custom edge function (Mailgun) instead of Supabase built-in email
      const { error } = await supabase.functions.invoke('send-password-reset', {
        body: { email: email.trim() },
      });
      if (error) throw error;
      setMagicLinkSent(true);
    } catch (err: any) {
      // Still show success for security
      setMagicLinkSent(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Magic link sent confirmation
  if (magicLinkSent) {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="h-14 w-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
          <Mail className="h-7 w-7 text-blue-600" />
        </div>
        <h3 className="text-lg font-bold">Check Your Email</h3>
        <p className="text-sm text-muted-foreground">
          We sent a link to <span className="font-semibold text-foreground">{email}</span>.
          Click the link to set your new password.
        </p>
        <p className="text-xs text-muted-foreground">The link expires in 10 minutes.</p>
      </div>
    );
  }

  // Migrated user welcome screen
  if (isMigratedUser) {
    return (
      <div className="space-y-5 py-2">
        <div className="text-center space-y-3">
          <div className="h-14 w-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
            <Sparkles className="h-7 w-7 text-amber-600" />
          </div>
          <h3 className="text-lg font-bold">Welcome to the New ConveLabs!</h3>
          <p className="text-sm text-muted-foreground">
            We've upgraded our booking system. To secure your account, we need to verify your email and set a new password.
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-sm font-medium text-blue-900 mb-1">Your email: {email}</p>
          <p className="text-xs text-blue-700">We'll send a link to set your new password.</p>
        </div>
        <Button
          onClick={handleSendMagicLink}
          disabled={isSubmitting}
          className="w-full bg-conve-red hover:bg-conve-red-dark text-white"
        >
          {isSubmitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
          ) : (
            <><Mail className="mr-2 h-4 w-4" /> Send Verification Link</>
          )}
        </Button>
        <button
          onClick={() => { setIsMigratedUser(false); setPassword(''); }}
          className="w-full text-sm text-muted-foreground hover:text-foreground"
        >
          Try a different email
        </button>
      </div>
    );
  }

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

    </div>
  );
};
