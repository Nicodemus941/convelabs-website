
import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CheckCircle, Star, Shield, Clock, Crown, ArrowRight } from "lucide-react";

interface FunnelStep1WelcomeProps {
  onNext: () => void;
}

const FunnelStep1Welcome = ({ onNext }: FunnelStep1WelcomeProps) => {
  const trustIndicators = [
    { icon: <CheckCircle className="h-5 w-5" />, text: "99% First-Stick Success" },
    { icon: <Clock className="h-5 w-5" />, text: "Same-Day Scheduling" },
    { icon: <Star className="h-5 w-5" />, text: "5-Star Service" },
    { icon: <Shield className="h-5 w-5" />, text: "100% Secure & Private" }
  ];

  const benefits = [
    "Personalized plan recommendations based on your unique needs",
    "Save up to 64% compared to traditional lab testing",
    "Convenient at-home or office blood collection",
    "Expert phlebotomists with 99% first-stick success rate"
  ];

  return (
    <section className="min-h-screen flex items-center justify-center py-12 px-4">
      <div className="container mx-auto">
        <motion.div 
          className="max-w-4xl mx-auto text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          {/* Premium badge */}
          <motion.div 
            className="inline-flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 bg-white/80 backdrop-blur-sm rounded-full border border-conve-red/20 shadow-luxury mb-6 sm:mb-8"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-conve-red" />
            <span className="text-xs sm:text-sm font-semibold text-gray-800 tracking-wide">
              Premium Mobile Phlebotomy Services
            </span>
          </motion.div>

          {/* Main headline - Optimized text scaling */}
          <motion.div 
            className="mb-8 sm:mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-playfair font-bold leading-[0.9] tracking-tight mb-4 sm:mb-6">
              <span className="luxury-heading">Find Your Perfect</span>
              <br />
              <span className="text-gray-900">ConveLabs Plan</span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl lg:text-2xl executive-focus max-w-3xl mx-auto px-4">
              Take our personalized assessment to discover the ideal membership plan 
              for your health and wellness needs. Get expert recommendations in just 2 minutes.
            </p>
          </motion.div>

          {/* Trust indicators - Mobile optimized grid */}
          <motion.div 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8 sm:mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            {trustIndicators.map((indicator, index) => (
              <motion.div 
                key={index}
                className="flex items-center gap-3 p-3 sm:p-4 bg-white/70 backdrop-blur-sm rounded-xl border border-gray-100/50 shadow-sm min-h-[60px] touch-manipulation"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
              >
                <div className="flex-shrink-0 w-10 h-10 bg-conve-red/10 rounded-lg flex items-center justify-center">
                  <div className="text-conve-red">
                    {indicator.icon}
                  </div>
                </div>
                <span className="font-semibold text-gray-800 text-sm leading-snug">
                  {indicator.text}
                </span>
              </motion.div>
            ))}
          </motion.div>

          {/* Benefits list - Mobile optimized */}
          <motion.div 
            className="bg-gradient-to-r from-conve-red/5 to-purple-50/50 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-conve-red/10 mb-8 sm:mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <h3 className="text-xl sm:text-2xl font-playfair font-semibold text-gray-900 mb-4 sm:mb-6">
              What You'll Get:
            </h3>
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              {benefits.map((benefit, index) => (
                <motion.div 
                  key={index}
                  className="flex items-start gap-3 text-left"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.7 + index * 0.1 }}
                >
                  <div className="w-2 h-2 bg-conve-red rounded-full mt-2 flex-shrink-0"></div>
                  <span className="text-gray-700 leading-relaxed text-sm sm:text-base">{benefit}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* CTA - Enhanced touch targets */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          >
            <Button 
              onClick={onNext}
              className="luxury-button text-base sm:text-lg md:text-xl py-6 sm:py-8 px-8 sm:px-16 font-semibold tracking-wide mb-4 sm:mb-6 w-full sm:w-auto min-h-[56px] touch-manipulation"
              size="lg"
            >
              Start Your Personalized Assessment
              <ArrowRight className="ml-2 sm:ml-3 h-5 w-5 sm:h-6 sm:w-6" />
            </Button>
            
            <p className="text-xs sm:text-sm text-gray-500 font-medium px-4">
              ✓ Free assessment • ✓ No commitment • ✓ 2-minute completion
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default FunnelStep1Welcome;
