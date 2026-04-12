
import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const PartnershipSuccess: React.FC = () => {
  const navigate = useNavigate();
  
  return (
    <>
      <Helmet>
        <title>Platform Setup Complete | ConveLabs Partnership</title>
        <meta 
          name="description" 
          content="Thank you for partnering with ConveLabs. Your medical software platform is now in development." 
        />
      </Helmet>
      
      <div className="min-h-screen bg-white flex flex-col overflow-hidden">
        <Header />
        
        <main className="flex-grow">
          <div className="container mx-auto px-4 py-20">
            <div className="max-w-2xl mx-auto text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
                <CheckCircle className="h-12 w-12 text-green-600" />
              </div>
              
              <h1 className="text-3xl md:text-4xl font-bold mb-6">Platform Setup Complete!</h1>
              
              <div className="bg-white border border-gray-200 rounded-xl p-8 mb-8 shadow-sm">
                <p className="text-xl mb-6">
                  Thank you for partnering with ConveLabs. We've received your platform details 
                  and our team is already getting started on your custom medical software platform.
                </p>
                
                <div className="space-y-4 text-left mb-8">
                  <div className="flex items-start">
                    <div className="bg-conve-red/10 rounded-full p-1 mr-3 mt-1">
                      <div className="w-4 h-4 bg-conve-red rounded-full"></div>
                    </div>
                    <div>
                      <h3 className="font-semibold">Next: Design Review</h3>
                      <p className="text-gray-600">We'll create initial designs based on your preferences and send them for your review.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="bg-conve-red/10 rounded-full p-1 mr-3 mt-1">
                      <div className="w-4 h-4 bg-conve-red rounded-full"></div>
                    </div>
                    <div>
                      <h3 className="font-semibold">Development Phase</h3>
                      <p className="text-gray-600">After design approval, we'll build your platform with all selected features.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start">
                    <div className="bg-conve-red/10 rounded-full p-1 mr-3 mt-1">
                      <div className="w-4 h-4 bg-conve-red rounded-full"></div>
                    </div>
                    <div>
                      <h3 className="font-semibold">Launch & Training</h3>
                      <p className="text-gray-600">We'll deploy your platform and show you how to manage everything.</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <p className="font-medium">Your platform delivery timeline starts now!</p>
                  <p className="text-sm text-gray-600">You'll receive an email with more details and your dedicated project manager's contact information.</p>
                </div>
                
                <Button 
                  onClick={() => navigate("/")}
                  className="bg-conve-red hover:bg-conve-red/90"
                >
                  Return to Homepage
                </Button>
              </div>
            </div>
          </div>
        </main>
        
        <Footer />
      </div>
    </>
  );
};

export default PartnershipSuccess;
