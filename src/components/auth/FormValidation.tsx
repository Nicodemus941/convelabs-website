
import React from "react";

export interface ValidationResult {
  isValid: boolean;
  message?: string;
}

export const validateEmail = (email: string): ValidationResult => {
  if (!email) {
    return { isValid: false, message: "Email is required" };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, message: "Please enter a valid email address" };
  }
  
  return { isValid: true };
};

export const validatePassword = (password: string): ValidationResult => {
  if (!password) {
    return { isValid: false, message: "Password is required" };
  }
  
  if (password.length < 6) {
    return { isValid: false, message: "Password must be at least 6 characters" };
  }
  
  return { isValid: true };
};

export const validateName = (name: string, fieldName: string = "Name"): ValidationResult => {
  if (!name) {
    return { isValid: false, message: `${fieldName} is required` };
  }
  
  if (name.length < 2) {
    return { isValid: false, message: `${fieldName} must be at least 2 characters` };
  }
  
  return { isValid: true };
};

export const validatePhoneNumber = (phone: string): ValidationResult => {
  if (!phone) {
    return { isValid: true }; // Phone number is optional
  }
  
  // Basic validation for US phone numbers
  const phoneRegex = /^(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;
  if (!phoneRegex.test(phone)) {
    return { isValid: false, message: "Please enter a valid phone number" };
  }
  
  return { isValid: true };
};

export const PasswordStrengthMeter: React.FC<{ password: string }> = ({ password }) => {
  const calculateStrength = (): { score: number, text: string, color: string } => {
    if (!password) {
      return { score: 0, text: "Password required", color: "bg-gray-200" };
    }
    
    let score = 0;
    
    // Length check
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    
    // Complexity checks
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    
    // Score interpretation
    if (score <= 2) return { score, text: "Weak", color: "bg-red-500" };
    if (score <= 4) return { score, text: "Moderate", color: "bg-yellow-500" };
    return { score, text: "Strong", color: "bg-green-500" };
  };
  
  const strength = calculateStrength();
  
  return (
    <div className="space-y-2">
      <div className="flex gap-1 h-1.5">
        {[1, 2, 3].map((index) => (
          <div 
            key={index} 
            className={`h-full flex-1 rounded-sm ${
              index <= strength.score / 2 ? strength.color : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{strength.text}</p>
    </div>
  );
};

export const FormErrorMessage: React.FC<{ message?: string }> = ({ message }) => {
  if (!message) return null;
  
  return (
    <p className="text-sm text-destructive mt-1">{message}</p>
  );
};
