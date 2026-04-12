import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import PhlebotomistSignupForm from '@/components/phlebotomist/PhlebotomistSignupForm';

const PhlebotomistSignup: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Mobile Phlebotomy Software Platform | ConveLabs | Software for Phlebotomists</title>
        <meta 
          name="description" 
          content="ConveLabs offers powerful mobile phlebotomy software for independent phlebotomists and healthcare companies. Streamline operations with our all-in-one platform including appointment scheduling, patient management, and digital record keeping." 
        />
        <meta name="keywords" content="mobile phlebotomy software, software for phlebotomists, phlebotomy management platform, healthcare SaaS, phlebotomist tools, blood draw scheduling software" />
        <link rel="canonical" href="https://convelabs.com/phlebotomist-signup" />
        
        {/* Open Graph Tags */}
        <meta property="og:title" content="Mobile Phlebotomy Software Platform | ConveLabs" />
        <meta property="og:description" content="Join ConveLabs' comprehensive mobile phlebotomy software platform. Designed for phlebotomists and healthcare companies to streamline operations and improve patient care." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://convelabs.com/phlebotomist-signup" />
        
        {/* Twitter Card Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Mobile Phlebotomy Software Platform | ConveLabs" />
        <meta name="twitter:description" content="Powerful software for phlebotomists. Streamline your mobile phlebotomy business with our comprehensive SaaS platform." />
      </Helmet>
      
      <Header />
      
      <main className="min-h-screen bg-gray-50 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">Mobile Phlebotomy Software Platform</h1>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                Streamline your mobile phlebotomy services with our comprehensive software platform designed specifically for healthcare professionals and phlebotomy companies.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-12 mb-16 items-center">
              <div>
                <h2 className="text-2xl font-bold mb-4">Why Choose Our Phlebotomy Software?</h2>
                <ul className="space-y-4">
                  <li className="flex gap-3">
                    <div className="bg-blue-100 rounded-full h-8 w-8 flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Smart Scheduling System</h3>
                      <p className="text-gray-600">Intelligent routing and appointment scheduling software that minimizes travel time and maximizes productivity for mobile phlebotomists.</p>
                    </div>
                  </li>
                  
                  <li className="flex gap-3">
                    <div className="bg-blue-100 rounded-full h-8 w-8 flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Patient Management</h3>
                      <p className="text-gray-600">Comprehensive patient records, history tracking, and secure HIPAA-compliant data storage.</p>
                    </div>
                  </li>
                  
                  <li className="flex gap-3">
                    <div className="bg-blue-100 rounded-full h-8 w-8 flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">White-Label Solution</h3>
                      <p className="text-gray-600">Customize the platform with your branding, logos, and color schemes for a seamless client experience.</p>
                    </div>
                  </li>
                  
                  <li className="flex gap-3">
                    <div className="bg-blue-100 rounded-full h-8 w-8 flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Mobile Optimization</h3>
                      <p className="text-gray-600">Fully responsive mobile interface designed for phlebotomists in the field with offline capabilities.</p>
                    </div>
                  </li>
                </ul>
              </div>
              
              <div>
                <img 
                  src="/lovable-uploads/0f0fa3b3-9148-4ed7-994a-6b3b9f6071c6.png" 
                  alt="Mobile phlebotomist using ConveLabs software platform" 
                  className="rounded-lg shadow-lg w-full h-auto"
                />
              </div>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6 mb-16">
              <Card className="bg-white shadow-md hover:shadow-lg transition-shadow">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">For Independent Phlebotomists</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">Perfect for mobile phlebotomists working independently who need an all-in-one software solution to manage appointments, patients, and records.</p>
                  <ul className="space-y-2 mb-4">
                    <li className="flex items-center">
                      <svg className="h-4 w-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Simple online booking
                    </li>
                    <li className="flex items-center">
                      <svg className="h-4 w-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Digital record keeping
                    </li>
                    <li className="flex items-center">
                      <svg className="h-4 w-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Payment processing
                    </li>
                  </ul>
                  <p className="font-semibold">Starting at $49/month</p>
                </CardContent>
              </Card>
              
              <Card className="bg-white shadow-md hover:shadow-lg transition-shadow border-blue-200 border-2">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">For Small Practices</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">Designed for small healthcare practices that offer mobile phlebotomy as part of their services with team management tools.</p>
                  <ul className="space-y-2 mb-4">
                    <li className="flex items-center">
                      <svg className="h-4 w-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Team management
                    </li>
                    <li className="flex items-center">
                      <svg className="h-4 w-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Lab integrations
                    </li>
                    <li className="flex items-center">
                      <svg className="h-4 w-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Client portal
                    </li>
                  </ul>
                  <p className="font-semibold">Starting at $149/month</p>
                </CardContent>
              </Card>
              
              <Card className="bg-white shadow-md hover:shadow-lg transition-shadow">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">For Large Organizations</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">Enterprise-level solution for healthcare organizations with multiple teams and complex routing needs.</p>
                  <ul className="space-y-2 mb-4">
                    <li className="flex items-center">
                      <svg className="h-4 w-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Advanced analytics
                    </li>
                    <li className="flex items-center">
                      <svg className="h-4 w-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      API access
                    </li>
                    <li className="flex items-center">
                      <svg className="h-4 w-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Custom integrations
                    </li>
                  </ul>
                  <p className="font-semibold">Starting at $499/month</p>
                </CardContent>
              </Card>
            </div>
            
            <div className="bg-white rounded-xl shadow-lg p-8 mb-16">
              <div className="text-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold">Ready to Transform Your Mobile Phlebotomy Business?</h2>
                <p className="text-lg text-gray-600 mt-2">Sign up for our phlebotomy software platform and streamline your operations today.</p>
              </div>
              
              <PhlebotomistSignupForm />
            </div>
            
            <div className="bg-gray-100 rounded-xl p-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold">Frequently Asked Questions About Our Phlebotomy Software</h2>
              </div>
              
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-semibold mb-2">How quickly can I get started with your phlebotomy software?</h3>
                  <p className="text-gray-600">After signing up, you can be up and running within 24 hours. Our onboarding team will help you set up your account and customize the software to your needs.</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">Is the platform HIPAA compliant?</h3>
                  <p className="text-gray-600">Yes, our platform is fully HIPAA compliant with end-to-end encryption for all patient data and proper security protocols in place.</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">Can I integrate with my existing systems?</h3>
                  <p className="text-gray-600">Yes, we offer API access and integrations with common lab information systems, EHRs, and billing platforms.</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">What support do you offer?</h3>
                  <p className="text-gray-600">We provide 24/7 technical support, regular training sessions, and a dedicated account manager for enterprise clients.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </>
  );
};

export default PhlebotomistSignup;
