
import React, { useState } from "react";
import TestimonialCard from "./TestimonialCard";
import { ArrowLeft, ArrowRight, Play, Youtube } from "lucide-react";
import { VideoSection } from "@/components/ui/video-section";
import { motion } from "framer-motion";

const TestimonialsSection = () => {
  return (
    <section className="py-12 sm:py-16 md:py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <motion.div 
          className="max-w-3xl mx-auto text-center mb-8 sm:mb-12 md:mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-6">What Our Members Say</h2>
          <p className="text-lg text-gray-700">
            Hear from our satisfied members about their ConveLabs experience.
          </p>
        </motion.div>

        {/* Video Testimonials - Improved alignment */}
        <motion.div 
          className="grid md:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 mb-8 sm:mb-12 md:mb-16 max-w-6xl mx-auto"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, staggerChildren: 0.3 }}
        >
          <motion.div 
            className="flex flex-col h-full"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-white p-4 rounded-xl shadow-md mb-3">
              <VideoSection 
                videoId="Src-0AB2irI"
                title="Client Success Story"
                description="Listen to how our service has transformed this client's healthcare experience."
                className="py-0" 
              />
            </div>
            <p className="text-sm text-gray-500 italic text-center">
              "The ConveLabs experience exceeded all my expectations."
            </p>
          </motion.div>
          
          <motion.div 
            className="flex flex-col h-full"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="bg-white p-4 rounded-xl shadow-md mb-3">
              <VideoSection 
                videoId="pVf9KnZzc5A"
                title="Member Experience"
                description="Former NFL linebacker Deiontrez Mount shares his experience with ConveLabs' luxurious concierge lab services. From the comfort of his home, Deiontrez highlights how ConveLabs provided elite, on-demand bloodwork and wellness testing tailored to his lifestyle."
                className="py-0" 
              />
            </div>
            <p className="text-sm text-gray-500 italic text-center">
              "Premium healthcare delivered to my doorstep, on my schedule."
            </p>
          </motion.div>
        </motion.div>

        <div className="relative">
          <div className="grid md:grid-cols-3 gap-8">
            <TestimonialCard 
              quote="ConveLabs has transformed how I manage my health. The convenience of having a professional come to my home for lab work is invaluable with my busy schedule."
              author="Michael R."
              role="Executive"
              rating={5}
            />
            
            <TestimonialCard 
              quote="As a TRT patient requiring regular lab work, ConveLabs has been a game-changer. The phlebotomists are professional and the booking process is seamless."
              author="David L."
              role="TRT Patient"
              rating={5}
            />
            
            <TestimonialCard 
              quote="My practice has partnered with ConveLabs to offer additional convenience to our patients. The feedback has been outstanding and the service is impeccable."
              author="Dr. Sarah M."
              role="Concierge Physician"
              rating={5}
            />
          </div>
          
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
