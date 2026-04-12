
import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Building, Clock, Users, Shield } from "lucide-react";
import { Link } from "react-router-dom";

const InOfficeServicePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>In-Office Blood Draw Services | ConveLabs | Professional Workplace Phlebotomy</title>
        <meta 
          name="description" 
          content="Elevate your workplace wellness with ConveLabs in-office blood draw services. Keep your team productive by bringing laboratory services directly to your workplace with our discreet, efficient phlebotomists." 
        />
        <meta name="keywords" content="workplace blood draws, corporate wellness program, office phlebotomy service, on-site blood testing, employee health service, workplace lab testing, ConveLabs" />
        <link rel="canonical" href="https://convelabs.com/services/in-office" />
      </Helmet>
      
      <Header />
      
      <main>
        {/* Hero Section */}
        <section className="py-20 bg-gray-50">
          <div className="container mx-auto px-4">
            <Link to="/#services" className="inline-flex items-center text-conve-red hover:text-conve-red/90 mb-6">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Services
            </Link>
            <div className="max-w-4xl mx-auto">
              <h1 className="text-4xl md:text-5xl font-bold mb-6">In-Office Blood Draw Services</h1>
              <p className="text-xl text-gray-600 mb-8">
                Keep your busy schedule on track with discreet and efficient in-office blood draws.
              </p>
              <Button asChild size="lg" className="mt-4">
                <Link to="/signup">Schedule In-Office Service</Link>
              </Button>
            </div>
          </div>
        </section>
        
        {/* Pain Points Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold mb-6">Common Workplace Wellness Challenges</h2>
              <div className="grid md:grid-cols-2 gap-8 mb-12">
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Lost Productivity</h3>
                  <p>Employees typically spend 2-3 hours away from work for a simple blood draw, including travel, waiting, and the procedure itself.</p>
                </div>
                
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Scheduling Complications</h3>
                  <p>Coordinating multiple employees' lab appointments around important meetings and deadlines creates unnecessary management challenges.</p>
                </div>
                
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Wellness Program Participation</h3>
                  <p>Many employees skip important preventative health screenings due to the inconvenience, undermining corporate wellness initiatives.</p>
                </div>
                
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Privacy Concerns</h3>
                  <p>Executive team members and high-profile professionals often avoid necessary lab work due to privacy concerns at public facilities.</p>
                </div>
              </div>
              
              <h2 className="text-3xl font-bold mb-6">The ConveLabs Solution</h2>
              <div className="space-y-6 mb-12">
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <Clock className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Maximum Efficiency</h3>
                    <p>Our phlebotomists set up in a private office or conference room, allowing employees to continue working until their scheduled time slot, minimizing downtime to just 10-15 minutes per employee.</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <Users className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Group Scheduling</h3>
                    <p>We coordinate with your office manager to create an efficient testing schedule that works around important meetings and peak productivity hours.</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <Building className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Corporate Wellness Enhancement</h3>
                    <p>Significantly increase participation in preventative health screenings by removing barriers to access, leading to healthier employees and reduced healthcare costs.</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <Shield className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Executive Privacy</h3>
                    <p>Provide executive team members with the privacy and discretion they need for health maintenance while keeping them productive in the workplace.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        {/* How It Works Section */}
        <section className="py-16 bg-gray-50">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-10">How Our In-Office Service Works</h2>
              
              <div className="relative">
                <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-200 transform -translate-x-1/2"></div>
                
                <div className="relative z-10 grid md:grid-cols-2 gap-8 text-left mb-12">
                  <div className="md:text-right md:pr-12">
                    <div className="hidden md:block absolute right-0 top-4 w-4 h-4 rounded-full bg-conve-red transform translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Initial Consultation</h3>
                    <p>We meet with your office manager to understand your team's needs and schedule constraints.</p>
                  </div>
                  <div></div>
                  
                  <div></div>
                  <div className="md:pl-12">
                    <div className="hidden md:block absolute left-0 top-4 w-4 h-4 rounded-full bg-conve-red transform -translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Scheduling Setup</h3>
                    <p>We create a customized schedule that minimizes disruption to your workplace operations.</p>
                  </div>
                  
                  <div className="md:text-right md:pr-12">
                    <div className="hidden md:block absolute right-0 top-4 w-4 h-4 rounded-full bg-conve-red transform translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Space Preparation</h3>
                    <p>Our team arrives early to set up a professional, private collection station in your designated space.</p>
                  </div>
                  <div></div>
                  
                  <div></div>
                  <div className="md:pl-12">
                    <div className="hidden md:block absolute left-0 top-4 w-4 h-4 rounded-full bg-conve-red transform -translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Efficient Collections</h3>
                    <p>Employees arrive at their scheduled times, with procedures typically taking 10-15 minutes per person.</p>
                  </div>
                  
                  <div className="md:text-right md:pr-12">
                    <div className="hidden md:block absolute right-0 top-4 w-4 h-4 rounded-full bg-conve-red transform translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Proper Sample Handling</h3>
                    <p>Samples are carefully transported to the appropriate laboratory for processing with all necessary documentation.</p>
                  </div>
                  <div></div>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        {/* Testimonials */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold mb-10 text-center">What Our Corporate Clients Say</h2>
              
              <div className="bg-white border border-gray-100 rounded-lg p-8 shadow-sm mb-8">
                <p className="italic mb-4 text-lg">
                  "Having ConveLabs come to our office quarterly has transformed our corporate wellness program. Participation increased by 78% once employees realized they could have their lab work done without leaving the building. Their professionalism and efficiency are exceptional."
                </p>
                <div className="flex justify-end">
                  <p className="font-semibold">— Jennifer L., HR Director, Orlando Financial Firm</p>
                </div>
              </div>
              
              <div className="bg-white border border-gray-100 rounded-lg p-8 shadow-sm">
                <p className="italic mb-4 text-lg">
                  "As a law firm with demanding schedules, ConveLabs has been a game-changer for our team. Their in-office service saves each attorney approximately 2-3 hours per quarter, which translates to significant productivity gains across our practice."
                </p>
                <div className="flex justify-end">
                  <p className="font-semibold">— Robert M., Managing Partner, Winter Park Legal Group</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        {/* CTA Section */}
        <section className="py-16 bg-conve-red text-white">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-6">Enhance Your Corporate Wellness Program</h2>
              <p className="text-xl mb-8">
                Join leading organizations that prioritize both employee health and workplace efficiency.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Button 
                  variant="outline" 
                  size="lg"
                  className="bg-white text-conve-red hover:bg-gray-100 border-white"
                  asChild
                >
                  <Link to="/pricing">View Corporate Plans</Link>
                </Button>
                <Button 
                  variant="outline"
                  size="lg"
                  className="border-white hover:bg-white hover:text-conve-red"
                  asChild
                >
                  <Link to="/contact">Schedule Consultation</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
        
        {/* FAQ Section */}
        <section className="py-16 bg-gray-50">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold mb-10 text-center">Frequently Asked Questions</h2>
              
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-xl font-semibold mb-2">How much space do you need for in-office setup?</h3>
                  <p>We can adapt to your available space. Ideally, a private room (conference room or unused office) of at least 100 sq ft works best, but we've worked in smaller spaces when necessary.</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-xl font-semibold mb-2">How many employees can you process in a day?</h3>
                  <p>With one phlebotomist, we can efficiently process 30-40 employees in a standard workday. For larger organizations, we can bring multiple phlebotomists to scale accordingly.</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-xl font-semibold mb-2">Do employees need individual lab orders?</h3>
                  <p>Yes, each employee needs their own lab order from their physician. For corporate wellness programs, we can work with your designated healthcare provider to streamline this process.</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-xl font-semibold mb-2">How do you handle confidentiality in an office setting?</h3>
                  <p>We maintain strict HIPAA compliance. Individual results are never shared with employers. We set up in private rooms and schedule employees with adequate spacing to ensure privacy during their appointments.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default InOfficeServicePage;
