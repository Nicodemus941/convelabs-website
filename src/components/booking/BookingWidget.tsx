import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildEmbedUrl } from '@/lib/constants/urls';

interface BookingWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  source?: string;
}

export const BookingWidget: React.FC<BookingWidgetProps> = ({
  isOpen,
  onClose,
  source = 'website',
}) => {
  const [isLoading, setIsLoading] = useState(true);

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const iframeUrl = buildEmbedUrl({
    source: 'convelabs_website',
    medium: 'booking_widget',
    campaign: 'embedded_booking',
    content: source,
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className={cn(
          "max-w-[95vw] w-full h-[90vh] p-0 gap-0",
          "sm:max-w-[900px] sm:h-[85vh]",
          "md:max-w-[1000px] md:h-[800px]"
        )}
      >
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="text-lg font-semibold">Schedule Your Appointment</DialogTitle>
        </DialogHeader>
        
        <div className="relative flex-1 w-full h-full overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-conve-red" />
                <p className="text-sm text-muted-foreground">Loading booking system...</p>
              </div>
            </div>
          )}
          
          <iframe
            src={iframeUrl}
            className="w-full h-full border-0"
            onLoad={handleIframeLoad}
            title="Book Appointment"
            allow="payment"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
