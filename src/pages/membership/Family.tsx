
import React from "react";
import { MembershipLayout } from "@/components/membership/MembershipLayout";

const FamilyMembershipPage: React.FC = () => {
  return (
    <MembershipLayout
      title="Concierge Elite"
      description="White-glove, unlimited mobile phlebotomy for celebrities, executives, and high-net-worth individuals who demand complete privacy and dedicated service."
      video={{
        id: "sc_BYydPz04",
        title: "Concierge Elite Membership",
        description: "Learn more about our Concierge Elite membership plan"
      }}
      features={[
        { text: "Unlimited lab visits" },
        { text: "Dedicated phlebotomist assigned to you" },
        { text: "NDA available upon request" },
        { text: "Hotel, office, and home visits" },
        { text: "White-glove concierge service" },
        { text: "Priority scheduling guaranteed" },
        { text: "7-day scheduling: Mon-Sun, 6 AM - 1:30 PM" },
        { text: "Same-day appointments available" },
        { text: "Health insights dashboard" },
        { text: "Complete privacy and confidentiality" }
      ]}
      idealFor={[
        { text: "Celebrities and public figures" },
        { text: "C-suite executives" },
        { text: "High-net-worth individuals" },
        { text: "Professional athletes" },
        { text: "Anyone requiring NDA-level privacy" },
        { text: "Frequent travelers needing flexible scheduling" }
      ]}
      testimonial={{
        quote: "Having a dedicated phlebotomist who knows my schedule and comes to my hotel suite has been invaluable. The NDA gives me complete peace of mind.",
        author: "Client R.",
        role: "Concierge Elite Member"
      }}
      pricing={{
        monthly: 299,
        quarterly: 897,
        annual: 2999
      }}
      type="family"
      benefits={[]}
    />
  );
};

export default FamilyMembershipPage;
