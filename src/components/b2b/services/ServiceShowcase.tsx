import React from 'react';
import { motion } from 'framer-motion';
import ServiceCard from './ServiceCard';
import { TestTube, FileText, Zap } from 'lucide-react';

const services = [
  {
    icon: TestTube,
    title: 'Mobile Phlebotomy',
    description: 'Certified phlebotomists deliver professional blood collection services at your location with medical-grade precision.',
    features: [
      'Certified, licensed phlebotomists',
      'Same-day scheduling availability',
      'Concierge-level service experience',
      'Mobile lab equipment & supplies',
      'Insurance billing coordination',
      'HIPAA-compliant processes'
    ]
  },
  {
    icon: FileText,
    title: 'Comprehensive Lab Panels',
    description: 'Executive-level health assessments and performance optimization through advanced biomarker analysis.',
    features: [
      'Executive health comprehensive panels',
      'Sports performance biomarker testing',
      'Preventive health screening packages',
      'Custom panel configurations',
      'Specialty testing coordination',
      'Trend analysis and reporting'
    ]
  },
  {
    icon: Zap,
    title: 'Rapid Results & Reporting',
    description: 'Fast turnaround times with comprehensive insights delivered through our secure digital platform.',
    features: [
      '24-48 hour result turnaround',
      'Secure online portal access',
      'Detailed health insights & trends',
      'Provider notification system',
      'Executive summary reporting',
      'Integration with existing EMR systems'
    ]
  }
];

const ServiceShowcase: React.FC = () => {
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
            Premium Health Services
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            ConveLabs delivers medical-grade mobile health services with the luxury and precision your organization deserves
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <ServiceCard
              key={index}
              icon={service.icon}
              title={service.title}
              description={service.description}
              features={service.features}
              index={index}
            />
          ))}
        </div>

        <motion.div
          className="text-center mt-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
        >
          <div className="bg-gradient-to-r from-gray-50 to-white p-8 rounded-2xl border border-gray-100">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              Why Organizations Choose ConveLabs
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-center">
              <div>
                <div className="text-3xl font-bold text-conve-red mb-2">100%</div>
                <div className="text-gray-600">Licensed Professionals</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-conve-red mb-2">24-48hrs</div>
                <div className="text-gray-600">Result Turnaround</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-conve-red mb-2">50 States</div>
                <div className="text-gray-600">National Coverage</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-conve-red mb-2">98%</div>
                <div className="text-gray-600">Client Satisfaction</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ServiceShowcase;