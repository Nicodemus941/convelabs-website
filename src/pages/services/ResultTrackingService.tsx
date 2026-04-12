
import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, FileText, Clock, Shield, ChartBar } from "lucide-react";
import { Link } from "react-router-dom";

const ResultTrackingServicePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Lab Result Tracking Services | ConveLabs | Comprehensive Result Management</title>
        <meta 
          name="description" 
          content="Simplify your healthcare journey with ConveLabs comprehensive lab result tracking. We manage the entire process from collection to secure delivery of results to your patient portal." 
        />
        <meta name="keywords" content="lab result tracking, medical result management, patient portal integration, secure lab results, healthcare data management, ConveLabs" />
        <link rel="canonical" href="https://convelabs.com/services/result-tracking" />
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
              <h1 className="text-4xl md:text-5xl font-bold mb-6">Lab Result Tracking Services</h1>
              <p className="text-xl text-gray-600 mb-8">
                We manage the entire process, ensuring your results are delivered promptly to your patient portal.
              </p>
              <Button asChild size="lg" className="mt-4">
                <Link to="/signup">Get Started with Result Tracking</Link>
              </Button>
            </div>
          </div>
        </section>
        
        {/* Pain Points Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold mb-6">Common Result Management Challenges</h2>
              <div className="grid md:grid-cols-2 gap-8 mb-12">
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Missing or Delayed Results</h3>
                  <p>Many patients experience frustration when lab results are delayed, misplaced, or never received, leading to unnecessary follow-up calls and appointment delays.</p>
                </div>
                
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Difficulty Accessing Historical Data</h3>
                  <p>Without a centralized system, tracking health trends over time becomes nearly impossible as results are scattered across different provider portals and paper records.</p>
                </div>
                
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Confusion Over Result Meaning</h3>
                  <p>Standard lab reports can be difficult to interpret without context, leaving patients uncertain about the significance of their results.</p>
                </div>
                
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Security Concerns</h3>
                  <p>Sensitive health information sent via unsecured methods like email or postal mail creates privacy risks that many patients find unacceptable.</p>
                </div>
              </div>
              
              <h2 className="text-3xl font-bold mb-6">The ConveLabs Solution</h2>
              <div className="space-y-6 mb-12">
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <FileText className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">End-to-End Result Management</h3>
                    <p>We track your specimens from collection through laboratory processing, ensuring nothing falls through the cracks. Our system confirms receipt at the lab and monitors processing time.</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <ChartBar className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Comprehensive Result History</h3>
                    <p>All your lab results are stored in one secure location, allowing you to track changes over time and spot trends. Download, print, or share results with any provider through our secure portal.</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <Clock className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Prompt Notifications</h3>
                    <p>Receive immediate notifications when results are available, eliminating anxiety-filled waiting periods and enabling faster follow-up with your physician if necessary.</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <Shield className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Military-Grade Security</h3>
                    <p>Our HIPAA-compliant platform uses encryption and secure access protocols to ensure your health data remains private and protected at all times.</p>
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
              <h2 className="text-3xl font-bold mb-10">How Our Result Tracking Works</h2>
              
              <div className="relative">
                <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-200 transform -translate-x-1/2"></div>
                
                <div className="relative z-10 grid md:grid-cols-2 gap-8 text-left mb-12">
                  <div className="md:text-right md:pr-12">
                    <div className="hidden md:block absolute right-0 top-4 w-4 h-4 rounded-full bg-conve-red transform translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Specimen Collection</h3>
                    <p>Upon collection, your specimen is labeled with a unique identifier and entered into our tracking system.</p>
                  </div>
                  <div></div>
                  
                  <div></div>
                  <div className="md:pl-12">
                    <div className="hidden md:block absolute left-0 top-4 w-4 h-4 rounded-full bg-conve-red transform -translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Laboratory Delivery</h3>
                    <p>We confirm delivery to the appropriate laboratory and record receipt in our system.</p>
                  </div>
                  
                  <div className="md:text-right md:pr-12">
                    <div className="hidden md:block absolute right-0 top-4 w-4 h-4 rounded-full bg-conve-red transform translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Processing Monitoring</h3>
                    <p>Our system automatically checks for processing status and expected completion times.</p>
                  </div>
                  <div></div>
                  
                  <div></div>
                  <div className="md:pl-12">
                    <div className="hidden md:block absolute left-0 top-4 w-4 h-4 rounded-full bg-conve-red transform -translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Result Delivery</h3>
                    <p>Upon completion, results are securely transferred to your patient portal and your physician's office.</p>
                  </div>
                  
                  <div className="md:text-right md:pr-12">
                    <div className="hidden md:block absolute right-0 top-4 w-4 h-4 rounded-full bg-conve-red transform translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Notification & Storage</h3>
                    <p>You receive an immediate notification that results are available, and they are permanently stored in your secure account history.</p>
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
              <h2 className="text-3xl font-bold mb-10 text-center">What Our Members Say</h2>
              
              <div className="bg-white border border-gray-100 rounded-lg p-8 shadow-sm mb-8">
                <p className="italic mb-4 text-lg">
                  "As someone who monitors my thyroid levels quarterly, ConveLabs' result tracking has been invaluable. I can see trends over time in an easy-to-understand format, and I always know exactly when my results are ready. No more calling the doctor's office repeatedly to check on status."
                </p>
                <div className="flex justify-end">
                  <p className="font-semibold">— Elizabeth K., ConveLabs Member</p>
                </div>
              </div>
              
              <div className="bg-white border border-gray-100 rounded-lg p-8 shadow-sm">
                <p className="italic mb-4 text-lg">
                  "The security of knowing my sensitive health information is properly protected gives me peace of mind. Plus, having all my lab history in one place has been incredibly helpful when changing specialists and needing to share my complete medical history."
                </p>
                <div className="flex justify-end">
                  <p className="font-semibold">— James T., Executive Member</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        {/* CTA Section */}
        <section className="py-16 bg-conve-red text-white">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-6">Take Control of Your Health Data</h2>
              <p className="text-xl mb-8">
                Join ConveLabs today for seamless result management and enhanced health monitoring.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Button 
                  variant="outline" 
                  size="lg"
                  className="bg-white text-conve-red hover:bg-gray-100 border-white"
                  asChild
                >
                  <Link to="/pricing">View Membership Plans</Link>
                </Button>
                <Button 
                  variant="outline"
                  size="lg"
                  className="border-white hover:bg-white hover:text-conve-red"
                  asChild
                >
                  <Link to="/signup">Join Now</Link>
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
                  <h3 className="text-xl font-semibold mb-2">How quickly will I receive my results?</h3>
                  <p>You'll receive results as soon as they are available from the laboratory, typically within 24-48 hours for routine tests. Some specialized tests may take longer, but our tracking system keeps you updated on expected timeframes.</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-xl font-semibold mb-2">Can I share my results with doctors outside the ConveLabs network?</h3>
                  <p>Absolutely. You can securely share your results with any healthcare provider through our portal. You can generate secure links, download PDF reports, or grant temporary access to specific providers.</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-xl font-semibold mb-2">How far back can I access my lab history?</h3>
                  <p>All results from the moment you join ConveLabs are permanently stored and accessible. If you have previous lab work you'd like to include in your history, we also offer a service to import and digitize historical records.</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-xl font-semibold mb-2">What happens if there's an issue with my specimen or results?</h3>
                  <p>Our tracking system identifies issues early. If there's any problem with specimen quality, processing delays, or other issues, you'll be notified immediately, and our team will coordinate with the laboratory and your physician to resolve the situation.</p>
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

export default ResultTrackingServicePage;
