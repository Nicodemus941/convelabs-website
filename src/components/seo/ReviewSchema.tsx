import React from 'react';
import { Helmet } from 'react-helmet-async';

interface ReviewSchemaProps {
  businessName: string;
  ratingValue: string;
  reviewCount: string;
  reviews: Array<{
    author: string;
    rating: string;
    reviewBody: string;
    datePublished?: string;
  }>;
}

export const ReviewSchema: React.FC<ReviewSchemaProps> = ({ 
  businessName, 
  ratingValue, 
  reviewCount, 
  reviews 
}) => {
  const reviewSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": businessName,
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": ratingValue,
      "reviewCount": reviewCount,
      "bestRating": "5",
      "worstRating": "1"
    },
    "review": reviews.map(review => ({
      "@type": "Review",
      "author": {
        "@type": "Person",
        "name": review.author
      },
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": review.rating,
        "bestRating": "5",
        "worstRating": "1"
      },
      "reviewBody": review.reviewBody,
      "datePublished": review.datePublished || new Date().toISOString().split('T')[0]
    }))
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(reviewSchema)}
      </script>
    </Helmet>
  );
};