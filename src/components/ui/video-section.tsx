
import React from 'react';
import { YoutubeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface VideoSectionProps {
  videoId: string;
  title?: string;
  description?: string;
  className?: string;
  ctaText?: string;
  ctaLink?: string;
}

export function VideoSection({
  videoId,
  title,
  description,
  className = '',
  ctaText,
  ctaLink
}: VideoSectionProps) {
  return (
    <section className={`py-16 md:py-20 ${className}`}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          {title && <h2 className="text-3xl md:text-4xl font-bold mb-4">{title}</h2>}
          {description && <p className="text-lg text-gray-700 max-w-2xl mx-auto">{description}</p>}
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-0">
          <div className="relative pb-[56.25%] h-0 overflow-hidden rounded-lg sm:rounded-xl shadow-xl">
            <iframe 
              src={`https://www.youtube.com/embed/${videoId}?rel=0&controls=1&showinfo=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute top-0 left-0 w-full h-full border-0"
              title={title || "ConveLabs Video"}
              loading="lazy"
            />
          </div>
          
          <div className="mt-4 flex items-center justify-center text-sm text-gray-500">
            <YoutubeIcon className="h-4 w-4 mr-1" />
            <span>Watch on YouTube for the full experience</span>
          </div>
          
          {ctaText && ctaLink && (
            <div className="mt-8 text-center">
              <Button asChild>
                <Link to={ctaLink}>{ctaText}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
