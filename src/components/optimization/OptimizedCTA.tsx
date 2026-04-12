import React from 'react';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Shield } from 'lucide-react';
import { useVisitorOptimization } from '@/hooks/useVisitorOptimization';

interface OptimizedCTAProps {
  variant?: 'primary' | 'secondary' | 'urgency' | 'benefit';
  size?: 'sm' | 'md' | 'lg';
  location: string;
  visitorProfile?: string;
  className?: string;
}

const OptimizedCTA = ({ 
  variant = 'primary', 
  size = 'md', 
  location, 
  visitorProfile = 'busy_professional',
  className = ''
}: OptimizedCTAProps) => {
  const { trackCTAClick } = useVisitorOptimization();

  const getCTAContent = () => {
    switch (visitorProfile) {
      case 'corporate':
        return {
          primary: { text: 'Get Corporate Quote', icon: Calendar },
          secondary: { text: 'Schedule Team Consultation', icon: Clock },
          urgency: { text: 'Book This Week - Save 20%', icon: Clock },
          benefit: { text: 'Boost Team Health', icon: Shield }
        };
      case 'membership_prospect':
        return {
          primary: { text: 'Join Membership', icon: Shield },
          secondary: { text: 'View Membership Plans', icon: Calendar },
          urgency: { text: 'Lock Founding Rate Today', icon: Clock },
          benefit: { text: 'Save $200+ Per Year', icon: Shield }
        };
      case 'health_conscious':
        return {
          primary: { text: 'Book Premium Service', icon: Shield },
          secondary: { text: 'Learn About Testing', icon: Calendar },
          urgency: { text: 'Same-Day Results Available', icon: Clock },
          benefit: { text: '99% Accuracy Guaranteed', icon: Shield }
        };
      default: // busy_professional
        return {
          primary: { text: 'Book at Your Office', icon: Calendar },
          secondary: { text: 'Schedule Consultation', icon: Clock },
          urgency: { text: 'Same-Day Service Available', icon: Clock },
          benefit: { text: 'Save 2+ Hours', icon: Shield }
        };
    }
  };

  const ctaOptions = getCTAContent();
  const selectedCTA = ctaOptions[variant];
  const Icon = selectedCTA.icon;

  const getSizeClass = () => {
    switch (size) {
      case 'sm':
        return 'px-4 py-2 text-sm';
      case 'lg':
        return 'px-8 py-4 text-lg';
      default:
        return 'px-6 py-3 text-base';
    }
  };

  const getVariantClass = () => {
    switch (variant) {
      case 'urgency':
        return 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white animate-pulse';
      case 'benefit':
        return 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white';
      case 'secondary':
        return 'bg-white hover:bg-gray-50 text-conve-red border-2 border-conve-red';
      default:
        return 'bg-conve-red hover:bg-conve-red/90 text-white';
    }
  };

  const handleClick = () => {
    trackCTAClick(selectedCTA.text, location);
    // Add your navigation logic here
    console.log(`CTA clicked: ${selectedCTA.text} from ${location}`);
  };

  return (
    <Button
      onClick={handleClick}
      className={`
        ${getSizeClass()}
        ${getVariantClass()}
        font-semibold
        flex items-center justify-center space-x-2
        transition-all duration-200
        shadow-lg hover:shadow-xl
        transform hover:scale-105
        ${className}
      `}
    >
      <Icon className="h-5 w-5" />
      <span>{selectedCTA.text}</span>
    </Button>
  );
};

export default OptimizedCTA;