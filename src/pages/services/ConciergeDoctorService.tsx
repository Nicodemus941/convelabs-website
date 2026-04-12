
import React from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/home/Header";
import Footer from "@/components/home/Footer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Stethoscope, Users, Clock, Star } from "lucide-react";
import { Link } from "react-router-dom";

const ConciergeDoctorServicePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Concierge Doctor Support Services | ConveLabs | Medical Practice Enhancement</title>
        <meta 
          name="description" 
          content="Elevate your concierge medical practice with ConveLabs dedicated support services. Enhance patient care by offering premium mobile phlebotomy, seamless result management, and white-glove laboratory services." 
        />
        <meta name="keywords" content="concierge physician services, concierge doctor laboratory support, boutique practice enhancement, VIP patient services, mobile phlebotomy for doctors, doctor-patient relationship, ConveLabs" />
        <link rel="canonical" href="https://convelabs.com/services/concierge-doctor" />
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
              <h1 className="text-4xl md:text-5xl font-bold mb-6">Concierge Doctor Support</h1>
              <p className="text-xl text-gray-600 mb-8">
                Special programs for concierge physicians to enhance the care they provide to their patients.
              </p>
              <Button asChild size="lg" className="mt-4">
                <Link to="/concierge-doctor-calculator">Calculate Your Practice Benefits</Link>
              </Button>
            </div>
          </div>
        </section>
        
        {/* Pain Points Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold mb-6">Challenges for Concierge Medical Practices</h2>
              <div className="grid md:grid-cols-2 gap-8 mb-12">
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Limited Service Offerings</h3>
                  <p>Many concierge practices struggle to provide the comprehensive services patients expect, particularly mobile lab work that aligns with their premium care model.</p>
                </div>
                
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Patient Experience Inconsistency</h3>
                  <p>While the office experience may be exceptional, patients still face traditional hassles with laboratory services, creating a disconnect in the overall care experience.</p>
                </div>
                
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Resource Constraints</h3>
                  <p>Building an in-house phlebotomy team with proper licensing, training, and equipment is prohibitively expensive for most practices.</p>
                </div>
                
                <div className="bg-red-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-xl font-semibold mb-3">Result Management Complexity</h3>
                  <p>Managing lab orders, tracking specimens, and coordinating results across multiple patients and laboratories creates administrative burden.</p>
                </div>
              </div>
              
              <h2 className="text-3xl font-bold mb-6">The ConveLabs Solution</h2>
              <div className="space-y-6 mb-12">
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <Stethoscope className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Seamless Practice Integration</h3>
                    <p>We function as an extension of your practice, providing white-labeled mobile phlebotomy services that maintain your brand standards and quality of care. Our team integrates with your scheduling system and communicates using your preferred protocols.</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <Users className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Enhanced Patient Experience</h3>
                    <p>Offer patients the luxury of at-home or in-office blood draws without the need to visit laboratories. This premium service strengthens patient satisfaction and retention while differentiating your practice from competitors.</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <Clock className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Operational Efficiency</h3>
                    <p>Eliminate the administrative burden of coordinating lab services. Our system manages scheduling, specimen tracking, and result delivery, allowing your staff to focus on direct patient care.</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="mt-1 bg-green-100 p-1 rounded-full mr-4">
                    <Star className="h-5 w-5 text-green-700" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Practice Revenue Enhancement</h3>
                    <p>Choose between our cost-effective partnership models that can either serve as a practice expense or create a new revenue stream through patient billing. Our calculator helps you determine the most advantageous approach for your practice.</p>
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
              <h2 className="text-3xl font-bold mb-10">How Our Partnership Works</h2>
              
              <div className="relative">
                <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-200 transform -translate-x-1/2"></div>
                
                <div className="relative z-10 grid md:grid-cols-2 gap-8 text-left mb-12">
                  <div className="md:text-right md:pr-12">
                    <div className="hidden md:block absolute right-0 top-4 w-4 h-4 rounded-full bg-conve-red transform translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Initial Practice Assessment</h3>
                    <p>We analyze your patient demographics, service needs, and practice goals to design a customized program.</p>
                  </div>
                  <div></div>
                  
                  <div></div>
                  <div className="md:pl-12">
                    <div className="hidden md:block absolute left-0 top-4 w-4 h-4 rounded-full bg-conve-red transform -translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Integration Setup</h3>
                    <p>Our team configures scheduling, communication, and result reporting systems to work seamlessly with your practice management tools.</p>
                  </div>
                  
                  <div className="md:text-right md:pr-12">
                    <div className="hidden md:block absolute right-0 top-4 w-4 h-4 rounded-full bg-conve-red transform translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Staff Training</h3>
                    <p>We provide comprehensive training to your team on ordering procedures, patient preparation instructions, and result access.</p>
                  </div>
                  <div></div>
                  
                  <div></div>
                  <div className="md:pl-12">
                    <div className="hidden md:block absolute left-0 top-4 w-4 h-4 rounded-full bg-conve-red transform -translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Service Launch</h3>
                    <p>Begin offering premium lab services to your patients with full support from our dedicated concierge physician liaison.</p>
                  </div>
                  
                  <div className="md:text-right md:pr-12">
                    <div className="hidden md:block absolute right-0 top-4 w-4 h-4 rounded-full bg-conve-red transform translate-x-2"></div>
                    <h3 className="text-xl font-semibold mb-2">Ongoing Management</h3>
                    <p>Regular performance reviews, quality assurance, and service optimizations ensure continued excellence and patient satisfaction.</p>
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
              <h2 className="text-3xl font-bold mb-10 text-center">What Partner Physicians Say</h2>
              
              <div className="bg-white border border-gray-100 rounded-lg p-8 shadow-sm mb-8">
                <p className="italic mb-4 text-lg">
                  "Integrating ConveLabs into our concierge practice was transformative. Our patients routinely mention how much they appreciate avoiding laboratory visits, and our practice staff has been freed from the burden of coordinating lab services. The attention to detail and quality of phlebotomy work matches our standards perfectly."
                </p>
                <div className="flex justify-end">
                  <p className="font-semibold">— Dr. Andrew C., Concierge Physician, Winter Park</p>
                </div>
              </div>
              
              <div className="bg-white border border-gray-100 rounded-lg p-8 shadow-sm">
                <p className="italic mb-4 text-lg">
                  "As a boutique medical practice catering to executives, we needed a laboratory solution that matched our premium care model. ConveLabs allows us to offer truly VIP service from start to finish. The revenue sharing model has also added a meaningful income stream to our practice while enhancing patient satisfaction."
                </p>
                <div className="flex justify-end">
                  <p className="font-semibold">— Dr. Michelle L., Internal Medicine, Lake Mary</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        {/* Benefits Calculator Promo */}
        <section className="py-16 bg-white">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-6">Calculate Your Practice Benefits</h2>
              <p className="text-lg mb-8">
                Our interactive calculator helps you determine the potential financial and operational benefits of partnering with ConveLabs. Enter your practice details to see customized projections.
              </p>
              <div className="flex justify-center">
                <Button size="lg" asChild className="font-semibold">
                  <Link to="/concierge-doctor-calculator">Try Our Calculator</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
        
        {/* CTA Section */}
        <section className="py-16 bg-conve-red text-white">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-6">Elevate Your Concierge Practice</h2>
              <p className="text-xl mb-8">
                Partner with ConveLabs to provide truly comprehensive care that meets the expectations of your most discerning patients.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Button 
                  variant="outline" 
                  size="lg"
                  className="bg-white text-conve-red hover:bg-gray-100 border-white"
                  asChild
                >
                  <Link to="/pricing">View Partnership Options</Link>
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
                  <h3 className="text-xl font-semibold mb-2">How are partnership costs structured?</h3>
                  <p>We offer flexible models including per-service pricing, monthly retainers, and revenue-sharing arrangements. During our consultation, we'll help determine which approach best suits your practice size, patient volume, and business goals.</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-xl font-semibold mb-2">Can we white-label the service under our practice name?</h3>
                  <p>Yes, our concierge physician partnerships are designed to appear as a seamless extension of your practice. Phlebotomists can wear your practice-branded attire, use your scheduling systems, and maintain communication protocols that align with your standards.</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-xl font-semibold mb-2">What is your typical response time for urgent lab requests?</h3>
                  <p>For partner practices, we maintain dedicated capacity for same-day urgent requests. Most STAT orders can be accommodated within 2-4 hours during business hours, and we offer priority weekend service for genuine emergencies.</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-xl font-semibold mb-2">Can you work with specific laboratories preferred by our practice?</h3>
                  <p>Absolutely. We work with all major reference laboratories and can adapt to your preferred lab relationships. We also maintain relationships with specialty labs for unique testing needs.</p>
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

export default ConciergeDoctorServicePage;
