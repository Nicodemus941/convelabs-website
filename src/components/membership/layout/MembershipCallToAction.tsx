
import React from "react";
import { Button } from "@/components/ui/button";
import { ENROLLMENT_URL, withSource } from "@/lib/constants/urls";


interface MembershipCallToActionProps {
  title: string;
}

export const MembershipCallToAction: React.FC<MembershipCallToActionProps> = ({ title }) => {
  const handleBookClick = () => {
    window.location.href = withSource(ENROLLMENT_URL, 'membership_cta');
  };
  
  return (
    <>
      <section className="py-16 bg-gradient-to-b from-conve-red/5 to-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Upgrade Your Lab Experience?</h2>
          <p className="text-xl text-gray-700 mb-8 max-w-2xl mx-auto">
            Join our {title} Membership today and experience lab services redefined.
          </p>
          
          <Button size="lg" onClick={handleBookClick} className="text-lg px-8 py-6 h-auto">
            Become a Member
          </Button>
        </div>
      </section>
    </>
  );
};
