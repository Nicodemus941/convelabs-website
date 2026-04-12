
import React from "react";
import { MembershipLayout } from "@/components/membership/MembershipLayout";
import { VideoSection } from "@/components/ui/video-section";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const ConciergeDoctorMembershipPage: React.FC = () => {
  return (
    <MembershipLayout
      title="Concierge Doctor"
      description="Enhance your concierge practice with our white-glove lab services, providing your patients with convenient testing and you with streamlined results management."
      video={{
        id: "k5hGjy2E1fs", 
        title: "Concierge Doctor Membership",
        description: "Learn more about our Concierge Doctor membership plan"
      }}
      features={[
        { text: "12 lab services per patient annually" },
        { text: "Patient management dashboard" },
        { text: "Customizable lab panels" },
        { text: "Direct integration with EMR systems" },
        { text: "At-home or in-office appointments for patients" },
        { text: "Same-day appointments (when available)" },
        { text: "Dedicated practice coordinator" },
        { text: "Branded patient experience" },
        { text: "White-labeled results portal" },
        { text: "Priority scheduling for all patients" },
        { text: "Weekend appointment options" },
        { text: "CSV upload for bulk patient management" }
      ]}
      idealFor={[
        { text: "Private practice physicians" },
        { text: "Concierge medical practices" },
        { text: "Direct primary care providers" },
        { text: "Functional medicine practitioners" },
        { text: "Integrative health providers" },
        { text: "Boutique medical practices" }
      ]}
      testimonial={{
        quote: "My patients love the convenience, and I love the seamless integration with my practice. Lab results are delivered promptly, and the service truly aligns with the premium experience I promise my patients.",
        author: "Dr. Andrew M., MD",
        role: "Concierge Physician"
      }}
      pricing={{
        monthly: 80,
        quarterly: "Quarterly billing available",
        annual: "Annual billing available"
      }}
      type="concierge-doctor"
      benefits={[]}
    >
      <div className="text-center mt-12">
        <Button size="lg" className="bg-conve-red" asChild>
          <Link to="/concierge-doctor-signup">Enroll Now</Link>
        </Button>
      </div>
    </MembershipLayout>
  );
};

export default ConciergeDoctorMembershipPage;
