import React from 'react';
import { Button } from '@/components/ui/button';
import { Navigation } from 'lucide-react';

interface NavigateButtonProps {
  address: string;
}

const NavigateButton: React.FC<NavigateButtonProps> = ({ address }) => {
  const handleNavigate = () => {
    const encoded = encodeURIComponent(address);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOS) {
      window.open(`maps://maps.apple.com/?daddr=${encoded}`, '_blank');
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
    }
  };

  return (
    <Button onClick={handleNavigate} variant="outline" size="sm" className="gap-2">
      <Navigation className="h-4 w-4" />
      Navigate
    </Button>
  );
};

export default NavigateButton;
