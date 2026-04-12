
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMutation } from '@tanstack/react-query';
import { useForm, FormProvider } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form';

const formSchema = z.object({
  practiceName: z.string().min(1, "Practice name is required"),
  contactPhone: z.string().min(1, "Contact phone is required"),
  contactEmail: z.string().email("Must be a valid email"),
  preferredLabCompany: z.string().optional(),
  additionalInstructions: z.string().optional()
});

const ConciergeSetupStep: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      practiceName: '',
      contactPhone: '',
      contactEmail: '',
      preferredLabCompany: '',
      additionalInstructions: ''
    }
  });

  // Save practice information mutation
  const savePracticeMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('User not authenticated');
      
      // Store the practice information in user metadata
      const { error } = await supabase.auth.updateUser({
        data: {
          practiceName: values.practiceName,
          contactPhone: values.contactPhone,
          contactEmail: values.contactEmail,
          preferredLabCompany: values.preferredLabCompany,
          additionalInstructions: values.additionalInstructions
        }
      });
      
      if (error) throw error;
      return data.user.id;
    },
    onSuccess: () => {
      toast.success('Practice setup completed successfully');
    },
    onError: (error) => {
      console.error('Practice setup error:', error);
      toast.error('Failed to complete practice setup. Please try again.');
    }
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true);
      await savePracticeMutation.mutateAsync(values);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold mb-2">Practice Setup</h2>
          <p className="text-sm text-muted-foreground">
            Complete your concierge doctor practice setup
          </p>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="practiceName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Practice Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter your practice name" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="contactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="contact@practice.com" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="preferredLabCompany"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preferred Lab Company (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., LabCorp, Quest Diagnostics" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="additionalInstructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Instructions for Phlebotomists (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Special instructions for serving your patients"
                      className="h-24"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <Button 
              type="submit"
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? 'Saving...' : 'Save Practice Setup'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default ConciergeSetupStep;
