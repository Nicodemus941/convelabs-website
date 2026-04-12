
import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { MessageSquare } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useWebhookIntegration } from "@/hooks/useWebhookIntegration";
import { useVisitorOptimization } from "@/hooks/useVisitorOptimization";

// Form validation schema
const contactFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  phone: z.string().optional(),
  subject: z.string().min(5, { message: "Subject must be at least 5 characters." }),
  message: z.string().min(10, { message: "Message must be at least 10 characters." }),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

const ContactForm: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { qualifyLead } = useWebhookIntegration();
  const { trackFormStart, trackFormComplete } = useVisitorOptimization();

  // Initialize form
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: "",
    },
  });
  
  // Form submission handler
  const onSubmit = async (data: ContactFormValues) => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      // Track form completion in local system
      trackFormComplete('contact-form');
      
      // Qualify lead through webhook integration
      console.log('Attempting lead qualification for:', data.email);
      const qualification = await qualifyLead({
        email: data.email,
        phone: data.phone,
        name: data.name,
        source: 'contact_form',
        metadata: {
          page_visited: window.location.pathname,
          time_on_site: 0,
          interactions_count: 1,
          subject: data.subject,
          message_length: data.message.length,
        },
      });

      if (qualification) {
        console.log('Lead qualification successful:', qualification);
        // Show personalized response based on qualification
        if (qualification.qualification.score >= 80) {
          toast.success("Thank you! Based on your inquiry, we'll prioritize your request and contact you within 2 hours.");
        } else if (qualification.qualification.score >= 60) {
          toast.success("Your message has been sent! We'll schedule a consultation call with you within 24 hours.");
        } else {
          toast.success("Your message has been sent! We'll be in touch shortly with helpful information.");
        }
      } else {
        console.log('Lead qualification failed or returned null');
        toast.success("Your message has been sent! We'll be in touch shortly.");
      }
      
      // Reset form
      form.reset();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error("There was an issue sending your message. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Track form start
  const handleFormFocus = () => {
    trackFormStart('contact-form');
  };
  
  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-xl font-semibold mb-6 flex items-center">
          <MessageSquare className="w-5 h-5 mr-2 text-conve-red" />
          Send Us a Message
        </h2>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="name"
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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input placeholder="john@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="(123) 456-7890" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="How can we help you?" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Please provide details about your inquiry..." 
                      className="min-h-32"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Button 
              type="submit" 
              className="w-full md:w-auto"
              disabled={isSubmitting}
              onFocus={handleFormFocus}
            >
              {isSubmitting ? "Sending..." : "Send Message"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default ContactForm;
