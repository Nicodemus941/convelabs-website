import React from 'react';
import { motion, type Variants } from 'framer-motion';
import { TestTube, Home, Clock, DollarSign, Shield, Award, ArrowRight, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useConversionOptimization } from '@/contexts/ConversionOptimizationContext';
import { TESTS_URL } from '@/lib/constants/urls';

const LabTestingFeature = () => {
  const { trackServiceInterest } = useConversionOptimization();

  const handleCatalogClick = () => {
    trackServiceInterest('Lab Testing Catalog');
  };

  const handleLearnMoreClick = () => {
    trackServiceInterest('Lab Testing Page');
  };

  const benefits = [
    {
      icon: <TestTube className="h-6 w-6 text-conve-red" />,
      title: "Extensive Test Catalog",
      description: "Over 200 tests from routine to specialized"
    },
    {
      icon: <Home className="h-6 w-6 text-conve-red" />,
      title: "At-Home Convenience",
      description: "Certified phlebotomist comes to your location"
    },
    {
      icon: <Clock className="h-6 w-6 text-conve-red" />,
      title: "Fast Results",
      description: "Secure results in 1-2 business days"
    },
    {
      icon: <DollarSign className="h-6 w-6 text-conve-red" />,
      title: "Transparent Pricing",
      description: "Clear costs upfront, starting from $20"
    }
  ];

  const popularTests = [
    { name: "Complete Blood Count (CBC)", price: "$29" },
    { name: "Lipid Panel (Cholesterol)", price: "$35" },
    { name: "Thyroid (TSH)", price: "$45" },
    { name: "Vitamin D", price: "$49" },
    { name: "Hemoglobin A1C", price: "$39" },
    { name: "Testosterone Panel", price: "$79" }
  ];

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        when: "beforeChildren",
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: "easeOut",
      },
    },
  };

  return (
    <section className="luxury-section bg-gradient-to-br from-blue-50/50 via-cyan-50/30 to-white relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-[0.02]">
        <div className="absolute top-20 right-20 w-96 h-96 bg-blue-600 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-cyan-600 rounded-full blur-3xl"></div>
      </div>

      <div className="relative container mx-auto px-4">
        <motion.div
          className="max-w-7xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Column - Content */}
            <motion.div variants={itemVariants}>
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-100/80 to-cyan-100/60 backdrop-blur-sm rounded-full border border-blue-200/60 text-sm font-semibold mb-6 shadow-luxury">
                <TestTube className="h-4 w-4 text-conve-red" />
                NEW SERVICE
              </div>

              {/* Headline */}
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-playfair font-bold mb-6 luxury-heading">
                Order Professional Lab Tests Online
              </h2>

              {/* Subheadline */}
              <p className="text-lg sm:text-xl text-gray-600 mb-8 leading-relaxed">
                Browse 200+ lab tests and schedule at-home phlebotomy—all in one convenient platform
              </p>

              {/* Benefits Grid */}
              <div className="grid sm:grid-cols-2 gap-6 mb-8">
                {benefits.map((benefit, index) => (
                  <motion.div
                    key={index}
                    variants={itemVariants}
                    className="flex gap-4"
                  >
                    <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-conve-red/10 to-conve-red/5 rounded-xl flex items-center justify-center">
                      {benefit.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">{benefit.title}</h3>
                      <p className="text-sm text-gray-600">{benefit.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href={TESTS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleCatalogClick}
                  className="inline-flex items-center justify-center luxury-button font-semibold tracking-wide group"
                >
                  Browse Lab Test Catalog
                  <ExternalLink className="ml-2 h-5 w-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform duration-300" />
                </a>
                <Link
                  to="/lab-testing"
                  onClick={handleLearnMoreClick}
                  className="inline-flex items-center justify-center luxury-button-outline font-semibold tracking-wide group"
                >
                  Learn More About Lab Testing
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
                </Link>
              </div>
            </motion.div>

            {/* Right Column - Popular Tests */}
            <motion.div variants={itemVariants}>
              <div className="luxury-card p-8">
                <h3 className="text-2xl font-playfair font-semibold text-gray-900 mb-6">
                  Popular Lab Tests
                </h3>
                <div className="space-y-4">
                  {popularTests.map((test, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.05 }}
                      viewport={{ once: true }}
                      className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50/80 to-white/60 rounded-xl hover:shadow-md transition-all duration-300 group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-lg flex items-center justify-center group-hover:from-blue-200 group-hover:to-cyan-200 transition-all duration-300">
                          <TestTube className="h-5 w-5 text-blue-600" />
                        </div>
                        <span className="font-medium text-gray-800">{test.name}</span>
                      </div>
                      <span className="text-conve-red font-semibold">{test.price}</span>
                    </motion.div>
                  ))}
                </div>

                {/* Trust Badges */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <div className="flex flex-wrap gap-4 justify-center">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Shield className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">CLIA Certified Labs</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Award className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">Labcorp & Quest Partners</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default LabTestingFeature;
