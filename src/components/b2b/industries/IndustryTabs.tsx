import React from 'react';
import { motion } from 'framer-motion';
import { industryContent } from '@/data/b2bContent';
import { IndustryType } from '@/types/b2bTypes';
import IndustryValueProp from './IndustryValueProp';
import { Building2, Users, Trophy, Briefcase } from 'lucide-react';

const industryIcons = {
  healthcare: Building2,
  talent: Users,
  sports: Trophy,
  corporate: Briefcase,
};

interface IndustryTabsProps {
  selectedIndustry: IndustryType;
  onIndustryChange: (industry: IndustryType) => void;
}

const IndustryTabs: React.FC<IndustryTabsProps> = ({ selectedIndustry, onIndustryChange }) => {
  const handleTabClick = (industry: IndustryType) => {
    onIndustryChange(industry);
  };

  return (
    <section className="py-20 bg-gradient-to-br from-gray-50 to-white">
      <div className="container mx-auto px-4">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-800 mb-6">
            Industry-Specific Value
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Discover how ConveLabs delivers measurable results tailored to your industry's unique needs and challenges
          </p>
        </motion.div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          {(Object.keys(industryContent) as IndustryType[]).map((industry) => {
            const Icon = industryIcons[industry];
            const content = industryContent[industry];
            const isActive = selectedIndustry === industry;
            
            return (
              <motion.button
                key={industry}
                onClick={() => handleTabClick(industry)}
                className={`
                  flex items-center gap-3 px-6 py-4 rounded-xl font-semibold transition-all duration-300
                  ${isActive 
                    ? 'bg-conve-red text-white shadow-luxury-red' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-luxury border border-gray-200'
                  }
                `}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: industry === 'healthcare' ? 0.1 : industry === 'talent' ? 0.2 : industry === 'sports' ? 0.3 : 0.4 }}
              >
                <Icon className="w-6 h-6" />
                <span className="text-lg">{content.name}</span>
              </motion.button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-3xl shadow-luxury p-8 md:p-12">
            {(Object.keys(industryContent) as IndustryType[]).map((industry) => (
              <IndustryValueProp
                key={industry}
                content={industryContent[industry]}
                isActive={selectedIndustry === industry}
              />
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          className="text-center mt-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
        >
          <div className="bg-gradient-to-r from-conve-red to-purple-700 text-white p-8 rounded-2xl max-w-4xl mx-auto">
            <h3 className="text-2xl md:text-3xl font-bold mb-4">
              Ready to Transform Your Organization?
            </h3>
            <p className="text-lg mb-6 opacity-90">
              Join hundreds of organizations already benefiting from ConveLabs partnerships
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="bg-white text-gray-900 hover:bg-gray-100 px-8 py-3 rounded-xl font-semibold text-lg transition-all duration-300">
                Schedule Partnership Discussion
              </button>
              <button className="border-2 border-white text-white hover:bg-white hover:text-gray-900 px-8 py-3 rounded-xl font-semibold text-lg transition-all duration-300">
                Download Partnership Guide
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default IndustryTabs;