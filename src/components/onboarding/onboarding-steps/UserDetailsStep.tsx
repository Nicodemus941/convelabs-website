
import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage,
  FormDescription 
} from '@/components/ui/form';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format, parse } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { getUserProfileProperties } from '@/types/supabase';

const formSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  dateOfBirth: z.date({
    required_error: "Date of birth is required",
  }),
  addressStreet: z.string().min(1, "Street address is required"),
  addressCity: z.string().min(1, "City is required"),
  addressState: z.string().min(1, "State is required"),
  addressZipcode: z.string().min(5, "Valid ZIP code is required"),
  insuranceProvider: z.string().optional(),
  insuranceId: z.string().optional(),
});

const UserDetailsStep: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { address, setAddress } = useOnboarding();
  
  // Fetch current user profile
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('User not found');
      
      const { data: profileData, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
        
      if (error) throw error;
      return profileData;
    }
  });
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: '',
      dateOfBirth: undefined,
      addressStreet: address.street || '',
      addressCity: address.city || '',
      addressState: address.state || '',
      addressZipcode: address.zipcode || '',
      insuranceProvider: '',
      insuranceId: '',
    }
  });
  
  // Update form when profile data is loaded
  useEffect(() => {
    if (profile) {
      const profileProps = getUserProfileProperties(profile);
      form.reset({
        fullName: profileProps.full_name || '',
        dateOfBirth: profileProps.date_of_birth || undefined,
        addressStreet: profileProps.address_street || address.street || '',
        addressCity: profileProps.address_city || address.city || '',
        addressState: profileProps.address_state || address.state || '',
        addressZipcode: profileProps.address_zipcode || address.zipcode || '',
        insuranceProvider: profileProps.insurance_provider || '',
        insuranceId: profileProps.insurance_id || '',
      });
    }
  }, [profile, form]);

  // Update user profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('User not found');
      
      const { error } = await supabase
        .from('user_profiles')
        .update({
          full_name: data.fullName,
          date_of_birth: data.dateOfBirth.toISOString(),
          address_street: data.addressStreet,
          address_city: data.addressCity,
          address_state: data.addressState,
          address_zipcode: data.addressZipcode,
          insurance_provider: data.insuranceProvider,
          insurance_id: data.insuranceId,
          updated_at: new Date().toISOString()
        })
        .eq('id', userData.user.id);
        
      if (error) throw error;
      
      // Update context
      setAddress({
        street: data.addressStreet,
        city: data.addressCity,
        state: data.addressState,
        zipcode: data.addressZipcode,
      });
      
      return userData.user.id;
    },
    onSuccess: () => {
      toast.success('Profile information saved');
    },
    onError: (error) => {
      console.error('Profile update error:', error);
      toast.error('Failed to update profile');
    }
  });

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true);
      await updateProfileMutation.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin w-6 h-6 border-2 border-primary rounded-full border-t-transparent"></div>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold mb-2">Your Details</h2>
          <p className="text-sm text-muted-foreground">
            Please provide your personal information for your membership
          </p>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="dateOfBirth"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date of Birth</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="addressStreet"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="addressCity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="New York" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="addressState"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl>
                      <Input placeholder="NY" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="addressZipcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZIP Code</FormLabel>
                    <FormControl>
                      <Input placeholder="10001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="pt-4">
              <h3 className="text-base font-medium mb-2">Insurance Information (Optional)</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="insuranceProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Insurance Provider</FormLabel>
                      <FormControl>
                        <Input placeholder="Aetna, Blue Cross, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="insuranceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Insurance ID</FormLabel>
                      <FormControl>
                        <Input placeholder="Member ID" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Details"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default UserDetailsStep;
