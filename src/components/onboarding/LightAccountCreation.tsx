
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '@/contexts/onboarding';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';

const LightAccountCreation: React.FC = () => {
  const navigate = useNavigate();
  const { 
    fullName, setFullName,
    email, setEmail,
    mobileNumber, setMobileNumber,
    password, setPassword,
    isSubmitting, submitLightAccount
  } = useOnboarding();
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    
    if (!fullName || !email || !mobileNumber || !password) {
      setFormError('Please fill in all required fields');
      return;
    }

    const success = await submitLightAccount();
    if (success) {
      navigate('/onboarding/plan-selection');
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <h2 className="text-2xl font-semibold text-center mb-6">Create Your Account</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="fullName">Full Name</Label>
          <Input 
            id="fullName"
            type="text" 
            placeholder="Enter your full name" 
            value={fullName} 
            onChange={(e) => setFullName(e.target.value)} 
            required 
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input 
            id="email"
            type="email" 
            placeholder="Enter your email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="mobileNumber">Mobile Number</Label>
          <Input 
            id="mobileNumber"
            type="tel" 
            placeholder="Enter your mobile number" 
            value={mobileNumber} 
            onChange={(e) => setMobileNumber(e.target.value)} 
            required 
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <Input 
            id="password"
            type="password" 
            placeholder="Create a password (min. 6 characters)" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            className="mt-1"
          />
        </div>

        {formError && (
          <div className="text-red-500 text-sm">{formError}</div>
        )}

        <Button 
          type="submit" 
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating Account...' : 'Continue'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <a href="/login" className="text-conve-red hover:underline">Sign in</a>
      </p>
    </div>
  );
};

export default LightAccountCreation;
