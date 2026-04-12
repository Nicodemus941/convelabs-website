import React from 'react';
import { motion } from 'framer-motion';
import { IndustryType } from '@/types/b2bTypes';
import { Building2, Users, Trophy, Briefcase } from 'lucide-react';

const industryIcons = {
  healthcare: Building2,
  talent: Users,
  sports: Trophy,
  corporate: Briefcase,
};

const industryLabels = {
  healthcare: 'Healthcare',
  talent: 'Talent',
  sports: 'Sports',
  corporate: 'Corporate',
};

interface IndustrySelectorProps {
  selectedIndustry: IndustryType;
  onIndustryChange: (industry: IndustryType) => void;
  className?: string;
}

const IndustrySelector: React.FC<IndustrySelectorProps> = ({ selectedIndustry, onIndustryChange, className = '' }) => {
  const handleIndustrySelect = (industry: IndustryType) => {
    onIndustryChange(industry);
  };

  return (
    <div className={`flex flex-wrap justify-center gap-4 ${className}`}>
      {(Object.keys(industryIcons) as IndustryType[]).map((industry) => {
        const Icon = industryIcons[industry];
        const isSelected = selectedIndustry === industry;
        
        return (
          <motion.button
            key={industry}
            onClick={() => handleIndustrySelect(industry)}
            className={`
              flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-300
              ${isSelected 
                ? 'bg-conve-red text-white shadow-luxury-red' 
                : 'bg-white/80 text-gray-700 hover:bg-white hover:shadow-luxury border border-gray-200/60'
              }
            `}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: industry === 'healthcare' ? 0.1 : industry === 'talent' ? 0.2 : industry === 'sports' ? 0.3 : 0.4 }}
          >
            <Icon className="w-5 h-5" />
            <span>{industryLabels[industry]}</span>
          </motion.button>
        );
      })}
    </div>
  );
};

export default IndustrySelector;