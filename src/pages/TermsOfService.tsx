
import React from 'react';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';

const TermsOfService = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <div className="container mx-auto py-12 px-4 flex-grow">
        <div className="max-w-4xl mx-auto prose">
          <h1 className="text-4xl font-bold mb-6">Terms of Service</h1>
          
          <p className="mb-4">
            Last updated: May 22, 2025
          </p>
          
          <h2 className="text-2xl font-semibold mt-8 mb-4">1. Acceptance of Terms</h2>
          <p>
            By accessing or using ConveLabs services, you agree to be bound by these Terms of Service.
            If you do not agree to all the terms and conditions, you may not access or use our services.
          </p>
          
          <h2 className="text-2xl font-semibold mt-8 mb-4">2. Description of Services</h2>
          <p>
            ConveLabs provides mobile phlebotomy and testing services. Our services include but are not limited to
            blood draws, specimen collection, and laboratory testing coordination. These services are provided
            through our membership plans or on an a-la-carte basis.
          </p>
          
          <h2 className="text-2xl font-semibold mt-8 mb-4">3. Membership and Payment</h2>
          <p>
            Membership plans require regular payment as specified in the plan details. Members agree to maintain
            accurate and current payment information. We reserve the right to modify pricing with notice to members.
          </p>
          
          <h2 className="text-2xl font-semibold mt-8 mb-4">4. Privacy and Medical Information</h2>
          <p>
            We are committed to protecting your privacy and maintaining the confidentiality of your medical information
            in accordance with all applicable laws and regulations, including HIPAA. Please refer to our Privacy Policy
            for more details on how we collect, use, and protect your personal information.
          </p>
          
          <h2 className="text-2xl font-semibold mt-8 mb-4">5. Limitations of Liability</h2>
          <p>
            ConveLabs is not liable for any indirect, incidental, special, consequential, or punitive damages resulting
            from your use or inability to use our services. Our liability is limited to the amount you have paid for services.
          </p>
          
          <h2 className="text-2xl font-semibold mt-8 mb-4">6. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms of Service at any time. Continued use of our services after
            changes constitutes acceptance of the modified terms.
          </p>
          
          <h2 className="text-2xl font-semibold mt-8 mb-4">7. Contact Information</h2>
          <p>
            If you have any questions about these Terms, please contact us at terms@convelabs.com or through our
            Contact page.
          </p>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default TermsOfService;
