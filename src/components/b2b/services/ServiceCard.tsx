import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface ServiceCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  features: string[];
  index: number;
}

const ServiceCard: React.FC<ServiceCardProps> = ({ 
  icon: Icon, 
  title, 
  description, 
  features, 
  index 
}) => {
  return (
    <motion.div
      className="bg-white rounded-2xl p-8 shadow-luxury hover:shadow-luxury-hover transition-all duration-300 h-full"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      viewport={{ once: true }}
      whileHover={{ y: -5 }}
    >
      <div className="flex items-center gap-4 mb-6">
        <div className="bg-gradient-to-br from-conve-red to-purple-700 p-3 rounded-xl">
          <Icon className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-gray-800">{title}</h3>
      </div>
      
      <p className="text-gray-600 text-lg mb-6 leading-relaxed">{description}</p>
      
      <ul className="space-y-3">
        {features.map((feature, featureIndex) => (
          <motion.li
            key={featureIndex}
            className="flex items-start gap-3"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: (index * 0.1) + (featureIndex * 0.05) }}
            viewport={{ once: true }}
          >
            <div className="w-2 h-2 bg-conve-red rounded-full mt-2 flex-shrink-0" />
            <span className="text-gray-700 font-medium">{feature}</span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
};

export default ServiceCard;