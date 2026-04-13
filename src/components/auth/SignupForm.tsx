import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, AlertCircle, Check } from "lucide-react";
import { 
  validateEmail, 
  validatePassword, 
  validateName, 
  FormErrorMessage, 
  PasswordStrengthMeter 
} from "@/components/auth/FormValidation";
import { UserRole } from "@/types/auth";
import { supabase } from "@/integrations/supabase/client";

interface SignupFormProps {
  onSignupComplete?: (email: string) => void;
}

export const SignupForm = ({ onSignupComplete }: SignupFormProps = {}) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>("patient");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const { signup } = useAuth();
  const navigate = useNavigate();

  // Clear errors when inputs change
  useEffect(() => {
    setErrors(prev => ({ ...prev, firstName: undefined }));
  }, [firstName]);

  useEffect(() => {
    setErrors(prev => ({ ...prev, lastName: undefined }));
  }, [lastName]);

  useEffect(() => {
    setErrors(prev => ({ ...prev, email: undefined }));
  }, [email]);

  useEffect(() => {
    setErrors(prev => ({ ...prev, password: undefined }));
  }, [password]);

  useEffect(() => {
    setErrors(prev => ({ ...prev, confirmPassword: undefined }));
  }, [confirmPassword]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    let isValid = true;
    
    const firstNameValidation = validateName(firstName, "First name");
    if (!firstNameValidation.isValid) {
      newErrors.firstName = firstNameValidation.message;
      isValid = false;
    }
    
    const lastNameValidation = validateName(lastName, "Last name");
    if (!lastNameValidation.isValid) {
      newErrors.lastName = lastNameValidation.message;
      isValid = false;
    }
    
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      newErrors.email = emailValidation.message;
      isValid = false;
    }
    
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      newErrors.password = passwordValidation.message;
      isValid = false;
    }
    
    if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
      isValid = false;
    }
    
    setErrors(newErrors);
    return isValid;
  };

  const [showMigratedMessage, setShowMigratedMessage] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Check if email already exists in tenant_patients (migrated patient)
      const { data: existingPatient } = await supabase
        .from('tenant_patients')
        .select('id, first_name')
        .ilike('email', email.trim())
        .maybeSingle();

      const result = await signup(email, password, firstName, lastName, role);

      if (result.success) {
        if (onSignupComplete) {
          onSignupComplete(email);
        } else {
          toast.success("Account created successfully!");
        }
      } else {
        const errorMsg = result.error?.message || "";
        // Check if account already exists
        if (errorMsg.includes('already registered') || errorMsg.includes('already been registered') || errorMsg.includes('User already registered')) {
          if (existingPatient) {
            // Migrated patient — send password reset
            await supabase.auth.resetPasswordForEmail(email.trim(), {
              redirectTo: `${window.location.origin}/reset-password`,
            });
            setShowMigratedMessage(true);
            toast("We found your account!", {
              description: `Welcome back, ${existingPatient.first_name || 'patient'}! Check your email to set your password.`,
            });
          } else {
            toast.error("An account with this email already exists. Please log in instead.");
          }
          return;
        }
        throw new Error(errorMsg || "Failed to create account");
      }
    } catch (error: any) {
      console.error("Signup error:", error);
      const msg = error.message || "";
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        // Check tenant_patients
        const { data: tp } = await supabase.from('tenant_patients').select('first_name').ilike('email', email.trim()).maybeSingle();
        if (tp) {
          await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${window.location.origin}/reset-password`,
          });
          setShowMigratedMessage(true);
          toast("We found your account!", {
            description: `Welcome back! Check your email to set your password.`,
          });
        } else {
          toast.error("This email is already registered. Please log in instead.");
        }
      } else {
        toast.error(msg || "Failed to create account. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showMigratedMessage) {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="h-14 w-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <Check className="h-7 w-7 text-emerald-600" />
        </div>
        <h3 className="text-lg font-bold">We Found Your Account!</h3>
        <p className="text-sm text-muted-foreground">
          Welcome to the new ConveLabs booking system! We've sent a password reset link to <span className="font-semibold text-foreground">{email}</span>.
        </p>
        <p className="text-sm text-muted-foreground">
          Check your email and click the link to set your password. Once done, you can log in and manage your appointments.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
          The link expires in 10 minutes. Check your spam folder if you don't see it.
        </div>
        <Button variant="outline" onClick={() => window.location.href = '/login'} className="w-full">
          Go to Login
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <div className="relative">
              <Input
                id="firstName"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className={errors.firstName ? 'border-destructive' : ''}
                disabled={isSubmitting}
                autoComplete="given-name"
              />
              {errors.firstName && (
                <AlertCircle className="h-4 w-4 absolute right-3 top-3 text-destructive" />
              )}
            </div>
            <FormErrorMessage message={errors.firstName} />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <div className="relative">
              <Input
                id="lastName"
                placeholder="Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className={errors.lastName ? 'border-destructive' : ''}
                disabled={isSubmitting}
                autoComplete="family-name"
              />
              {errors.lastName && (
                <AlertCircle className="h-4 w-4 absolute right-3 top-3 text-destructive" />
              )}
            </div>
            <FormErrorMessage message={errors.lastName} />
          </div>
        </div>
        
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
              className={errors.email ? 'border-destructive' : ''}
              disabled={isSubmitting}
              autoComplete="email"
            />
            {errors.email && (
              <AlertCircle className="h-4 w-4 absolute right-3 top-3 text-destructive" />
            )}
          </div>
          <FormErrorMessage message={errors.email} />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="role">I am a</Label>
          <Select
            value={role}
            onValueChange={(value) => setRole(value as UserRole)}
            disabled={isSubmitting}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select your role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="patient">Patient</SelectItem>
              <SelectItem value="concierge_doctor">Concierge Doctor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={errors.password ? 'border-destructive' : ''}
              disabled={isSubmitting}
              autoComplete="new-password"
            />
            <button 
              type="button" 
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <FormErrorMessage message={errors.password} />
          {password && <PasswordStrengthMeter password={password} />}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className={errors.confirmPassword ? 'border-destructive' : ''}
              disabled={isSubmitting}
              autoComplete="new-password"
            />
            <button 
              type="button" 
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            {password && confirmPassword && password === confirmPassword && (
              <Check className="h-4 w-4 absolute right-9 top-3 text-green-500" />
            )}
          </div>
          <FormErrorMessage message={errors.confirmPassword} />
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full luxury-button mt-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Account...
            </>
          ) : (
            "Create Account"
          )}
        </Button>
      </form>

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-conve-red hover:underline">
            Sign in
          </Link>
        </p>
      </div>
      
      <div className="text-xs text-center text-muted-foreground">
        By creating an account, you agree to our{" "}
        <Link to="/terms" className="underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link to="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </div>
    </div>
  );
};
