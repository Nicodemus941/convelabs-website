import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Clock, Shield, Star } from 'lucide-react';
import { useVisitorOptimization } from '@/hooks/useVisitorOptimization';
import { useWebhookIntegration } from '@/hooks/useWebhookIntegration';

interface ExitIntentPopupProps {
  isOpen: boolean;
  onClose: () => void;
  visitorProfile?: string;
}

const ExitIntentPopup = ({ isOpen, onClose, visitorProfile = 'busy_professional' }: ExitIntentPopupProps) => {
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { trackCTAClick, trackFormStart, trackFormComplete } = useVisitorOptimization();
  const { generateDiscountCoupon } = useWebhookIntegration();

  useEffect(() => {
    if (isOpen) {
      trackFormStart('exit_intent_offer');
    }
  }, [isOpen, trackFormStart]);

  const getOfferContent = () => {
    switch (visitorProfile) {
      case 'corporate':
        return {
          headline: "Wait! Special Corporate Wellness Offer",
          subheadline: "Get a custom quote for your team's health program",
          offer: "Free consultation + 20% off first corporate package",
          cta: "Get Corporate Quote"
        };
      case 'membership_prospect':
        return {
          headline: "Don't Miss Out on Founding Member Pricing",
          subheadline: "Lock in exclusive rates before they increase",
          offer: "Save $200 on your first year + priority booking",
          cta: "Claim Founding Rate"
        };
      case 'health_conscious':
        return {
          headline: "Your Health Deserves Premium Care",
          subheadline: "Join thousands who trust ConveLabs for accurate results",
          offer: "Free comprehensive health panel with first membership",
          cta: "Get Free Health Panel"
        };
      default:
        return {
          headline: "Wait! Don't Let Convenience Slip Away",
          subheadline: "Join busy professionals who've reclaimed their time",
          offer: "50% off your first at-home lab service",
          cta: "Save 50% Now"
        };
    }
  };

  const content = getOfferContent();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsSubmitting(true);
    trackCTAClick(content.cta, 'exit_intent_popup');
    trackFormComplete('exit_intent_offer');

    try {
      console.log('Generating coupon for exit intent:', { email, visitorProfile });
      
      // Generate discount coupon through webhook
      const couponResponse = await generateDiscountCoupon({
        email,
        name: '',
        phone: phoneNumber,
        visitorProfile,
        offerType: content.offer,
        discountPercent: visitorProfile === 'busy_professional' ? 50 : 20,
      });

      if (couponResponse?.success) {
        console.log('Coupon generated successfully:', couponResponse);
        // Show success message with coupon details
        onClose();
        // Optional: Show a success modal or redirect with coupon info
      } else {
        console.log('Coupon generation failed or returned null');
        onClose();
      }
    } catch (error) {
      console.error('Error during coupon generation:', error);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto bg-white border-0 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 rounded-full hover:bg-gray-100 transition-colors"
        >
          <X className="h-4 w-4 text-gray-500" />
        </button>

        <DialogHeader className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 bg-conve-red/10 rounded-full flex items-center justify-center">
            <Clock className="h-8 w-8 text-conve-red" />
          </div>
          <DialogTitle className="text-xl font-bold text-gray-900">
            {content.headline}
          </DialogTitle>
          <p className="text-gray-600 text-sm">
            {content.subheadline}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Offer Highlight */}
          <div className="bg-gradient-to-r from-conve-red/5 to-conve-red/10 border border-conve-red/20 rounded-lg p-4 text-center">
            <div className="text-lg font-semibold text-conve-red mb-2">
              {content.offer}
            </div>
            <div className="flex items-center justify-center space-x-4 text-sm text-gray-600">
              <div className="flex items-center">
                <Shield className="h-4 w-4 mr-1" />
                99% Success Rate
              </div>
              <div className="flex items-center">
                <Star className="h-4 w-4 mr-1" />
                5-Star Service
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full"
            />
            <Input
              type="tel"
              placeholder="Phone number (optional)"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full"
            />
            <Button
              type="submit"
              disabled={isSubmitting || !email}
              className="w-full bg-conve-red hover:bg-conve-red/90 text-white font-semibold py-3"
            >
              {isSubmitting ? 'Processing...' : content.cta}
            </Button>
          </form>

          {/* Trust Indicators */}
          <div className="text-center text-xs text-gray-500">
            <p>✓ No spam, unsubscribe anytime</p>
            <p>✓ Professional phlebotomists only</p>
            <p>✓ Same-day results available</p>
          </div>

          {/* Urgency */}
          <div className="text-center">
            <p className="text-sm text-conve-red font-medium">
              Limited time offer - expires in 24 hours
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExitIntentPopup;