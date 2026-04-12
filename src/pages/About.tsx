
import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const AboutPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>About Us | ConveLabs | Central Florida's Premier Mobile Phlebotomy Service</title>
        <meta 
          name="description" 
          content="Founded in 2012 by Nicodemme Jean-Baptiste, ConveLabs has been providing exceptional mobile phlebotomy services to Central Florida for over a decade. From celebrities to professional athletes, we've served them all." 
        />
        <meta name="keywords" content="ConveLabs history, Nicodemme Jean-Baptiste, mobile phlebotomy Orlando, VIP lab testing Florida, healthcare services Tampa, Central Florida blood testing" />
        <link rel="canonical" href="https://convelabs.com/about" />
      </Helmet>
      
      <Header />
      
      <main>
        {/* Hero Section */}
        <section className="py-20 bg-gray-50">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl font-bold mb-4">Our Story</h1>
              <p className="text-xl text-gray-600 mb-8">
                A decade of excellence in mobile healthcare services across Florida
              </p>
              <div className="mx-auto h-1 w-20 bg-conve-red my-8"></div>
              <p className="text-lg mb-8">
                ConveLabs was founded in 2012 when Nicodemme Jean-Baptiste launched the company in Bradenton/Sarasota, Florida. 
                In 2014, we relocated our headquarters to Orlando, Florida, expanding our service area throughout Central Florida. 
                Over the years, we've built an impressive clientele, serving celebrities, high-level executives, professional athletes, 
                professional sports teams, and high-profile government officials. Our commitment to discretion, professionalism, and 
                exceptional service has made us the preferred mobile phlebotomy provider for those who value convenience and quality.
              </p>
            </div>
          </div>
        </section>
        
        {/* Mission & Vision */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-12">
              <div>
                <h2 className="text-3xl font-bold mb-4">Our Mission</h2>
                <div className="h-1 w-20 bg-conve-red mb-6"></div>
                <p className="text-lg text-gray-700 mb-6">
                  To make healthcare more accessible by bringing professional lab services directly to patients 
                  in their homes and offices throughout Central Florida.
                </p>
                <p className="text-gray-600">
                  We believe that healthcare should be patient-centered, convenient, and stress-free. 
                  By eliminating the need to visit physical locations for routine lab work, 
                  we're helping patients save time while reducing anxiety around medical procedures.
                </p>
              </div>
              
              <div>
                <h2 className="text-3xl font-bold mb-4">Our Vision</h2>
                <div className="h-1 w-20 bg-conve-red mb-6"></div>
                <p className="text-lg text-gray-700 mb-6">
                  To become the most trusted mobile phlebotomy service in Florida, known for exceptional 
                  service quality, professional expertise, and patient satisfaction.
                </p>
                <p className="text-gray-600">
                  We envision a healthcare ecosystem where laboratory testing is seamlessly integrated 
                  into patients' lives, with convenient options that respect their time and comfort while 
                  maintaining the highest clinical standards.
                </p>
              </div>
            </div>
          </div>
        </section>
        
        {/* Core Values */}
        <section className="py-16 bg-gray-50">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Our Core Values</h2>
              <p className="text-lg text-gray-600">
                The principles that guide everything we do
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              <Card className="text-center">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-conve-red" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold mb-3">Patient-Centered Care</h3>
                  <p className="text-gray-600">
                    We put patients first, designing our entire service around their comfort,
                    convenience, and unique healthcare needs.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="text-center">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-conve-red" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold mb-3">Clinical Excellence</h3>
                  <p className="text-gray-600">
                    We maintain the highest standards of quality, safety, and professionalism in
                    every interaction and procedure we perform.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="text-center">
                <CardContent className="p-6">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-conve-red" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold mb-3">Innovation</h3>
                  <p className="text-gray-600">
                    We continuously seek better ways to deliver our services, embracing technology
                    and creative solutions to improve the patient experience.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
        
        {/* CTA */}
        <section className="py-16 bg-conve-red text-white text-center">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold mb-4 text-white">Join the ConveLabs Family</h2>
              <p className="text-xl mb-8 text-white">
                Experience the convenience of at-home lab testing throughout Central Florida.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Button 
                  variant="outline" 
                  className="bg-white text-conve-red hover:bg-gray-100 border-white"
                  asChild
                >
                  <a href="/pricing">View Our Plans</a>
                </Button>
                <Button 
                  variant="outline"
                  className="border-white text-conve-red hover:bg-white hover:text-conve-red"
                  asChild
                >
                  <a href="/contact">Contact Us</a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default AboutPage;
