
import React from "react";
import { Star } from "lucide-react";

interface MembershipTestimonialProps {
  testimonial: {
    quote: string;
    author: string;
    role: string;
    image?: string;
  };
}

export const MembershipTestimonial: React.FC<MembershipTestimonialProps> = ({ testimonial }) => {
  return (
    <section className="py-16 bg-conve-light">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 rounded-xl shadow-lg">
          <div className="flex justify-center mb-6">
            {[1, 2, 3, 4, 5].map((_, i) => (
              <Star 
                key={i} 
                className="h-6 w-6 text-conve-gold fill-conve-gold" 
              />
            ))}
          </div>
          
          <blockquote className="text-xl md:text-2xl text-center text-gray-700 mb-8 italic">
            "{testimonial.quote}"
          </blockquote>
          
          <div className="text-center">
            <p className="font-bold">{testimonial.author}</p>
            <p className="text-gray-600">{testimonial.role}</p>
          </div>
        </div>
      </div>
    </section>
  );
};
