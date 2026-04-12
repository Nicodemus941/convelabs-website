import React from 'react';
import { Badge } from '@/components/ui/badge';
import { useSimpleABTesting } from '@/hooks/useSimpleABTesting';

interface SmartOfferBannerProps {
  experimentName: string;
  fallbackOffer?: string;
  fallbackDiscount?: number;
  className?: string;
}

export const SmartOfferBanner: React.FC<SmartOfferBannerProps> = ({
  experimentName,
  fallbackOffer = 'Limited Time Offer',
  fallbackDiscount = 20,
  className = ''
}) => {
  const { getVariantContent, trackClick } = useSimpleABTesting();

  const variantContent = getVariantContent(experimentName);
  
  // Use variant content or fallback
  const offerText = variantContent?.offerText || fallbackOffer;
  const discountAmount = variantContent?.discountAmount || fallbackDiscount;
  const urgencyMessage = variantContent?.urgencyMessage;

  const handleOfferClick = () => {
    trackClick(experimentName);
  };

  if (!variantContent && !fallbackOffer) {
    return null; // Don't show if no content
  }

  return (
    <div 
      className={`
        bg-gradient-to-r from-red-500 to-red-600 text-white p-4 rounded-lg cursor-pointer
        transform transition-transform hover:scale-105 ${className}
      `}
      onClick={handleOfferClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <Badge variant="secondary" className="bg-white text-red-600 mb-2">
            {discountAmount}% OFF
          </Badge>
          <h3 className="font-bold text-lg">{offerText}</h3>
          {urgencyMessage && (
            <p className="text-sm opacity-90 mt-1">{urgencyMessage}</p>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">${discountAmount}</div>
          <div className="text-sm opacity-90">Savings</div>
        </div>
      </div>
    </div>
  );
};