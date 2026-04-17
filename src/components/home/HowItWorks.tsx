import React from "react";
import { Calendar, Shield, UserCheck, Clock, Star, CheckCircle } from "lucide-react";
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
    title: "Schedule Your Mobile Blood Draw",
    description: "Book online scheduling for blood tests through our platform for convenient blood testing at your preferred location and time.",
    icon: <Calendar className="h-8 w-8 text-white" />,
    details: ["Flexible scheduling", "Same-day availability", "Orlando & Tampa service"]
  }, {
    step: 2,
    title: "Meet Your Mobile Phlebotomist",
    description: "Our certified specialists arrive punctually for your scheduled blood draw at home with professional-grade equipment and expert precision.",
    icon: <UserCheck className="h-8 w-8 text-white" />,
    details: ["99% first-stick success", "Professional in-home blood draw", "5-7 minute service"]
  }, {
    step: 3,
    title: "Receive Fast Blood Test Results",
    description: "Access your lab results through our secure portal or have them delivered directly to your physician with convenient blood collection tracking.",
    icon: <Shield className="h-8 w-8 text-white" />,
    details: ["Secure digital access", "Fast results delivery", "No lost samples guarantee"]
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
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-conve-red rounded-full blur-3xl"></div>
      </div>

      <div className="relative container mx-auto px-4">
        <motion.div className="max-w-6xl mx-auto" variants={containerVariants} initial="hidden" whileInView="visible" viewport={{
        once: true
      }}>
          {/* Header */}
          <motion.div variants={itemVariants} className="text-center mb-12 sm:mb-16 md:mb-20">
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-white/80 backdrop-blur-sm rounded-full border border-gray-200/60 text-sm font-semibold mb-8 shadow-luxury">
              <Star className="h-5 w-5 text-conve-red" />
              How to Get Blood Work at Home
            </div>
            
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair font-bold mb-8 luxury-heading">
              Simple At-Home Blood Testing Process
            </h2>
            <p className="text-xl executive-focus max-w-3xl mx-auto">
              Experience the benefits of mobile phlebotomy with our streamlined process 
              for convenient blood collection at home—designed for professionals who value 
              efficiency and quality healthcare.
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
                Ready for Convenient Blood Testing at Home?
              </h3>
              <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
                Join 500+ patients across Central Florida who have experienced the benefits of mobile phlebotomy
                with ConveLabs premium at-home lab services and blood collection solutions.
              </p>
              <Button onClick={handleBookNowClick} className="luxury-button text-base md:text-lg py-4 px-6 md:py-6 md:px-12 font-semibold tracking-wide">
                Schedule Your At-Home Blood Draw
                <ArrowRight className="ml-3 h-5 w-5" />
              </Button>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>;
};
export default HowItWorks;