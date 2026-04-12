
import React from "react";

interface TestimonialCardProps {
  quote: string;
  author: string;
  role?: string;
  rating?: number;
  image?: string;
}

const TestimonialCard = ({ quote, author, role, rating = 5, image }: TestimonialCardProps) => {
  return (
    <div className="luxury-card p-8 h-full border border-gray-100 shadow-md">
      {/* Star Rating */}
      <div className="flex items-center mb-6">
        {[...Array(rating)].map((_, i) => (
          <svg key={i} xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#B91C1C" stroke="none" className="flex-shrink-0">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        ))}
      </div>
      
      {/* Quote */}
      <blockquote className="text-gray-700 mb-8 text-lg">"{quote}"</blockquote>
      
      {/* Author Info */}
      <div className="flex items-center">
        {image ? (
          <img src={image} alt={author} className="w-12 h-12 rounded-full mr-4" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-conve-red/10 text-conve-red flex items-center justify-center mr-4 font-medium">
            {author.split(' ').map(name => name[0]).join('')}
          </div>
        )}
        <div>
          <div className="font-bold text-gray-900">{author}</div>
          {role && <div className="text-gray-500 text-sm">{role}</div>}
        </div>
      </div>
    </div>
  );
};

export default TestimonialCard;
