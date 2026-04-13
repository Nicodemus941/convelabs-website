
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MessageSquare, HelpCircle, FileText, Phone } from "lucide-react";
import { toast } from "@/components/ui/sonner";

const HelpCenter = () => {
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setContactForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!contactForm.name || !contactForm.email || !contactForm.message) {
      toast.error("Please fill out all required fields");
      return;
    }
    
    setIsSubmitting(true);
    
    // Simulate API call
    setTimeout(() => {
      toast.success("Your message has been sent. We'll get back to you shortly.");
      setContactForm({
        name: "",
        email: "",
        subject: "",
        message: ""
      });
      setIsSubmitting(false);
    }, 1500);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
          <CardDescription>Find answers to common questions about using ConveLabs</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>How do I schedule a lab draw for my patient?</AccordionTrigger>
              <AccordionContent>
                You can schedule a lab draw by clicking the "Schedule Lab Work" button at the top of your dashboard
                or navigating to the Schedule tab. Fill in the patient's information, upload the lab order, and select
                a preferred date and time. The patient will receive an email and SMS confirmation once scheduled.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>How long does it take to receive lab results?</AccordionTrigger>
              <AccordionContent>
                Once specimens are delivered to the lab, a confirmation text and email will be sent with the lab-generated tracking ID.
                Results timing varies by lab and test type, and are available through the lab's patient portal.
                You'll receive a notification in your dashboard when results are ready to view.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>How do credits work on my account?</AccordionTrigger>
              <AccordionContent>
                Each lab draw appointment uses one credit from your account. Your monthly plan includes a set number
                of credits that refresh each billing cycle. You can view your current credit usage in the Billing tab.
                Any unused credits roll over for up to one month before expiring.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>Can I add my staff to help manage appointments?</AccordionTrigger>
              <AccordionContent>
                Yes, you can add staff members with different permission levels by visiting the Staff Access tab.
                You can grant read-only, limited, or full access depending on your needs. Staff members will receive
                an email invitation to create their account and access your dashboard.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-5">
              <AccordionTrigger>What information do I need to schedule a patient?</AccordionTrigger>
              <AccordionContent>
                To schedule a patient, you'll need their full name, date of birth, email address, phone number, 
                and address (for in-home services). You'll also need to upload a lab order in PDF or image format.
                The more information you provide, the better we can serve your patient.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-6">
              <AccordionTrigger>How can I view or download past invoices?</AccordionTrigger>
              <AccordionContent>
                All past invoices can be viewed and downloaded from the Billing tab in your dashboard. You can
                download them as PDF files for your records. Invoices are generated on the first day of each month
                or according to your billing cycle.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
      
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Contact Support</CardTitle>
            <CardDescription>Get help from our team</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  name="name"
                  placeholder="Your name"
                  required
                  value={contactForm.name}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  name="email"
                  type="email"
                  placeholder="Your email"
                  required
                  value={contactForm.email}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Subject</label>
                <Input
                  name="subject"
                  placeholder="How can we help?"
                  value={contactForm.subject}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Message</label>
                <Textarea
                  name="message"
                  placeholder="Please describe your issue or question"
                  required
                  rows={4}
                  value={contactForm.message}
                  onChange={handleInputChange}
                />
              </div>
              
              <Button 
                type="submit" 
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Sending..." : "Send Message"}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-medium text-lg mb-4">Quick Support Options</h3>
            
            <div className="space-y-4">
              <Button variant="outline" className="w-full justify-start">
                <Phone className="h-4 w-4 mr-2" />
                Call Support: (555) 123-4567
              </Button>
              
              <Button variant="outline" className="w-full justify-start">
                <MessageSquare className="h-4 w-4 mr-2" />
                Live Chat
              </Button>
              
              <Button variant="outline" className="w-full justify-start">
                <FileText className="h-4 w-4 mr-2" />
                View Documentation
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default HelpCenter;
