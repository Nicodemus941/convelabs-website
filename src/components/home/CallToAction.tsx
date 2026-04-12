import React from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookingModalSafe } from "@/contexts/BookingModalContext";

const CallToAction = () => {
  const bookingModal = useBookingModalSafe();

  return (
    <section className="py-16 sm:py-20 bg-conve-red text-white">
      <div className="container mx-auto px-4 max-w-3xl text-center">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4">
          Blood Work Done Right — At Your Door
        </h2>
        <p className="text-lg sm:text-xl opacity-90 mb-8 max-w-xl mx-auto">
          Licensed phlebotomists. Same-day availability. Office visits from $55. Mobile from $150. Members save up to 25%.
        </p>
        <Button
          onClick={() => bookingModal?.openModal("final_cta")}
          size="lg"
          className="h-14 px-10 bg-white text-conve-red hover:bg-gray-100 font-semibold text-lg rounded-xl shadow-luxury"
        >
          Book Appointment
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
        <p className="text-sm opacity-75 mt-4">
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
