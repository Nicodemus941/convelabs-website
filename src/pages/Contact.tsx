
import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import ContactInformation from "@/components/contact/ContactInformation";
import ContactForm from "@/components/contact/ContactForm";
import MapSection from "@/components/contact/MapSection";
import FaqSection from "@/components/contact/FaqSection";

const ContactPage: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Contact Us | ConveLabs | Central Florida's Mobile Phlebotomy Service</title>
        <meta 
          name="description" 
          content="Contact ConveLabs for inquiries about our mobile phlebotomy services in Orlando, Tampa, and throughout Central Florida. We're here to answer your questions." 
        />
        <meta name="keywords" content="contact ConveLabs, mobile phlebotomy contact, Orlando lab services, Tampa blood draw, Central Florida healthcare contact" />
        <link rel="canonical" href="https://convelabs.com/contact" />
      </Helmet>
      
      <Header />
      
      <main className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-4xl font-bold mb-2 text-center">Contact Us</h1>
          <p className="text-lg text-gray-600 text-center mb-12">
            Have questions? We're here to help. Reach out to our team.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Contact Information */}
            <div className="md:col-span-1">
              <ContactInformation />
            </div>
            
            {/* Contact Form */}
            <div className="md:col-span-2">
              <ContactForm />
            </div>
          </div>
          
          {/* Map Section */}
          <MapSection />
          
          {/* FAQ Section */}
          <FaqSection />
        </div>
      </main>
      
      <Footer />
    </>
  );
};

export default ContactPage;
