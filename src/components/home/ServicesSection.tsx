import React from "react";
import { ArrowRight, Crown, Lock, Activity, Stethoscope, Star } from "lucide-react";
import { motion } from "framer-motion";
import { useBookingModalSafe } from '@/contexts/BookingModalContext';

const ServicesSection = () => {
  const bookingModal = useBookingModalSafe();

  const services = [
    {
      icon: <Crown className="h-10 w-10 text-conve-red" />,
      title: "Executive Health Protocols",
      description: "TRT monitoring, quarterly executive panels, and travel-flexible scheduling designed for high-performing professionals who can't afford downtime.",
      features: ["TRT & hormone monitoring", "Quarterly executive panels", "Travel-flexible scheduling"],
      badge: "Executives",
      source: 'executive_card'
    },
    {
      icon: <Lock className="h-10 w-10 text-conve-red" />,
      title: "Celebrity & VIP Services",
      description: "NDA-protected, fully discreet home and hotel visits. Complete privacy for public figures who require confidential health services.",
      features: ["NDA-protected visits", "Home & hotel service", "Total confidentiality"],
      badge: "VIP",
      source: 'vip_card'
    },
    {
      icon: <Activity className="h-10 w-10 text-conve-red" />,
      title: "Athlete Performance Labs",
      description: "Hormone panels, metabolic testing, and recovery markers for professional athletes optimizing peak performance and longevity.",
      features: ["Hormone & metabolic panels", "Recovery marker tracking", "Performance optimization"],
      badge: "Athletes",
      source: 'athlete_card'
    },
    {
      icon: <Stethoscope className="h-10 w-10 text-conve-red" />,
      title: "Concierge Doctor Partnership",
      description: "White-label phlebotomy for concierge practices. Extend your care model with reliable, professional mobile blood collection for your patients.",
      features: ["White-label service", "Reliable patient scheduling", "Seamless practice integration"],
      badge: "Physicians",
      source: 'physician_card'
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { when: "beforeChildren", staggerChildren: 0.15 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] },
    },
  };

  return (
    <section id="services" className="py-12 sm:py-16 md:py-20 lg:py-24 bg-white relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.02]">
        <div className="absolute top-40 left-20 w-72 h-72 bg-conve-red rounded-full blur-3xl"></div>
        <div className="absolute bottom-40 right-20 w-72 h-72 bg-gray-900 rounded-full blur-3xl"></div>
      </div>

      <div className="relative container mx-auto px-4">
        <motion.div 
          className="max-w-6xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {/* Header */}
          <motion.div variants={itemVariants} className="text-center mb-10 sm:mb-16 md:mb-20">
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-gray-100/80 to-gray-50/60 backdrop-blur-sm rounded-full border border-gray-200/60 text-sm font-semibold mb-8 shadow-luxury">
              <Star className="h-5 w-5 text-conve-red" />
              Our Services
            </div>
            
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-playfair font-bold mb-6 sm:mb-8 luxury-heading">
              Services Built Around You
            </h2>
            <p className="text-lg sm:text-xl executive-focus max-w-3xl mx-auto">
              Whether you're a Fortune 500 executive, a professional athlete, a public figure, 
              or a concierge physician — ConveLabs delivers private, on-demand lab services 
              on your terms.
            </p>
          </motion.div>

          {/* Services Grid */}
          <motion.div variants={itemVariants} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 mb-16">
            {services.map((service, index) => (
              <motion.div 
                key={index}
                variants={itemVariants}
                className="luxury-card group cursor-pointer h-full"
              >
                <div className="p-5 sm:p-6 lg:p-8 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-conve-red/10 to-conve-red/5 rounded-2xl flex items-center justify-center group-hover:from-conve-red/20 group-hover:to-conve-red/10 transition-all duration-300">
                      {service.icon}
                    </div>
                    <span className="px-3 py-1 bg-conve-red/10 text-conve-red text-xs font-semibold rounded-full">
                      {service.badge}
                    </span>
                  </div>

                  <h3 className="text-xl font-playfair font-semibold mb-4 text-gray-900 group-hover:text-conve-red transition-colors duration-300">
                    {service.title}
                  </h3>
                  
                  <p className="text-gray-600 mb-6 leading-relaxed flex-grow">
                    {service.description}
                  </p>

                  <div className="space-y-3 mb-6">
                    {service.features.map((feature, featureIndex) => (
                      <div key={featureIndex} className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 bg-conve-red rounded-full"></div>
                        <span className="text-sm text-gray-700 font-medium">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={() => bookingModal?.openModal(service.source)}
                    aria-label={`Book ${service.title}`}
                    className="flex items-center text-conve-red font-semibold group-hover:text-conve-red-dark transition-colors duration-300 mt-auto"
                  >
                    Book Now
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Bottom CTA */}
          <motion.div variants={itemVariants} className="text-center">
            <div className="bg-gradient-to-r from-gray-50/80 to-white/60 backdrop-blur-sm rounded-2xl p-8 border border-gray-100/60 shadow-luxury">
              <h3 className="text-xl sm:text-2xl font-playfair font-semibold text-gray-900 mb-4">
                Not Sure Which Service Is Right for You?
              </h3>
              <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
                Call us or book an appointment — we'll help you choose the right service
                based on your needs.
              </p>
              <button 
                onClick={() => bookingModal?.openModal('services_bottom_cta')}
                className="inline-flex items-center luxury-button-outline font-semibold tracking-wide min-h-[44px]"
              >
                Book Now
                <ArrowRight className="ml-3 h-5 w-5" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default ServicesSection;
