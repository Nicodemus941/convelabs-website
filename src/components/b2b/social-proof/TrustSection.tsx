import React from 'react';
import { motion } from 'framer-motion';
import { trustMetrics } from '@/data/b2bContent';
import TestimonialCarousel from './TestimonialCarousel';
import { Shield, Award, Users, Clock, MapPin, UserCheck } from 'lucide-react';
import { IndustryType } from '@/types/b2bTypes';

const metricIcons = [Users, Award, Shield, Clock, MapPin, UserCheck];

interface TrustSectionProps {
  selectedIndustry: IndustryType;
}

const TrustSection: React.FC<TrustSectionProps> = ({ selectedIndustry }) => {
  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-800 mb-6">
            Trusted by Leading Organizations
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            ConveLabs has delivered exceptional results for hundreds of organizations across multiple industries
          </p>
        </motion.div>

        {/* Trust Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {trustMetrics.map((metric, index) => {
            const Icon = metricIcons[index];
            
            return (
              <motion.div
                key={index}
                className="bg-gradient-to-br from-gray-50 to-white p-8 rounded-2xl border border-gray-100 text-center hover:shadow-luxury transition-all duration-300"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                whileHover={{ y: -5 }}
              >
                <div className="bg-gradient-to-br from-conve-red to-purple-700 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <div className="text-4xl font-bold text-gray-800 mb-2">
                  {metric.value}
                </div>
                <div className="text-lg font-semibold text-gray-700 mb-1">
                  {metric.label}
                </div>
                <div className="text-gray-600">
                  {metric.description}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Testimonials Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h3 className="text-3xl font-bold text-gray-800 mb-6">
              What Our Partners Say
            </h3>
            <p className="text-lg text-gray-600 mb-8">
              Hear directly from organizations that have transformed their operations through ConveLabs partnerships.
            </p>
            
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="bg-green-100 p-2 rounded-lg">
                  <Shield className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-800">HIPAA Compliant</div>
                  <div className="text-gray-600">Full healthcare privacy protection</div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Award className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-800">Nationally Certified</div>
                  <div className="text-gray-600">Licensed in all 50 states</div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="bg-purple-100 p-2 rounded-lg">
                  <Clock className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-800">24/7 Support</div>
                  <div className="text-gray-600">Round-the-clock partnership support</div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <TestimonialCarousel selectedIndustry={selectedIndustry} />
          </motion.div>
        </div>

        {/* Additional Trust Elements */}
        <motion.div
          className="mt-16 bg-gradient-to-r from-gray-50 to-white p-8 rounded-2xl border border-gray-100"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
        >
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              Partnership Success Metrics
            </h3>
            <p className="text-gray-600">
              Measurable results delivered across our partner network
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-3xl font-bold text-conve-red mb-2">96%</div>
              <div className="text-gray-600">Partner Retention Rate</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-conve-red mb-2">15%</div>
              <div className="text-gray-600">Average Revenue Increase</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-conve-red mb-2">30%</div>
              <div className="text-gray-600">Cost Reduction Average</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-conve-red mb-2">6 Months</div>
              <div className="text-gray-600">Average ROI Timeline</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default TrustSection;