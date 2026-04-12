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

export const SignupForm = () => {
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);

    try {
      const result = await signup(email, password, firstName, lastName, role);
      
      if (result.success) {
        toast.success("Account created successfully! Redirecting to dashboard...");
        // Navigate is handled by the signup function in the Auth context
      } else {
        throw new Error(result.error?.message || "Failed to create account");
      }
    } catch (error: any) {
      console.error("Signup error:", error);
      toast.error(error.message || "Failed to create account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
