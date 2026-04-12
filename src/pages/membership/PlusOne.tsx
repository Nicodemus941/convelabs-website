
import React from 'react';
import { MembershipLayout } from '@/components/membership/MembershipLayout';

const PlusOneMembership: React.FC = () => {
  return (
    <MembershipLayout
      title="Individual +1"
      description="Our Individual +1 Membership plan provides premium lab services for you and a partner, with dedicated support and flexible scheduling."
      video={{
        id: "dQw4w9WgXcQ",
        title: "Individual +1 Membership",
        description: "Learn more about our Individual +1 membership plan"
      }}
      features={[
        { text: '8 lab visits per year (4 per person)' },
        { text: 'Full lab results dashboard for both members' },
        { text: 'No travel fees within service area' },
        { text: 'Priority scheduling' },
        { text: 'Bring a spouse, partner, or family member' },
        { text: 'All basic lab tests included' }
      ]}
      idealFor={[
        { text: 'Couples focused on joint health goals' },
        { text: 'Partners who want to track health metrics together' },
        { text: 'Families with one child who needs regular testing' },
        { text: 'Parent/child combinations' },
        { text: 'Roommates or friends who want to share a membership' }
      ]}
      testimonial={{
        quote: "My wife and I both need regular monitoring, and the Individual +1 plan has been perfect. We save money and time, plus we get to track our progress together!",
        author: "Michael & Sarah T.",
        role: "Orlando, FL"
      }}
      pricing={{
        monthly: 50,
        quarterly: 140,
        annual: 499
      }}
      type="plus-one"
      benefits={[]}
    />
  );
};

export default PlusOneMembership;
