
import React from "react";
import { Check, ArrowRight } from "lucide-react";
import { withSource, ENROLLMENT_URL } from '@/lib/constants/urls';

const MembershipSection = () => {
  const benefits = [
    "Priority scheduling 7 days a week, 6 AM - 1:30 PM",
    "TRT and hormone monitoring protocols",
    "Same-day scheduling available",
    "Dedicated phlebotomist (Concierge Elite)",
    "Practice Partner program for physicians",
    "Private results portal with mobile access"
  ];
  
  const handleRedirectToMembership = () => {
    window.location.href = withSource(ENROLLMENT_URL, 'membership_section');
  };

  return (
    <section id="membership" className="py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Membership Plans Starting at $499/year</h2>
            <p className="text-lg text-gray-700 mb-8">
              Save up to $25/visit vs our $150 non-member rate. Choose from 4 tiers designed for individuals, executives, VIPs, and medical practices.
            </p>
            
            <div className="mb-10 space-y-4">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-center">
                  <div className="flex-shrink-0 w-6 h-6 bg-conve-red/10 rounded-full flex items-center justify-center mr-3">
                    <Check className="h-4 w-4 text-conve-red" />
                  </div>
                  <span className="text-gray-800">{benefit}</span>
                </div>
              ))}
            </div>
            
            <button 
              onClick={handleRedirectToMembership}
              className="luxury-button py-3 px-8 inline-flex items-center"
            >
              View All Plans <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </div>
          
          <div className="order-1 md:order-2">
            <div className="luxury-card p-8 border border-gray-100 shadow-lg bg-white">
              <div className="mb-6 px-4 py-2 bg-green-600/10 text-green-600 rounded-md inline-block font-medium">
                Most Economical
              </div>
              <h3 className="text-2xl font-bold mb-2">Health Starter</h3>
              <div className="flex items-baseline mb-6">
                <span className="text-4xl font-bold">$499</span>
                <span className="text-gray-600 ml-1">/year</span>
              </div>
              <p className="text-gray-700 mb-6">4 visits at $125/visit — save $25/visit vs the $150 non-member rate.</p>
              
              <div className="space-y-3 mb-8">
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-green-600 mr-3 mt-0.5" />
                  <span>4 lab visits per year</span>
                </div>
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-green-600 mr-3 mt-0.5" />
                  <span>At-home or in-office visits</span>
                </div>
                <div className="flex items-start">
                  <Check className="h-5 w-5 text-green-600 mr-3 mt-0.5" />
                  <span>7-day scheduling: Mon-Sun, 6 AM - 1:30 PM</span>
                </div>
              </div>
              
              <div className="text-center text-sm mb-6">
                <p>Other plans available:</p>
                <div className="font-medium">
                  <span className="text-conve-gold">$149</span>/month (Proactive Health) | 
                  <span className="text-conve-gold"> $299</span>/month (Concierge Elite)
                </div>
              </div>
              
              <button 
                onClick={handleRedirectToMembership} 
                className="luxury-button w-full text-center block py-3"
              >
                See All Plans
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default MembershipSection;
