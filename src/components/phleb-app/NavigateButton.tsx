import React from 'react';
import { Button } from '@/components/ui/button';
import { Navigation } from 'lucide-react';
import { openInMaps } from '@/lib/openInMaps';

interface NavigateButtonProps {
  address: string;
}

const NavigateButton: React.FC<NavigateButtonProps> = ({ address }) => {
  const handleNavigate = () => {
    // Centralized OS-aware deep link: iOS → Apple Maps, Android → default
    // geo: handler (Google Maps / Waze / Maps.me), else web Google Maps.
    openInMaps({ kind: 'address', address });
  };

  return (
    <Button onClick={handleNavigate} variant="outline" size="sm" className="gap-2">
      <Navigation className="h-4 w-4" />
      Navigate
    </Button>
  );
};

export default NavigateButton;
