import React from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookingModalSafe } from "@/contexts/BookingModalContext";

const CallToAction = () => {
  const bookingModal = useBookingModalSafe();

  return (
    <section className="py-16 sm:py-24 bg-gradient-to-br from-brand-burgundy via-brand-burgundy-deep to-brand-burgundy-darker text-white relative overflow-hidden">
      <div className="absolute -top-24 -right-16 w-96 h-96 bg-brand-gold/10 rounded-full blur-3xl" />
      <div className="relative container mx-auto px-4 max-w-3xl text-center">
        <div className="flex items-center justify-center gap-3 mb-5">
          <span className="h-px w-8 bg-brand-gold/50" />
          <span className="text-xs font-medium uppercase tracking-[0.24em] text-brand-gold-soft">
            The lab comes to you
          </span>
          <span className="h-px w-8 bg-brand-gold/50" />
        </div>
        <h2 className="font-playfair text-3xl sm:text-5xl font-medium mb-5 leading-tight">
          Blood work done right — <span className="italic text-brand-gold">at your door.</span>
        </h2>
        <p className="text-lg sm:text-xl text-white/85 mb-8 max-w-xl mx-auto font-light">
          Licensed phlebotomists. Same-day availability. Office visits from $55. Mobile from $150. Members save up to 25%.
        </p>
        <Button
          onClick={() => bookingModal?.openModal("final_cta")}
          size="lg"
          className="h-14 px-10 bg-white text-brand-burgundy hover:bg-brand-cream font-semibold text-sm uppercase tracking-[0.15em] rounded-lg shadow-luxury"
        >
          Book Appointment
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
        <p className="text-sm text-white/70 mt-5">
          Or call{" "}
          <a href="tel:+19415279169" className="underline font-semibold">
            941-527-9169
          </a>
        </p>
      </div>
    </section>
  );
};

export default CallToAction;
