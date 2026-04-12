import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Clock, Gift, Star, ArrowRight } from 'lucide-react';
import { useConversionOptimization } from '@/contexts/ConversionOptimizationContext';
import { useSimpleFollowUp } from '@/hooks/useSimpleFollowUp';

interface SmartExitIntentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SmartExitIntentModal: React.FC<SmartExitIntentModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [offerClaimed, setOfferClaimed] = useState(false);
  const { hasBookingIntent, selectedService, abTestVariant } = useConversionOptimization();
  const { triggerImmediateFollowUp, trackFollowUpResponse } = useSimpleFollowUp();

  useEffect(() => {
    if (isOpen) {
      // Track that exit intent was triggered
      triggerImmediateFollowUp(hasBookingIntent ? 'warm' : 'cold');
    }
  }, [isOpen, hasBookingIntent, triggerImmediateFollowUp]);

  const getSmartOffer = () => {
    // AI-powered offer selection based on user behavior
    if (hasBookingIntent && selectedService) {
      return {
        headline: "Wait! Your Premium Service is Almost Ready",
        subheadline: "Complete your booking in the next 10 minutes and save $150",
        offer: "$150 OFF + Priority Scheduling",
        urgency: "Limited Time: Expires in 10 minutes",
        discount: 150,
        ctaText: "Claim My Discount",
        icon: Gift,
        variant: 'premium'
      };
    }

    if (hasBookingIntent) {
      return {
        headline: "Before You Go... Special Offer Inside",
        subheadline: "Get your first lab service for 50% off",
        offer: "50% OFF First Service",
        urgency: "Today Only: This offer expires at midnight",
        discount: 50,
        ctaText: "Get 50% Off Now",
        icon: Clock,
        variant: 'discount'
      };
    }

    return {
      headline: "Join 5,000+ Busy Professionals",
      subheadline: "Get our free guide: '5 Lab Tests Every Executive Should Get'",
      offer: "Free Executive Health Guide",
      urgency: "Plus exclusive health tips delivered weekly",
      discount: 0,
      ctaText: "Get Free Guide",
      icon: Star,
      variant: 'content'
    };
  };

  const smartOffer = getSmartOffer();
  const IconComponent = smartOffer.icon;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Track conversion
      await trackFollowUpResponse('converted');
      
      // Set local storage to show offer claimed state
      localStorage.setItem('exit_offer_claimed', JSON.stringify({
        email,
        offer: smartOffer.offer,
        timestamp: Date.now()
      }));

      setOfferClaimed(true);
      
      // Auto-close after showing success
      setTimeout(() => {
        onClose();
      }, 3000);

    } catch (error) {
      console.error('Error claiming offer:', error);
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
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Offer Claimed Successfully!
            </h3>
            <p className="text-gray-600 mb-4">
              Check your email for your {smartOffer.offer.toLowerCase()}
            </p>
            <p className="text-sm text-gray-500">
              This window will close automatically...
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto bg-white border-0 shadow-2xl overflow-hidden">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 rounded-full hover:bg-gray-100 transition-colors z-10"
        >
          <X className="h-4 w-4 text-gray-500" />
        </button>

        {/* Header with gradient background */}
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-6 pt-6 pb-4 -mx-6 -mt-6 mb-4">
          <div className="flex items-center justify-center mb-3">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <IconComponent className="h-6 w-6 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-xl font-bold text-gray-900 text-center mb-2">
            {smartOffer.headline}
          </DialogTitle>
          <p className="text-gray-600 text-sm text-center">
            {smartOffer.subheadline}
          </p>
        </div>

        {/* Offer highlight */}
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-lg p-4 text-center mb-6">
          <div className="text-lg font-semibold text-primary mb-1">
            {smartOffer.offer}
          </div>
          <div className="text-sm text-gray-600">
            {smartOffer.urgency}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full"
          />
          
          <Button
            type="submit"
            disabled={isSubmitting || !email}
            className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 text-base"
          >
            {isSubmitting ? (
              'Processing...'
            ) : (
              <span className="flex items-center justify-center">
                {smartOffer.ctaText}
                <ArrowRight className="ml-2 h-4 w-4" />
              </span>
            )}
          </Button>
        </form>

        {/* Trust indicators */}
        <div className="mt-6 space-y-2">
          <div className="text-center text-xs text-gray-500 space-y-1">
            <p>✓ No spam, unsubscribe anytime</p>
            <p>✓ 5,000+ professionals trust our service</p>
            <p>✓ Same-day results available</p>
          </div>
        </div>

        {/* Social proof */}
        <div className="mt-4 bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>👥 247 people claimed this offer today</span>
            <span>⭐ 4.9/5 rating</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SmartExitIntentModal;