
import React, { useState } from "react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useEmailNotifications } from "@/hooks/useEmailNotifications";

// Form validation schema
const formSchema = z.object({
  fullName: z.string().min(2, { message: "Full name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  phone: z.string().min(10, { message: "Please enter a valid phone number." }),
  location: z.string().min(2, { message: "Please enter your city and state." }),
  linkedIn: z.string().optional(),
  healthcareExperience: z.boolean(),
  hasCapital: z.boolean(),
  reason: z.string().min(10, { message: "Please tell us why you want to franchise with ConveLabs." }),
  agreedToTerms: z.boolean().refine((val) => val === true, {
    message: "You must agree to the terms to submit your application.",
  }),
});

type FormValues = z.infer<typeof formSchema>;

const FranchiseForm: React.FC = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { sendFranchiseApplicationEmail } = useEmailNotifications();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      location: "",
      linkedIn: "",
      healthcareExperience: false,
      hasCapital: false,
      reason: "",
      agreedToTerms: false,
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);
      
      // Submit application to database
      const { error } = await supabase
        .from("franchise_applications")
        .insert({
          full_name: values.fullName,
          email: values.email,
          phone: values.phone,
          location: values.location,
          healthcare_experience: values.healthcareExperience,
          estimated_budget: values.hasCapital ? 100000 : 0,
          background: `LinkedIn: ${values.linkedIn || 'Not provided'}\n\nReason for interest: ${values.reason}`,
          agreed_to_terms: values.agreedToTerms,
        });
      
      if (error) throw new Error(error.message);
      
      // Send notification email
      await sendFranchiseApplicationEmail(
        values.fullName,
        values.email,
        values.phone,
        values.location,
        values.healthcareExperience ? "Yes" : "No",
        values.hasCapital ? "$100,000+" : "Not specified"
      );
      
      // Success message
      toast({
        title: "Application Submitted",
        description: "Thank you for your interest! We'll be in touch soon.",
      });
      
      // Reset form
      form.reset();
      
    } catch (err: any) {
      toast({
        title: "Submission Error",
        description: err.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="franchise-form" className="py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-6">
            Ready to Launch Your Own Luxury Lab Business?
          </h2>
          <p className="text-center text-gray-600 mb-10">
            Submit your application today and take the first step toward owning your territory. We're looking for driven, detail-oriented entrepreneurs ready to elevate healthcare in their city.
          </p>
          
          <div className="bg-white p-8 rounded-lg shadow-sm">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                
                <div className="grid md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="john.doe@example.com" type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="(555) 123-4567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City & State</FormLabel>
                        <FormControl>
                          <Input placeholder="Orlando, FL" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="linkedIn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>LinkedIn URL (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="https://linkedin.com/in/johndoe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="healthcareExperience"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          Do you have healthcare or business experience?
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="hasCapital"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          Do you have access to at least $100,000 in capital?
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Why do you want to franchise with ConveLabs?</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell us why you're interested in franchising with ConveLabs..."
                          className="min-h-32"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="agreedToTerms"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-sm">
                          I understand the minimum investment requirements and royalty fees.
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit" 
                  className="w-full bg-conve-red hover:bg-conve-red/90" 
                  size="lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Submit Your Application"}
                </Button>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FranchiseForm;
