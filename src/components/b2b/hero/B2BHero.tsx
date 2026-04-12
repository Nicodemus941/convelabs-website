import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { industryContent, trustMetrics } from '@/data/b2bContent';
import { IndustryType } from '@/types/b2bTypes';
import IndustrySelector from './IndustrySelector';
import ScheduleDiscussionModal from '../modals/ScheduleDiscussionModal';
import { Button } from '@/components/ui/button';
import { ArrowDown, Shield, Award, Users } from 'lucide-react';

interface B2BHeroProps {
  selectedIndustry: IndustryType;
  onIndustryChange: (industry: IndustryType) => void;
}

const B2BHero: React.FC<B2BHeroProps> = ({ selectedIndustry, onIndustryChange }) => {
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const content = industryContent[selectedIndustry];

  const scrollToCalculator = () => {
    const element = document.getElementById('roi-calculator');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-700 to-conve-red opacity-95" />
      
      {/* Abstract Shapes */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-luxury-float" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-white/5 rounded-full blur-3xl animate-luxury-float" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 container mx-auto px-4 text-center text-white">
        {/* Navigation Header */}
        <motion.div 
          className="flex justify-between items-center mb-16"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">ConveLabs</span>
            <span className="text-sm opacity-80 ml-2">Premium Mobile Health Services</span>
          </div>
          
          <div className="hidden md:flex items-center gap-6 text-sm">
            <button 
              onClick={scrollToCalculator}
              className="hover:text-conve-gold transition-colors"
            >
              ROI Calculator
            </button>
            <button className="hover:text-conve-gold transition-colors">
              Partnerships
            </button>
            <Button 
              variant="outline" 
              onClick={scrollToCalculator}
              className="bg-white/10 border-white/30 text-white hover:bg-white hover:text-gray-900"
            >
              Get Started
            </Button>
          </div>
        </motion.div>

        {/* Industry Selector */}
        <motion.div 
          className="mb-12"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <p className="text-lg mb-6 opacity-90">Choose your industry to see customized benefits:</p>
          <IndustrySelector selectedIndustry={selectedIndustry} onIndustryChange={onIndustryChange} />
        </motion.div>

        {/* Dynamic Hero Content */}
        <motion.div 
          key={selectedIndustry}
          className="max-w-5xl mx-auto mb-12"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            {content.headline}
          </h1>
          <p className="text-xl md:text-2xl mb-8 opacity-90 max-w-3xl mx-auto leading-relaxed">
            {content.subtitle}
          </p>
          <p className="text-lg opacity-80 max-w-2xl mx-auto mb-10">
            {content.description}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg"
              onClick={scrollToCalculator}
              className="bg-white text-gray-900 hover:bg-gray-100 text-lg px-8 py-6 h-auto font-semibold shadow-luxury-red"
            >
              {content.cta}
              <ArrowDown className="ml-2 w-5 h-5" />
            </Button>
            <Button 
              size="lg"
              variant="outline"
              onClick={() => setIsScheduleModalOpen(true)}
              className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-gray-900 text-lg px-8 py-6 h-auto font-semibold"
            >
              Schedule Discussion
            </Button>
          </div>
        </motion.div>

        {/* Trust Indicators */}
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <div className="flex items-center justify-center gap-3">
            <Users className="w-6 h-6 text-conve-gold" />
            <div className="text-left">
              <div className="text-2xl font-bold">{trustMetrics[0].value}</div>
              <div className="text-sm opacity-80">{trustMetrics[0].description}</div>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-3">
            <Award className="w-6 h-6 text-conve-gold" />
            <div className="text-left">
              <div className="text-2xl font-bold">{trustMetrics[1].value}</div>
              <div className="text-sm opacity-80">{trustMetrics[1].description}</div>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-3">
            <Shield className="w-6 h-6 text-conve-gold" />
            <div className="text-left">
              <div className="text-2xl font-bold">{trustMetrics[2].value}</div>
              <div className="text-sm opacity-80">{trustMetrics[2].description}</div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Schedule Discussion Modal */}
      <ScheduleDiscussionModal 
        isOpen={isScheduleModalOpen} 
        onClose={() => setIsScheduleModalOpen(false)} 
      />

      {/* Scroll Indicator */}
      <motion.div 
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <ArrowDown className="w-6 h-6 text-white/60" />
      </motion.div>
    </section>
  );
};

export default B2BHero;