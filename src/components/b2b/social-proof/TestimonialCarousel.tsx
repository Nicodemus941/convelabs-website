import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { testimonials } from '@/data/b2bContent';
import { Quote, ChevronLeft, ChevronRight } from 'lucide-react';
import { IndustryType } from '@/types/b2bTypes';

interface TestimonialCarouselProps {
  selectedIndustry?: IndustryType;
}

const TestimonialCarousel: React.FC<TestimonialCarouselProps> = ({ selectedIndustry = 'healthcare' }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Filter testimonials by industry
  const industryTestimonials = testimonials.filter(
    testimonial => testimonial.industry === selectedIndustry
  );
  
  // If no industry-specific testimonials, show all
  const displayTestimonials = industryTestimonials.length > 0 ? industryTestimonials : testimonials;

  // Auto-rotate testimonials
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % displayTestimonials.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [displayTestimonials.length]);

  // Reset index when industry changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [selectedIndustry]);

  const nextTestimonial = () => {
    setCurrentIndex((prev) => (prev + 1) % displayTestimonials.length);
  };

  const prevTestimonial = () => {
    setCurrentIndex((prev) => (prev - 1 + displayTestimonials.length) % displayTestimonials.length);
  };

  if (displayTestimonials.length === 0) {
    return null;
  }

  const currentTestimonial = displayTestimonials[currentIndex];

  return (
    <div className="relative bg-white rounded-2xl p-8 shadow-luxury">
      <div className="flex items-center justify-between mb-6">
        <Quote className="w-8 h-8 text-conve-red" />
        <div className="flex gap-2">
          <button
            onClick={prevTestimonial}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            disabled={displayTestimonials.length <= 1}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={nextTestimonial}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            disabled={displayTestimonials.length <= 1}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentTestimonial.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4 }}
        >
          <blockquote className="text-lg md:text-xl text-gray-700 mb-6 leading-relaxed">
            "{currentTestimonial.quote}"
          </blockquote>
          
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-conve-red to-purple-700 rounded-full flex items-center justify-center text-white font-bold text-lg">
              {currentTestimonial.name.charAt(0)}
            </div>
            <div>
              <div className="font-semibold text-gray-800">
                {currentTestimonial.name}
              </div>
              <div className="text-gray-600">
                {currentTestimonial.title}, {currentTestimonial.company}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Dots Indicator */}
      {displayTestimonials.length > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {displayTestimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentIndex ? 'bg-conve-red' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TestimonialCarousel;