import React from "react";
import { Shield, UserCheck, Star, CheckCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion, type Variants } from "framer-motion";


import { withSource, BOOKING_URL } from '@/lib/constants/urls';
import { useBookingModalSafe } from '@/contexts/BookingModalContext';

const HowItWorks = () => {
  const bookingModal = useBookingModalSafe();
  const handleBookNowClick = () => {
    if (bookingModal) {
      bookingModal.openModal('how_it_works');
      return;
    }
    window.location.href = withSource(BOOKING_URL, 'how_it_works');
  };
  
  const steps = [{
    step: 1,
    title: "Upload your lab order and pick a time",
    description: "Start with the order from your doctor, choose home or office, and select the slot that works for you.",
    icon: <Upload className="h-8 w-8 text-white" />,
    details: ["Book in minutes", "Same-day when available", "Family add-ons supported"]
  }, {
    step: 2,
    title: "A licensed phlebotomist comes to you",
    description: "We arrive with the supplies, confirm the order, draw the specimen, and keep the visit calm and efficient.",
    icon: <UserCheck className="h-8 w-8 text-white" />,
    details: ["Home, office, or hotel", "Early fasting slots", "Professional specimen handling"]
  }, {
    step: 3,
    title: "We deliver the specimen to your lab",
    description: "Your sample goes to Quest, LabCorp, AdventHealth, or your chosen lab, and you get delivery confirmation after drop-off.",
    icon: <Shield className="h-8 w-8 text-white" />,
    details: ["Same-day lab delivery", "Confirmation text or email", "Results stay with your normal lab workflow"]
  }];
  
  const containerVariants: Variants = {
    hidden: {
      opacity: 0
    },
    visible: {
      opacity: 1,
      transition: {
        when: "beforeChildren",
        staggerChildren: 0.2
      }
    }
  };
  const itemVariants: Variants = {
    hidden: {
      opacity: 0,
      y: 40
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: "easeOut"
      }
    }
  };
  return <section id="how-it-works" className="py-12 sm:py-16 md:py-20 lg:py-24 luxury-gradient-bg relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-[0.04]">
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-brand-gold rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-conve-red rounded-full blur-3xl"></div>
      </div>

      <div className="relative container mx-auto px-4">
        <motion.div className="max-w-6xl mx-auto" variants={containerVariants} initial="hidden" whileInView="visible" viewport={{
        once: true
      }}>
          {/* Header */}
          <motion.div variants={itemVariants} className="text-center mb-12 sm:mb-16 md:mb-20">
            <div className="inline-flex items-center gap-2.5 px-6 py-3 bg-white/80 backdrop-blur-sm rounded-full border border-brand-gold/30 text-xs font-medium uppercase tracking-[0.18em] mb-8 shadow-luxury">
              <Star className="h-4 w-4 text-brand-gold-deep" />
              How booking works
            </div>
            
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair font-bold mb-8 luxury-heading">
              Three steps from order to draw
            </h2>
            <p className="text-xl executive-focus max-w-3xl mx-auto">
              No request form purgatory. No waiting-room shuffle. Just book, confirm, and let us come to you.
            </p>
          </motion.div>

          {/* Steps */}
          <div className="relative">
            {/* Connection line - hidden on mobile */}
            <div className="hidden lg:block absolute top-24 left-1/2 transform -translate-x-1/2 w-full max-w-4xl">
              <div className="flex justify-between items-center px-32">
                <div className="w-32 h-0.5 bg-gradient-to-r from-conve-red/30 to-conve-red/60"></div>
                <div className="w-32 h-0.5 bg-gradient-to-r from-conve-red/60 to-conve-red/30"></div>
              </div>
            </div>

            <motion.div variants={itemVariants} className="grid lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-12 mb-8 sm:mb-12 md:mb-16">
              {steps.map((step, index) => <motion.div key={index} className="text-center group" variants={itemVariants}>
                  <div className="relative mb-6 sm:mb-8 inline-block">
                    {/* Step icon */}
                    <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 mx-auto bg-gradient-to-br from-conve-red to-conve-red-dark rounded-2xl flex items-center justify-center shadow-luxury-red group-hover:shadow-luxury-red-hover group-hover:scale-110 transition-all duration-300">
                      {step.icon}
                    </div>
                    
                    {/* Step number */}
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full border-2 border-conve-red flex items-center justify-center shadow-luxury">
                      <span className="text-sm font-bold text-conve-red">{step.step}</span>
                    </div>
                  </div>

                  <div className="luxury-card p-5 sm:p-6 md:p-8 h-full">
                    <h3 className="text-xl font-playfair font-semibold mb-4 text-gray-900 group-hover:text-conve-red transition-colors duration-300">
                      {step.title}
                    </h3>
                    
                    <p className="text-gray-600 mb-6 leading-relaxed">
                      {step.description}
                    </p>

                    {/* Step details */}
                    <div className="space-y-3">
                      {step.details.map((detail, detailIndex) => <div key={detailIndex} className="flex items-center gap-3 justify-center">
                          <CheckCircle className="h-4 w-4 text-conve-red flex-shrink-0" />
                          <span className="text-sm text-gray-700 font-medium">{detail}</span>
                        </div>)}
                    </div>
                  </div>
                </motion.div>)}
            </motion.div>
          </div>
          
          {/* CTA */}
          <motion.div variants={itemVariants} className="text-center">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 sm:p-6 md:p-8 shadow-luxury border border-gray-100/60">
              <h3 className="text-2xl font-playfair font-semibold text-gray-900 mb-4">
                Ready to check availability?
              </h3>
              <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
                If you already have the lab order, the fastest path is to start the booking and pick a time.
              </p>
              <Button onClick={handleBookNowClick} className="luxury-button text-base md:text-lg py-4 px-6 md:py-6 md:px-12 font-semibold tracking-wide">
                Book My Home Visit
                <ArrowRight className="ml-3 h-5 w-5" />
              </Button>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>;
};
export default HowItWorks;
