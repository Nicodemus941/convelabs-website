import React from 'react';
import { motion } from 'framer-motion';
import { IndustryContent } from '@/types/b2bTypes';
import { Check, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface IndustryValuePropProps {
  content: IndustryContent;
  isActive: boolean;
}

const IndustryValueProp: React.FC<IndustryValuePropProps> = ({ content, isActive }) => {
  if (!isActive) return null;

  const scrollToCalculator = () => {
    const element = document.getElementById('roi-calculator');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
      className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
    >
      {/* Content Section */}
      <div>
        <h3 className="text-3xl md:text-4xl font-bold text-gray-800 mb-6">
          {content.headline}
        </h3>
        <p className="text-xl text-gray-600 mb-8 leading-relaxed">
          {content.description}
        </p>

        <div className="space-y-4 mb-8">
          {content.benefits.map((benefit, index) => (
            <motion.div
              key={index}
              className="flex items-start gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <div className="bg-green-100 p-1 rounded-full flex-shrink-0 mt-1">
                <Check className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-gray-700 font-medium text-lg">{benefit}</span>
            </motion.div>
          ))}
        </div>

        <Button 
          onClick={scrollToCalculator}
          size="lg"
          className="bg-conve-red hover:bg-conve-red-dark text-white px-8 py-4 h-auto text-lg font-semibold shadow-luxury-red"
        >
          {content.cta}
          <TrendingUp className="ml-2 w-5 h-5" />
        </Button>
      </div>

      {/* Visual Section */}
      <div className="relative">
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-3xl p-8 border border-gray-100">
          <div className="text-center mb-6">
            <h4 className="text-2xl font-bold text-gray-800 mb-2">
              Partnership Impact
            </h4>
            <p className="text-gray-600">
              Typical results for {content.name.toLowerCase()}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {content.id === 'healthcare' ? '$50K-200K' : 
                 content.id === 'talent' ? '$25K-100K' :
                 content.id === 'sports' ? '$500K-2M' :
                 '$100K-500K'}
              </div>
              <div className="text-gray-600">
                {content.id === 'healthcare' ? 'Additional Revenue' :
                 content.id === 'talent' ? 'Booking Protection' :
                 content.id === 'sports' ? 'Injury Prevention Savings' :
                 'Healthcare Cost Reduction'}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {content.id === 'healthcare' ? '40%+' :
                 content.id === 'talent' ? '35%' :
                 content.id === 'sports' ? '60%' :
                 '25%'}
              </div>
              <div className="text-gray-600">
                {content.id === 'healthcare' ? 'Patient Satisfaction' :
                 content.id === 'talent' ? 'Talent Retention' :
                 content.id === 'sports' ? 'Injury Reduction' :
                 'Productivity Increase'}
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-gradient-to-r from-conve-red/10 to-purple-700/10 rounded-xl">
            <p className="text-center text-gray-700 font-medium">
              "ConveLabs partnership has transformed our {content.id === 'healthcare' ? 'practice' : 'organization'} 
              with measurable results in just 6 months."
            </p>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute -top-4 -right-4 w-24 h-24 bg-conve-red/10 rounded-full blur-xl" />
        <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-purple-500/10 rounded-full blur-xl" />
      </div>
    </motion.div>
  );
};

export default IndustryValueProp;