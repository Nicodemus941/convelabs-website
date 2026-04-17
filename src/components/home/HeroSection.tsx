
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin } from 'lucide-react';

const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        when: "beforeChildren",
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
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
    <motion.div 
      className="bg-gradient-to-b from-white to-gray-50 py-20 px-4"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <motion.div className="space-y-6" variants={containerVariants}>
            <motion.h1 
              className="text-4xl md:text-5xl font-bold tracking-tight"
              variants={itemVariants}
            >
              Elite Mobile Lab Services - Trusted by Orlando's Top Executives & Leading Corporations
            </motion.h1>
            <motion.p 
              className="text-xl text-gray-600"
              variants={itemVariants}
            >
              The #1 choice for high-performing professionals, executives, and corporate wellness programs. Structured protocols meet white-glove service for TRT monitoring, executive health, and enterprise solutions.
            </motion.p>
            <motion.div 
              className="flex flex-col sm:flex-row gap-4"
              variants={itemVariants}
            >
              <motion.div 
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <Button 
                  size="lg" 
                  className="text-lg"
                  onClick={() => navigate('/book-now')}
                >
                  <Calendar className="mr-2 h-5 w-5" />
                  Book an Appointment
                </Button>
              </motion.div>
              <motion.div 
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <Button 
                  variant="outline" 
                  size="lg"
                  className="text-lg"
                  onClick={() => navigate('/about')}
                >
                  Learn More
                </Button>
              </motion.div>
            </motion.div>
            <motion.div 
              className="flex items-center text-sm text-gray-500"
              variants={itemVariants}
            >
              <MapPin className="h-4 w-4 mr-1" />
              <span>Serving Orlando, Tampa, and all of Central Florida</span>
            </motion.div>
          </motion.div>
          <motion.div 
            className="hidden md:block"
            variants={itemVariants}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          >
            <motion.img 
              src="/lovable-uploads/c99a1186-df28-4627-b519-d8f2753e18c2.png" 
              alt="Mobile phlebotomy service" 
              width="1920"
              height="1920"
              className="rounded-xl shadow-lg"
              whileHover={{ 
                scale: 1.02,
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
              }}
              transition={{ duration: 0.4 }}
            />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default HeroSection;
