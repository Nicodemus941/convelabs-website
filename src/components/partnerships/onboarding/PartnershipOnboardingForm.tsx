
import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// Import tab components
import PracticeInfoTab from "./tabs/PracticeInfoTab";
import BrandingTab from "./tabs/BrandingTab";
import ServicesTab from "./tabs/ServicesTab";
import DomainTab from "./tabs/DomainTab";
import AdditionalTab from "./tabs/AdditionalTab";

interface PartnershipOnboardingFormProps {
  sessionId: string | null;
}

interface FormData {
  practiceName: string;
  practiceDescription: string;
  contactEmail: string;
  contactPhone: string;
  primaryColor: string;
  secondaryColor: string;
  logo: File | null;
  services: string;
  preferredDomain: string;
  numberOfStaffAccounts: number;
  additionalNotes: string;
}

const PartnershipOnboardingForm: React.FC<PartnershipOnboardingFormProps> = ({ sessionId }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("practice");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<FormData>({
    practiceName: "",
    practiceDescription: "",
    contactEmail: "",
    contactPhone: "",
    primaryColor: "#E73336", // Default to ConveLabs red
    secondaryColor: "#000000", // Default to black
    logo: null,
    services: "",
    preferredDomain: "",
    numberOfStaffAccounts: 2,
    additionalNotes: ""
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFormData(prev => ({ ...prev, logo: file }));
      
      // Create a preview
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogoPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  const handleNext = () => {
    const tabs = ["practice", "branding", "services", "domain", "additional"];
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex < tabs.length - 1) {
      setActiveTab(tabs[currentIndex + 1]);
    }
  };

  const handlePrevious = () => {
    const tabs = ["practice", "branding", "services", "domain", "additional"];
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Upload logo if provided
      let logoPath = null;
      if (formData.logo) {
        const fileExt = formData.logo.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        const filePath = `partnership-onboarding/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('practice-assets')
          .upload(filePath, formData.logo);
          
        if (uploadError) {
          throw new Error(`Error uploading logo: ${uploadError.message}`);
        }
        
        logoPath = filePath;
      }
      
      // Save form data using the RPC function we created
      const { error } = await supabase.rpc(
        'insert_partnership_onboarding' as any, // Type assertion as workaround
        {
          p_session_id: sessionId,
          p_practice_name: formData.practiceName,
          p_practice_description: formData.practiceDescription,
          p_contact_email: formData.contactEmail,
          p_contact_phone: formData.contactPhone,
          p_primary_color: formData.primaryColor,
          p_secondary_color: formData.secondaryColor,
          p_logo_path: logoPath,
          p_services: formData.services,
          p_preferred_domain: formData.preferredDomain,
          p_number_of_staff_accounts: formData.numberOfStaffAccounts,
          p_additional_notes: formData.additionalNotes
        }
      );
      
      if (error) throw new Error(`Error saving data: ${error.message}`);
      
      toast.success("Your platform details have been submitted successfully!");
      navigate("/partnership-success");
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error("There was an error submitting your form. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold mb-4">Complete Your Platform Setup</h1>
        <p className="text-xl text-gray-600">
          Provide the details we need to build your custom medical software platform.
        </p>
      </div>
      
      <form onSubmit={handleSubmit}>
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid grid-cols-5 mb-8">
            <TabsTrigger value="practice">Practice</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="domain">Domain</TabsTrigger>
            <TabsTrigger value="additional">Additional</TabsTrigger>
          </TabsList>
          
          <TabsContent value="practice">
            <PracticeInfoTab 
              formData={formData}
              handleInputChange={handleInputChange}
              handleNext={handleNext}
            />
          </TabsContent>
          
          <TabsContent value="branding">
            <BrandingTab 
              formData={formData}
              handleInputChange={handleInputChange}
              handleLogoChange={handleLogoChange}
              logoPreview={logoPreview}
              handlePrevious={handlePrevious}
              handleNext={handleNext}
            />
          </TabsContent>
          
          <TabsContent value="services">
            <ServicesTab 
              formData={formData}
              handleInputChange={handleInputChange}
              handlePrevious={handlePrevious}
              handleNext={handleNext}
            />
          </TabsContent>
          
          <TabsContent value="domain">
            <DomainTab 
              formData={formData}
              handleInputChange={handleInputChange}
              handleNumberChange={handleNumberChange}
              handlePrevious={handlePrevious}
              handleNext={handleNext}
            />
          </TabsContent>
          
          <TabsContent value="additional">
            <AdditionalTab 
              formData={formData}
              handleInputChange={handleInputChange}
              handlePrevious={handlePrevious}
              isSubmitting={isSubmitting}
            />
          </TabsContent>
        </Tabs>
      </form>
    </div>
  );
};

export default PartnershipOnboardingForm;
