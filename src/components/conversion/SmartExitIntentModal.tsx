import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Gift, Star, ArrowRight, Shield } from 'lucide-react';
import { useConversionOptimization } from '@/contexts/ConversionOptimizationContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SmartExitIntentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SmartExitIntentModal: React.FC<SmartExitIntentModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [offerClaimed, setOfferClaimed] = useState(false);
  const { hasBookingIntent } = useConversionOptimization();

  const getOffer = () => {
    if (hasBookingIntent) {
      return {
        headline: "Before You Go — 10% Off Your First Visit",
        subheadline: "Enter your email and we'll send you a discount code for your first ConveLabs blood draw.",
        offer: "10% Off First Visit",
        ctaText: "Get My Discount",
        icon: Gift,
      };
    }

    return {
      headline: "Get 10% Off Your First Visit",
      subheadline: "Join 500+ Central Florida patients who trust ConveLabs for their lab work.",
      offer: "10% Off + Priority Booking",
      ctaText: "Claim My Discount",
      icon: Star,
    };
  };

  const offer = getOffer();
  const IconComponent = offer.icon;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || isSubmitting) return;
    setIsSubmitting(true);

    try {
      // Store lead
      await supabase.from('abandoned_bookings' as any).insert({
        email: email.trim(),
        step_reached: 0,
        recovery_sent: false,
      });

      localStorage.setItem('convelabs_exit_offer', JSON.stringify({ email, timestamp: Date.now() }));
      setOfferClaimed(true);
      toast.success('Discount code sent to your email!');

      setTimeout(() => onClose(), 3000);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (offerClaimed) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md mx-auto bg-white border-0 shadow-2xl">
          <div className="text-center py-8">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Star className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold mb-2">Check Your Email!</h3>
            <p className="text-muted-foreground mb-2">Your 10% discount code is on its way.</p>
            <p className="text-sm text-muted-foreground">This window will close automatically...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto bg-white border-0 shadow-2xl overflow-hidden">
        <button onClick={onClose} className="absolute right-4 top-4 p-1 rounded-full hover:bg-gray-100 z-10">
          <X className="h-4 w-4 text-gray-500" />
        </button>

        <div className="bg-gradient-to-r from-[#B91C1C]/10 to-[#991B1B]/5 px-6 pt-6 pb-4 -mx-6 -mt-6 mb-4">
          <div className="flex items-center justify-center mb-3">
            <div className="w-12 h-12 bg-[#B91C1C]/10 rounded-full flex items-center justify-center">
              <IconComponent className="h-6 w-6 text-[#B91C1C]" />
            </div>
          </div>
          <DialogTitle className="text-xl font-bold text-center mb-2">
            {offer.headline}
          </DialogTitle>
          <p className="text-muted-foreground text-sm text-center">
            {offer.subheadline}
          </p>
        </div>

        <div className="bg-[#B91C1C]/5 border border-[#B91C1C]/20 rounded-lg p-4 text-center mb-4">
          <div className="text-lg font-semibold text-[#B91C1C]">{offer.offer}</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button
            type="submit"
            disabled={isSubmitting || !email}
            className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white font-semibold py-3"
          >
            {isSubmitting ? 'Processing...' : (
              <span className="flex items-center justify-center">
                {offer.ctaText} <ArrowRight className="ml-2 h-4 w-4" />
              </span>
            )}
          </Button>
        </form>

        <div className="mt-4 space-y-1 text-center text-xs text-muted-foreground">
          <p className="flex items-center justify-center gap-1"><Shield className="h-3 w-3" /> No spam, unsubscribe anytime</p>
          <p>500+ patients across Central Florida</p>
          <p>Same-day appointments available</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SmartExitIntentModal;
