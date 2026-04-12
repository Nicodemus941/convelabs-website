
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/tenant/TenantContext';
import { useSubscriptionTiers } from '@/hooks/useSubscriptionTiers';
import { useTenantSubscription } from '@/hooks/tenant/useTenantSubscription';
import SubscriptionTierCard from './SubscriptionTierCard';

const signupSchema = z.object({
  organizationName: z.string().min(2, 'Organization name must have at least 2 characters'),
  fullName: z.string().min(2, 'Full name must have at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
});

type SignupFormValues = z.infer<typeof signupSchema>;

const TenantSignupForm: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const { createTenant } = useTenant();
  const navigate = useNavigate();
  const { tiers, isLoading: tiersLoading } = useSubscriptionTiers();
  const { createSubscriptionCheckout } = useTenantSubscription();

  // Select the professional tier by default when tiers load
  useEffect(() => {
    if (tiers.length > 0 && !selectedTierId) {
      // Find the professional tier
      const professionalTier = tiers.find(tier => tier.name === 'Professional');
      setSelectedTierId(professionalTier?.id || tiers[0].id);
    }
  }, [tiers]);

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      organizationName: '',
      fullName: '',
      email: '',
      password: '',
      confirmPassword: ''
    }
  });

  const handleSelectTier = (tierId: string) => {
    setSelectedTierId(tierId);
  };

  const nextStep = () => {
    setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleSignup = async (data: SignupFormValues) => {
    if (!selectedTierId) {
      toast.error('Please select a subscription plan');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Split full name into first and last name
      const nameParts = data.fullName.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      // Register the new user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            firstName,
            lastName,
            full_name: data.fullName.trim(),
            role: 'office_manager' // Default role for tenant administrators
          }
        }
      });
      
      if (authError || !authData.user) {
        throw new Error(authError?.message || 'Failed to create account');
      }
      
      // Create tenant without subscription information initially (will be updated after checkout)
      const tenant = await createTenant({
        name: data.organizationName,
        contact_email: data.email,
        branding: {
          primary_color: '#5a67d8',
          secondary_color: '#4c51bf'
        },
        owner_id: authData.user.id
      });
      
      // Redirect to Stripe checkout for subscription
      await createSubscriptionCheckout(
        selectedTierId,
        authData.user.id,
        data.organizationName,
        `${window.location.origin}/tenant/dashboard/${tenant.id}`
      );
      
      toast.success('Your account has been created! Redirecting to payment...');
    } catch (error: any) {
      console.error('Signup error:', error);
      toast.error(error.message || 'Failed to create your organization. Please try again.');
      setIsSubmitting(false);
    }
  };

  // Render account creation step
  const renderAccountStep = () => (
    <Form {...form}>
      <form className="space-y-4">
        <FormField
          control={form.control}
          name="organizationName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization Name</FormLabel>
              <FormControl>
                <Input placeholder="Your Organization" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="Your Name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="you@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-end">
          <Button type="button" onClick={nextStep} disabled={
            !form.getValues().organizationName ||
            !form.getValues().fullName ||
            !form.getValues().email || 
            !form.getValues().password ||
            !form.getValues().confirmPassword ||
            form.getValues().password !== form.getValues().confirmPassword
          }>
            Next: Select Plan
          </Button>
        </div>
      </form>
    </Form>
  );

  // Render subscription plan selection step
  const renderSubscriptionStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Select a Subscription Plan</h2>
        <p className="text-gray-500 text-sm">Choose the plan that best fits your organization's needs.</p>
      </div>
      
      {tiersLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tiers.map((tier) => (
            <SubscriptionTierCard
              key={tier.id}
              tier={tier}
              isSelected={tier.id === selectedTierId}
              onSelect={handleSelectTier}
              isPrimary={tier.name === 'Professional'} // Mark Professional as popular
            />
          ))}
        </div>
      )}
      
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep}>
          Back
        </Button>
        
        <Button 
          onClick={form.handleSubmit(handleSignup)}
          disabled={isSubmitting || !selectedTierId}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Account...
            </>
          ) : (
            'Complete Sign Up'
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 1 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>1</div>
          <div className={`h-1 flex-1 mx-2 ${currentStep > 1 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 2 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>2</div>
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-sm font-medium">Account Details</span>
          <span className="text-sm font-medium">Select Plan</span>
        </div>
      </div>
      
      {currentStep === 1 ? renderAccountStep() : renderSubscriptionStep()}
      
      <div className="mt-4 text-center text-sm">
        <p>
          Already have an account?{' '}
          <a href="/login" className="text-blue-600 hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
};

export default TenantSignupForm;
