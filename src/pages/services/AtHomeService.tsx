
import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, User, Home, Clock, Shield } from "lucide-react";
import { Link } from "react-router-dom";

const AtHomeServicePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>At-Home Blood Draw Services | ConveLabs | Professional Mobile Phlebotomy</title>
        <meta 
          name="description" 
          content="Experience the convenience of professional at-home blood draw services with ConveLabs. Skip the waiting rooms and have certified phlebotomists come to your door for a comfortable, private lab experience." 
        />
        <meta name="keywords" content="at-home blood draws, mobile phlebotomy Orlando, at-home lab testing, blood test at home, private blood draw, home medical service, ConveLabs" />
        <link rel="canonical" href="https://convelabs.com/services/at-home" />
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
              <h1 className="text-4xl md:text-5xl font-bold mb-6">At-Home Blood Draw Services</h1>
              <p className="text-xl text-gray-600 mb-8">
                Professional phlebotomists come to your residence, providing ultimate comfort and privacy.
              </p>
              <Button asChild size="lg" className="mt-4">
                <Link to="/signup">Schedule Your At-Home Service</Link>
              </Button>
            </div>
          </div>
        </section>
        
        {/* Pain Points Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold mb-6">Common Challenges with Traditional Lab Visits</h2>
              <div className="grid md:grid-cols-2 gap-8 mb-12">
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Time Wasted in Waiting Rooms</h3>
                  <p>Patients often spend 30-45 minutes in crowded waiting rooms, even with appointments. Add travel time and you've lost hours of your day.</p>
                </div>
                
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Exposure to Sick Patients</h3>
                  <p>Traditional labs serve both well and sick patients, increasing your risk of exposure to contagious illnesses while waiting for routine tests.</p>
                </div>
                
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Scheduling Conflicts</h3>
                  <p>Limited lab hours conflict with work schedules, forcing patients to take time off for basic healthcare needs.</p>
                </div>
                
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Privacy Concerns</h3>
                  <p>Public lab environments lack the privacy many patients desire, especially for sensitive tests or for those who value confidentiality.</p>
                </div>
              </div>
              
              <h2 className="text-3xl font-bold mb-6">The ConveLabs Solution</h2>
              <div className="space-y-6 mb-12">
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <Clock className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Time Efficiency</h3>
                    <p>Our phlebotomists come to your home on your schedule, eliminating travel and waiting room time. Continue your workday or personal activities without disruption.</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <Shield className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Health Protection</h3>
                    <p>Avoid exposure to other patients entirely. Our phlebotomists follow strict sanitation protocols, minimizing any risk of exposure in your own home.</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <User className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Complete Privacy</h3>
                    <p>Experience total confidentiality in your own space. Perfect for high-profile individuals or anyone who values their privacy during healthcare procedures.</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <Home className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Comfort & Reduced Anxiety</h3>
                    <p>Many patients experience needle anxiety or white coat syndrome. Being in familiar surroundings significantly reduces stress and improves the experience.</p>
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
              <h2 className="text-3xl font-bold mb-10">How Our At-Home Service Works</h2>
              
              <div className="relative">
                <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-200 transform -translate-x-1/2"></div>
                
                <div className="relative z-10 grid md:grid-cols-2 gap-8 text-left mb-12">
                  <div className="md:text-right md:pr-12">
                    <div className="hidden md:block absolute right-0 top-4 w-4 h-4 rounded-full bg-conve-red transform translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Schedule Your Appointment</h3>
                    <p>Choose a time and date that works for you through our easy online portal or by phone.</p>
                  </div>
                  <div></div>
                  
                  <div></div>
                  <div className="md:pl-12">
                    <div className="hidden md:block absolute left-0 top-4 w-4 h-4 rounded-full bg-conve-red transform -translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Provide Your Lab Orders</h3>
                    <p>Upload your doctor's lab orders or we can coordinate with your physician to obtain them.</p>
                  </div>
                  
                  <div className="md:text-right md:pr-12">
                    <div className="hidden md:block absolute right-0 top-4 w-4 h-4 rounded-full bg-conve-red transform translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Phlebotomist Arrives</h3>
                    <p>Our certified phlebotomist arrives at your door with all necessary equipment and supplies.</p>
                  </div>
                  <div></div>
                  
                  <div></div>
                  <div className="md:pl-12">
                    <div className="hidden md:block absolute left-0 top-4 w-4 h-4 rounded-full bg-conve-red transform -translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Sample Collection & Processing</h3>
                    <p>Professional blood draw in your comfortable environment, followed by proper handling and delivery to the lab.</p>
                  </div>
                  
                  <div className="md:text-right md:pr-12">
                    <div className="hidden md:block absolute right-0 top-4 w-4 h-4 rounded-full bg-conve-red transform translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Results Delivery</h3>
                    <p>Results are sent to your physician and accessible through your patient portal when available.</p>
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
              <h2 className="text-3xl font-bold mb-10 text-center">What Our Clients Say</h2>
              
              <div className="bg-white border border-gray-100 rounded-lg p-8 shadow-sm mb-8">
                <p className="italic mb-4 text-lg">
                  "Having my blood drawn at home has been life-changing. As someone with a busy schedule, ConveLabs saves me hours each month. Their phlebotomists are true professionals who make the experience comfortable and efficient."
                </p>
                <div className="flex justify-end">
                  <p className="font-semibold">— Michael R., Executive, Winter Park</p>
                </div>
              </div>
              
              <div className="bg-white border border-gray-100 rounded-lg p-8 shadow-sm">
                <p className="italic mb-4 text-lg">
                  "After years of anxiety about needles and medical offices, ConveLabs has transformed how I approach necessary lab work. Being in my own home makes all the difference, and their team is always patient and understanding."
                </p>
                <div className="flex justify-end">
                  <p className="font-semibold">— Sarah T., Orlando</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        {/* CTA Section */}
        <section className="py-16 bg-conve-red text-white">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-6">Experience Premium At-Home Lab Services</h2>
              <p className="text-xl mb-8">
                Join our membership program today and never wait in a lab waiting room again.
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
                  <h3 className="text-xl font-semibold mb-2">Is at-home blood draw as accurate as lab-based testing?</h3>
                  <p>Absolutely. Our at-home collections follow the same clinical protocols used in laboratories. All samples are handled with identical care and precision, ensuring the same level of accuracy.</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-xl font-semibold mb-2">How early can I schedule an appointment?</h3>
                  <p>We offer appointments starting as early as 4:00 AM for fasting labs, and our latest appointments can be scheduled into the evening hours. We work around your schedule.</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-xl font-semibold mb-2">What areas do you service?</h3>
                  <p>We currently serve the entire Central Florida region, including Orlando, Winter Park, Lake Mary, Windermere, and surrounding communities.</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-xl font-semibold mb-2">Do you accept insurance?</h3>
                  <p>Our membership model operates outside traditional insurance. However, the lab processing your specimens typically bills your insurance directly for the analysis portion. Our service covers the collection and transportation.</p>
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

export default AtHomeServicePage;
