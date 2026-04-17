import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Shield, Clock, Star, Crown, CheckCircle, Sparkles } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { ENROLLMENT_URL, withSource } from "@/lib/constants/urls";


const MembershipCTA = () => {

  const benefits = [
    {
      icon: <Crown className="h-7 w-7 text-conve-red" />,
      title: "Executive & Athlete Plans",
      description: "Regular monitoring, same-day scheduling, and priority booking. Members save 15-25% on every visit plus weekend access.",
      highlight: "Most Popular"
    },
    {
      icon: <Shield className="h-7 w-7 text-conve-red" />,
      title: "VIP Privacy Guarantee",
      description: "NDA-protected visits, dedicated phlebotomist, and fully confidential results for celebrities and public figures.",
      highlight: "NDA Protected"
    },
    {
      icon: <Clock className="h-7 w-7 text-conve-red" />,
      title: "Concierge Practice Integration",
      description: "White-label phlebotomy at $100/patient/month. Seamless scheduling, reliable collection, and results delivered to your practice.",
      highlight: "For Physicians"
    }
  ];

  const valueProps = [
    "Mobile visits from $99 — save up to $51 per visit",
    "Weekend appointments: Saturday 6 AM - 9:30 AM (members only)",
    "Priority and same-day scheduling",
    "Plans from just $99/year — pays for itself in 5 visits",
    "Family member add-ons from $35 per person",
    "Trusted by 500+ patients across Central Florida"
  ];

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { when: "beforeChildren", staggerChildren: 0.1 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: "easeOut" },
    },
  };

  return (
    <section className="py-12 sm:py-16 md:py-20 lg:py-24 luxury-gradient-bg relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="absolute top-20 right-20 w-96 h-96 bg-conve-red rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
      </div>

      <div className="relative container mx-auto px-4">
        <motion.div 
          className="max-w-6xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {/* Header Section */}
          <motion.div variants={itemVariants} className="text-center mb-8 sm:mb-12 md:mb-16">
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-conve-gold/10 to-amber-100/80 backdrop-blur-sm text-conve-red rounded-full text-sm font-semibold mb-8 shadow-luxury">
              <Sparkles className="h-5 w-5 text-conve-gold" />
              Recurring Revenue — The Core of Our Business
            </div>
            
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-playfair font-bold mb-6 sm:mb-8 luxury-heading">
              Membership Built for Your Lifestyle
            </h2>
            <p className="text-xl executive-focus max-w-3xl mx-auto">
              Executives, athletes, celebrities, and concierge physicians choose ConveLabs 
              membership for priority access, extended hours, and a healthcare experience 
              that matches the standard they expect in everything else.
            </p>
          </motion.div>

          {/* Benefits Grid */}
          <motion.div variants={itemVariants} className="grid lg:grid-cols-3 gap-6 sm:gap-8 mb-8 sm:mb-12 md:mb-16">
            {benefits.map((benefit, index) => (
              <Card key={index} className="luxury-card group cursor-pointer">
                <CardContent className="p-5 sm:p-6 md:p-8 text-center h-full flex flex-col">
                  <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-conve-red/10 to-conve-red/5 rounded-2xl flex items-center justify-center group-hover:from-conve-red/20 group-hover:to-conve-red/10 transition-all duration-300">
                    {benefit.icon}
                  </div>
                  <div className="mb-3">
                    <span className="inline-block px-3 py-1 bg-conve-red/10 text-conve-red text-xs font-semibold rounded-full mb-3">
                      {benefit.highlight}
                    </span>
                  </div>
                  <h3 className="text-xl font-playfair font-semibold mb-4 text-gray-900">
                    {benefit.title}
                  </h3>
                  <p className="text-gray-600 leading-relaxed flex-grow">
                    {benefit.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </motion.div>

          {/* Value Proposition */}
          <motion.div variants={itemVariants}>
            <Card className="luxury-card bg-gradient-to-br from-white to-gray-50/50 border-conve-red/10 mb-12">
              <CardContent className="p-6 sm:p-8 md:p-10">
                <div className="flex flex-col sm:flex-row items-start gap-4 mb-8">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-conve-red to-conve-red-dark rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Star className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-playfair font-bold text-gray-900 mb-2">
                      Why Elite Clients Choose ConveLabs Membership
                    </h3>
                    <p className="text-gray-600">Non-member rate: $150/visit. Members save from day one.</p>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  {valueProps.map((prop, index) => (
                    <div key={index} className="flex items-start gap-4 group">
                      <div className="w-6 h-6 bg-gradient-to-br from-conve-red to-conve-red-dark rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CheckCircle className="h-3 w-3 text-white" />
                      </div>
                      <span className="text-gray-700 leading-relaxed group-hover:text-gray-900 transition-colors duration-200">
                        {prop}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Call to Action */}
          <motion.div variants={itemVariants} className="text-center">
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-luxury border border-gray-100/60">
              <Button 
                onClick={() => window.location.href = withSource(ENROLLMENT_URL, 'membership_section')}
                className="luxury-button text-base sm:text-lg lg:text-xl py-5 sm:py-6 lg:py-8 px-8 sm:px-12 lg:px-16 font-semibold tracking-wide mb-6"
                size="lg"
              >
                Explore Membership Plans
                <ArrowRight className="ml-3 h-6 w-6" />
              </Button>
              
              <div className="space-y-3">
                <p className="text-sm text-gray-600 flex items-center justify-center gap-2">
                  <Shield className="h-4 w-4 text-conve-red" />
                  Founding member enrollment open now
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default MembershipCTA;
