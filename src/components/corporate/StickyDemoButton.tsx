import React from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';

interface StickyDemoButtonProps {
  onScheduleDemo: () => void;
}

export const StickyDemoButton: React.FC<StickyDemoButtonProps> = ({ onScheduleDemo }) => {
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-bounce">
      <Button
        onClick={onScheduleDemo}
        size="lg"
        className="luxury-button shadow-2xl hover:shadow-luxury-hover text-white px-6 py-4 h-auto rounded-full"
      >
        <Calendar className="w-5 h-5 mr-2" />
        Schedule Demo
      </Button>
    </div>
  );
};