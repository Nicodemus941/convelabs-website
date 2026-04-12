
import React from "react";
import { MembershipLayout } from "@/components/membership/MembershipLayout";

const IndividualMembershipPage: React.FC = () => {
  return (
    <MembershipLayout
      title="Individual"
      description="Our Individual Membership plan provides premium lab services tailored to your personal health needs, with dedicated support and flexible scheduling."
      video={{
        id: "vp0Gd629Keo",
        title: "Individual Membership",
        description: "Learn more about our Individual membership plan"
      }}
      features={[
        { text: "5 service credits per month" },
        { text: "Credits roll over for up to 3 months" },
        { text: "At-home or in-office appointments" },
        { text: "Same-day appointments (when available)" },
        { text: "Concierge handling of lab results" },
        { text: "Member-only lab test store" },
        { text: "Priority scheduling" },
        { text: "Digital result tracking" },
        { text: "Exclusive access to add-on services" }
      ]}
      idealFor={[
        { text: "Busy professionals with limited time" },
        { text: "Athletes monitoring performance metrics" },
        { text: "Wellness-focused individuals" },
        { text: "Executive health program participants" },
        { text: "Those who value privacy and convenience" },
        { text: "People with regular health monitoring needs" }
      ]}
      testimonial={{
        quote: "The Individual Membership has transformed how I manage my health. No more waiting rooms or rushed appointments - ConveLabs comes to me on my schedule.",
        author: "Michael R.",
        role: "Executive & Individual Member"
      }}
      pricing={{
        monthly: 99,
        quarterly: 282,
        annual: 1068
      }}
      type="individual"
      benefits={[]}
    />
  );
};

export default IndividualMembershipPage;
