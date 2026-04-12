
import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

// Import components for the form
import FormSection from "@/components/partnerships/onboarding/FormSection";
import PracticeInfoTab from "@/components/partnerships/onboarding/tabs/PracticeInfoTab";
import BrandingTab from "@/components/partnerships/onboarding/tabs/BrandingTab";
import ServicesTab from "@/components/partnerships/onboarding/tabs/ServicesTab";
import DomainTab from "@/components/partnerships/onboarding/tabs/DomainTab";
import AdditionalTab from "@/components/partnerships/onboarding/tabs/AdditionalTab";
import TabNavigation from "@/components/partnerships/onboarding/TabNavigation";

const PartnershipOnboarding: React.FC = () => {
  const [activeTab, setActiveTab] = useState('practice-info');
  const [formData, setFormData] = useState({
    // Practice Info
    practiceName: '',
    practiceDescription: '',
    contactEmail: '',
    contactPhone: '',
    
    // Branding
    logoUrl: '',
    primaryColor: '#FF0000', // Default red color
    secondaryColor: '#333333', // Default dark gray
    
    // Services
    services: '',
    
    // Domain
    preferredDomain: '',
    numberOfStaffAccounts: 2,
    
    // Additional
    additionalNotes: ''
  });
  
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Check if coming from payment completion
  useEffect(() => {
    const packageName = localStorage.getItem('partnershipPackageName');
    if (packageName) {
      toast.success(`Thank you for purchasing the ${packageName} package! Please complete your onboarding information.`);
    }
  }, []);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };
  
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const fileUrl = URL.createObjectURL(file);
      setLogoPreview(fileUrl);
      
      setFormData(prev => ({
        ...prev,
        logoUrl: fileUrl
      }));
    }
  };
  
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: parseInt(e.target.value) || 1
    }));
  };
  
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };
  
  const handleNextTab = () => {
    switch(activeTab) {
      case 'practice-info':
        setActiveTab('branding');
        break;
      case 'branding':
        setActiveTab('services');
        break;
      case 'services':
        setActiveTab('domain');
        break;
      case 'domain':
        setActiveTab('additional');
        break;
      default:
        handleSubmitForm();
    }
  };
  
  const handlePrevTab = () => {
    switch(activeTab) {
      case 'branding':
        setActiveTab('practice-info');
        break;
      case 'services':
        setActiveTab('branding');
        break;
      case 'domain':
        setActiveTab('services');
        break;
      case 'additional':
        setActiveTab('domain');
        break;
    }
  };
  
  const handleSubmitForm = async () => {
    setIsSubmitting(true);
    
    try {
      // Add package info from localStorage
      const partnershipPackageId = localStorage.getItem('partnershipPackageId');
      const sessionId = localStorage.getItem('partnershipSessionId');
      
      // Map form data to match database schema
      const dbFormData = {
        practice_name: formData.practiceName,
        practice_description: formData.practiceDescription,
        contact_email: formData.contactEmail,
        contact_phone: formData.contactPhone,
        primary_color: formData.primaryColor,
        secondary_color: formData.secondaryColor,
        logo_path: formData.logoUrl,
        services: formData.services,
        preferred_domain: formData.preferredDomain,
        number_of_staff_accounts: formData.numberOfStaffAccounts,
        additional_notes: formData.additionalNotes,
        package_id: partnershipPackageId || 'unknown',
        session_id: sessionId
      };
      
      // Insert into database
      const { error } = await supabase.from('partnership_onboarding').insert([dbFormData]);
      
      if (error) {
        console.error('Error submitting onboarding data:', error);
        toast.error('There was an error submitting your information. Please try again.');
        setIsSubmitting(false);
        return;
      }
      
      // Success - clear localStorage
      localStorage.removeItem('partnershipPackageId');
      localStorage.removeItem('partnershipPackageName');
      localStorage.removeItem('partnershipSessionId');
      
      // Redirect to success page
      window.location.href = '/partnership-success';
      
    } catch (error) {
      console.error('Error in form submission:', error);
      toast.error('An unexpected error occurred. Please try again later.');
      setIsSubmitting(false);
    }
  };
  
  return (
    <>
      <Helmet>
        <title>Complete Your Platform Setup | ConveLabs Partnership</title>
        <meta 
          name="description" 
          content="Complete your medical software platform setup with ConveLabs. Provide your practice details, branding preferences, and technical requirements." 
        />
      </Helmet>
      
      <div className="min-h-screen bg-white flex flex-col overflow-hidden">
        <Header />
        
        <main className="flex-grow">
          <div className="container mx-auto px-4 py-16">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-bold mb-4">Complete Your Platform Setup</h1>
                <p className="text-lg text-gray-600">
                  Tell us about your practice so we can customize your medical software platform. 
                  This information will help us build a solution that perfectly fits your needs.
                </p>
              </div>
              
              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="grid grid-cols-5 mb-8">
                  <TabsTrigger value="practice-info">Practice Info</TabsTrigger>
                  <TabsTrigger value="branding">Branding</TabsTrigger>
                  <TabsTrigger value="services">Services</TabsTrigger>
                  <TabsTrigger value="domain">Domain</TabsTrigger>
                  <TabsTrigger value="additional">Additional</TabsTrigger>
                </TabsList>
                
                <TabsContent value="practice-info">
                  <FormSection title="Practice Information">
                    <PracticeInfoTab 
                      formData={formData} 
                      handleInputChange={handleInputChange} 
                      handleNext={handleNextTab}
                    />
                  </FormSection>
                </TabsContent>
                
                <TabsContent value="branding">
                  <FormSection title="Branding Preferences">
                    <BrandingTab 
                      formData={formData} 
                      handleInputChange={handleInputChange} 
                      handleLogoChange={handleLogoChange}
                      logoPreview={logoPreview}
                      handlePrevious={handlePrevTab}
                      handleNext={handleNextTab}
                    />
                  </FormSection>
                </TabsContent>
                
                <TabsContent value="services">
                  <FormSection title="Services">
                    <ServicesTab 
                      formData={formData} 
                      handleInputChange={handleInputChange} 
                      handlePrevious={handlePrevTab}
                      handleNext={handleNextTab}
                    />
                  </FormSection>
                </TabsContent>
                
                <TabsContent value="domain">
                  <FormSection title="Domain Configuration">
                    <DomainTab 
                      formData={formData} 
                      handleInputChange={handleInputChange} 
                      handleNumberChange={handleNumberChange}
                      handlePrevious={handlePrevTab}
                      handleNext={handleNextTab}
                    />
                  </FormSection>
                </TabsContent>
                
                <TabsContent value="additional">
                  <FormSection title="Additional Information">
                    <AdditionalTab 
                      formData={formData} 
                      handleInputChange={handleInputChange} 
                      handlePrevious={handlePrevTab}
                      isSubmitting={isSubmitting}
                    />
                  </FormSection>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </main>
        
        <Footer />
      </div>
    </>
  );
};

export default PartnershipOnboarding;
