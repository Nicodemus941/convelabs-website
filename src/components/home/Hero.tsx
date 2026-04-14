import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Shield, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import { GHS_BOOKING_PAGE } from "@/lib/constants/urls";

const Hero = () => {
  const handleBookNow = () => {
    window.location.href = GHS_BOOKING_PAGE;
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { when: "beforeChildren", staggerChildren: 0.12 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
    },
  };

  return (
    <section className="relative bg-white overflow-hidden">
      <div className="absolute inset-0 opacity-[0.02]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(0,0,0,0.15) 1px, transparent 0)`,
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <div className="relative py-16 sm:py-20 md:py-24 lg:py-32">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            className="max-w-3xl mx-auto text-center"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Brand scripture */}
            <motion.p
              variants={itemVariants}
              className="text-xs sm:text-sm tracking-[0.15em] uppercase text-amber-700/60 font-light mb-5 leading-relaxed"
            >
              "I pray that you may enjoy good health and that all may go well with you"
              <span className="text-amber-700/40 text-[0.7em] ml-1">— 3 John 1:2</span>
            </motion.p>

            {/* Urgency badge */}
            <motion.div variants={itemVariants}>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 rounded-full border border-green-200 mb-6">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
                <span className="text-sm font-semibold text-green-800">
                  Same-day appointments available
                </span>
              </div>
            </motion.div>

            {/* H1 */}
            <motion.h1
              variants={itemVariants}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-foreground mb-6"
            >
              Know You're Healthy{" "}
              <span className="text-conve-red">— From Your Couch</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={itemVariants}
              className="text-lg sm:text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-4"
            >
              A licensed phlebotomist at your door in 60 minutes. Results in 48 hours. Backed by our on-time guarantee — or your visit is free.
            </motion.p>

            {/* Price anchor */}
            <motion.p
              variants={itemVariants}
              className="text-base sm:text-lg font-semibold text-foreground mb-8"
            >
              <span className="inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-4 py-1 text-green-800 text-sm font-semibold">🛡️ On-time or it's free</span>
              <br className="sm:hidden" />
              <span className="text-base sm:text-lg mt-2 block">Office from <span className="text-conve-red font-bold">$55</span> · Mobile from <span className="text-conve-red font-bold">$150</span> · Members save up to 25%</span>
            </motion.p>

            {/* Dual CTA */}
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
              <Button
                onClick={handleBookNow}
                size="lg"
                className="h-14 px-10 bg-conve-red hover:bg-conve-red-dark text-white font-semibold text-lg rounded-xl shadow-luxury-red hover:shadow-luxury-red-hover transition-all"
              >
                Book Your Visit — Same-Day Available
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                onClick={() => window.location.href = '/pricing'}
                size="lg"
                variant="outline"
                className="h-14 px-8 font-semibold text-lg rounded-xl border-2"
              >
                See How It Works
              </Button>
            </motion.div>

            {/* Social proof counters */}
            <motion.div variants={itemVariants} className="flex flex-wrap justify-center gap-6 sm:gap-10 mb-8">
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-foreground">500+</p>
                <p className="text-xs text-muted-foreground">Happy Patients</p>
              </div>
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-foreground">4.9<span className="text-amber-500">★</span></p>
                <p className="text-xs text-muted-foreground">Google Rating</p>
              </div>
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-foreground">60min</p>
                <p className="text-xs text-muted-foreground">Avg. Response</p>
              </div>
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-conve-red">$0</p>
                <p className="text-xs text-muted-foreground">If We're Late</p>
              </div>
            </motion.div>

            {/* Trust signals row */}
            <motion.div
              variants={itemVariants}
              className="flex flex-wrap justify-center gap-x-4 sm:gap-x-6 gap-y-3 text-sm text-muted-foreground"
            >
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-conve-red" />
                <span>HIPAA Compliant</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-conve-red" />
                <span>Licensed Phlebotomists</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-conve-red" />
                <span>Delivery Confirmation Sent</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-conve-red" />
                <span>500+ Patients Served</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-conve-red" />
                <span>Satisfaction Guaranteed</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
