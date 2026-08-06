
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
import { useVisitorOptimization } from "@/hooks/useVisitorOptimization";
import { supabase } from "@/integrations/supabase/client";

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

      const contactSummary = [
        `Name: ${data.name}`,
        `Email: ${data.email}`,
        data.phone ? `Phone: ${data.phone}` : null,
        `Subject: ${data.subject}`,
        `Page: ${window.location.href}`,
        "",
        data.message,
      ].filter(Boolean).join("\n");

      const leadCapture = await supabase.functions.invoke('process-lead-capture', {
        body: {
          email: data.email.trim().toLowerCase(),
          source: 'contact_form',
          referrer: window.location.href,
          userAgent: navigator.userAgent,
        },
      });

      const adminEmail = await supabase.functions.invoke('send-email', {
        body: {
          to: 'info@convelabs.com',
          subject: `[ConveLabs Contact] ${data.subject}`,
          text: contactSummary,
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
              <h2 style="margin-bottom:16px;">New website contact inquiry</h2>
              <p><strong>Name:</strong> ${data.name}</p>
              <p><strong>Email:</strong> ${data.email}</p>
              ${data.phone ? `<p><strong>Phone:</strong> ${data.phone}</p>` : ''}
              <p><strong>Subject:</strong> ${data.subject}</p>
              <p><strong>Page:</strong> ${window.location.href}</p>
              <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
              <p style="white-space:pre-wrap;">${data.message}</p>
            </div>
          `,
        },
      });

      const leadSaved = !leadCapture.error && leadCapture.data?.success !== false;
      const messageDelivered = !adminEmail.error && adminEmail.data?.success !== false;

      if (!leadSaved && !messageDelivered) {
        throw new Error("Unable to save or deliver contact inquiry");
      }

      toast.success(
        messageDelivered
          ? "Your message has been sent. We'll be in touch shortly."
          : "Your inquiry was saved successfully. We'll follow up shortly."
      );
      
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
