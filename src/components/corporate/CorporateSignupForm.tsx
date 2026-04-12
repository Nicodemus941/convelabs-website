import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, Mail, Users, Building2 } from "lucide-react";

interface CorporateSignupFormProps {
  onSuccess?: (data: any) => void;
}

export const CorporateSignupForm = ({ onSuccess }: CorporateSignupFormProps) => {
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      console.log('Submitting corporate signup:', formData);

      const { data, error } = await supabase.functions.invoke('corporate-signup', {
        body: formData
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Corporate signup failed');
      }

      console.log('Corporate signup successful:', data);

      toast({
        title: "Welcome to ConveLabs!",
        description: `Corporate account created successfully. Check ${formData.contact_email} for next steps.`,
      });

      // Download CSV template
      if (data.csv_template) {
        const blob = new Blob([data.csv_template], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${formData.company_name.replace(/\s+/g, '_')}_employees_template.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }

      if (onSuccess) {
        onSuccess(data);
      }

    } catch (error) {
      console.error('Corporate signup error:', error);
      toast({
        title: "Signup Failed",
        description: error.message || "Failed to create corporate account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Building2 className="h-12 w-12 text-conve-red" />
        </div>
        <CardTitle className="text-3xl font-bold text-conve-red font-playfair">
          Corporate Wellness Signup
        </CardTitle>
        <CardDescription className="text-lg">
          Get started with ConveLabs Corporate Wellness Program for your organization
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name *</Label>
              <Input
                id="company_name"
                name="company_name"
                type="text"
                required
                value={formData.company_name}
                onChange={handleInputChange}
                placeholder="Enter your company name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_name">Contact Name *</Label>
              <Input
                id="contact_name"
                name="contact_name"
                type="text"
                required
                value={formData.contact_name}
                onChange={handleInputChange}
                placeholder="Your full name"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_email">Contact Email *</Label>
              <Input
                id="contact_email"
                name="contact_email"
                type="email"
                required
                value={formData.contact_email}
                onChange={handleInputChange}
                placeholder="your.email@company.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_phone">Contact Phone</Label>
              <Input
                id="contact_phone"
                name="contact_phone"
                type="tel"
                value={formData.contact_phone}
                onChange={handleInputChange}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div className="bg-conve-red/5 p-6 rounded-lg">
            <h3 className="font-semibold text-lg mb-3 text-conve-red">What happens next?</h3>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <Mail className="h-5 w-5 text-conve-red mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Welcome Email</p>
                  <p className="text-sm text-gray-600">You'll receive a welcome email with your corporate ID and next steps</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Download className="h-5 w-5 text-conve-red mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">CSV Template Download</p>
                  <p className="text-sm text-gray-600">Download a template to easily upload your employee list in bulk</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Users className="h-5 w-5 text-conve-red mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Employee Invitations</p>
                  <p className="text-sm text-gray-600">Each employee will receive their member ID and onboarding instructions</p>
                </div>
              </div>
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full bg-conve-red hover:bg-conve-red/90 text-white font-semibold py-3 text-lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Creating Account...
              </>
            ) : (
              'Create Corporate Account'
            )}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>By creating an account, you agree to our Terms of Service and Privacy Policy.</p>
          <p className="mt-2">Need help? Contact us at <a href="mailto:info@convelabs.com" className="text-conve-red hover:underline">info@convelabs.com</a></p>
        </div>
      </CardContent>
    </Card>
  );
};