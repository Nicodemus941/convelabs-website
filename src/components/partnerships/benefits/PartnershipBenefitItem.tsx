
import React from "react";
import { motion } from "framer-motion";

interface PartnershipBenefitItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
}

const PartnershipBenefitItem: React.FC<PartnershipBenefitItemProps> = ({ 
  icon, 
  title, 
  description, 
  delay = 0 
}) => {
  return (
    <motion.div
      className="bg-white p-6 rounded-xl shadow-md"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      viewport={{ once: true }}
    >
      <div className="bg-conve-red/10 p-3 rounded-full w-12 h-12 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </motion.div>
  );
};

export default PartnershipBenefitItem;
