import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useBookingModalSafe } from "@/contexts/BookingModalContext";

type FeeVariant = 'control' | 'billing_split';

interface PricingTransparencyProps {
  feeVariant?: FeeVariant;
  onExperimentClick?: () => void;
}

const PricingTransparency = ({
  feeVariant = 'control',
  onExperimentClick,
}: PricingTransparencyProps) => {
  const bookingModal = useBookingModalSafe();
  const billingCopy = feeVariant === 'billing_split'
    ? {
        headline: 'You pay ConveLabs for the draw. Your lab bills the test.',
        body: 'Quest, LabCorp, AdventHealth, or your chosen lab handles the test billing through its normal insurance workflow.',
      }
    : {
        headline: 'ConveLabs charges the draw fee. Your lab handles the lab bill.',
        body: 'Your insurance still goes through the receiving lab the normal way.',
      };

  return (
    <section id="pricing" className="py-16 sm:py-20 bg-white">
      <div className="container mx-auto px-4 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Know the fee before you book
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Your lab handles the lab bill. ConveLabs charges the draw fee.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="bg-muted/30 border border-border rounded-2xl p-8 sm:p-10 max-w-lg mx-auto"
        >
          <div className="rounded-xl bg-white border border-border p-4 mb-6 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-conve-red mb-2">
              How billing works
            </p>
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-medium text-foreground">{billingCopy.headline}</span>{' '}
              {billingCopy.body}
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Doctor Office Blood Draw</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-bold text-conve-red">$55</span>
                <span className="text-muted-foreground text-base">/ visit</span>
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <h3 className="text-lg font-semibold text-foreground">Mobile Blood Draw (At Home)</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-bold text-conve-red">$150</span>
                <span className="text-muted-foreground text-base">/ visit</span>
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <h3 className="text-lg font-semibold text-foreground">Senior Blood Draw (65+)</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-bold text-conve-red">$110</span>
                <span className="text-muted-foreground text-base">/ visit</span>
              </div>
            </div>
          </div>
          <p className="text-muted-foreground text-sm mb-2">
            Additional patient at same location:{" "}
            <span className="font-semibold text-foreground">$75</span>
          </p>
          <p className="text-muted-foreground text-sm mb-6">
            Different locations can cost more based on distance, and we show that before checkout when it applies.
          </p>

          <div className="space-y-3 mb-8 text-left">
            {[
              "Licensed phlebotomist at your door",
              "You can upload the lab order during booking",
              "Specimen delivery confirmation sent to you",
              "Quest, LabCorp, AdventHealth, or your lab of choice",
              "Family members can be booked at the same visit",
              "Distance-based pricing is shown before you pay when a farther location adds cost",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <CheckCircle className="h-5 w-5 text-conve-red flex-shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{item}</span>
              </div>
            ))}
          </div>

          <Button
            onClick={() => {
              onExperimentClick?.();
              bookingModal?.openModal("pricing_cta");
            }}
            size="lg"
            className="w-full h-14 bg-conve-red hover:bg-conve-red-dark text-white font-semibold text-base rounded-xl shadow-luxury-red hover:shadow-luxury-red-hover transition-all"
          >
            Book Your Appointment
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>

          <p className="text-xs text-muted-foreground mt-4 text-center">
            Membership is optional.{" "}
            <a href="/membership" className="text-conve-red underline">
              See savings plans
            </a>
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default PricingTransparency;
