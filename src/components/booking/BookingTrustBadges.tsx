import React from 'react';
import { Shield, Award, Lock, Users } from 'lucide-react';
import { COLLECTIONS_COUNT } from '@/content/trustClaims';

const BADGES = [
  { icon: Shield, label: 'HIPAA Compliant' },
  { icon: Award, label: 'Licensed Phlebotomists' },
  { icon: Lock, label: 'Secure Checkout' },
  { icon: Users, label: `${COLLECTIONS_COUNT}+ Collections` },
];

const BookingTrustBadges: React.FC = () => {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 py-3">
      {BADGES.map((badge) => {
        const Icon = badge.icon;
        return (
          <div key={badge.label} className="flex items-center gap-1.5 text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">{badge.label}</span>
          </div>
        );
      })}
    </div>
  );
};

export default BookingTrustBadges;
