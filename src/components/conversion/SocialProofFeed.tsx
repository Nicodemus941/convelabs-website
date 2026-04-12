import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, Clock, Users, TrendingUp } from 'lucide-react';
import { useConversionOptimization } from '@/contexts/ConversionOptimizationContext';
import { cn } from '@/lib/utils';

interface SocialProofFeedProps {
  position?: 'floating' | 'inline' | 'sidebar';
  maxItems?: number;
  autoRotate?: boolean;
  className?: string;
}

export const SocialProofFeed: React.FC<SocialProofFeedProps> = ({
  position = 'inline',
  maxItems = 3,
  autoRotate = true,
  className
}) => {
  const { socialProofData } = useConversionOptimization();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visibleItems, setVisibleItems] = useState(socialProofData.slice(0, maxItems));
  
  // Auto-rotate social proof items
  useEffect(() => {
    if (!autoRotate || socialProofData.length <= maxItems) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const newIndex = (prev + 1) % socialProofData.length;
        return newIndex;
      });
    }, 4000);
    
    return () => clearInterval(interval);
  }, [autoRotate, socialProofData.length, maxItems]);
  
  // Update visible items when index changes
  useEffect(() => {
    const startIndex = currentIndex;
    const items = [];
    for (let i = 0; i < maxItems; i++) {
      const index = (startIndex + i) % socialProofData.length;
      items.push(socialProofData[index]);
    }
    setVisibleItems(items);
  }, [currentIndex, maxItems, socialProofData]);
  
  const getItemIcon = (type: string) => {
    switch (type) {
      case 'booking':
        return <Users className="h-4 w-4 text-green-500" />;
      case 'availability':
        return <Clock className="h-4 w-4 text-orange-500" />;
      case 'testimonial':
        return <Star className="h-4 w-4 text-yellow-500" />;
      case 'urgency':
        return <TrendingUp className="h-4 w-4 text-red-500" />;
      default:
        return <Users className="h-4 w-4 text-blue-500" />;
    }
  };
  
  const getItemStyle = (type: string, urgent?: boolean) => {
    if (urgent) {
      return 'border-red-200 bg-red-50 text-red-800';
    }
    
    switch (type) {
      case 'booking':
        return 'border-green-200 bg-green-50 text-green-800';
      case 'availability':
        return 'border-orange-200 bg-orange-50 text-orange-800';
      case 'testimonial':
        return 'border-yellow-200 bg-yellow-50 text-yellow-800';
      default:
        return 'border-blue-200 bg-blue-50 text-blue-800';
    }
  };
  
  if (position === 'floating') {
    return (
      <div className={cn(
        'fixed bottom-20 left-4 z-40 space-y-2 max-w-sm',
        'hidden md:block', // Hide on mobile to avoid conflicting with sticky button
        className
      )}>
        {visibleItems.map((item, index) => (
          <Card
            key={`${item.type}-${index}-${currentIndex}`}
            className={cn(
              'p-3 shadow-lg transition-all duration-500 transform',
              'animate-in slide-in-from-left-full',
              getItemStyle(item.type, item.urgent)
            )}
          >
            <div className="flex items-start gap-3">
              {getItemIcon(item.type)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight">
                  {item.message}
                </p>
                {item.timestamp && (
                  <p className="text-xs opacity-75 mt-1">
                    {item.timestamp}
                  </p>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }
  
  if (position === 'sidebar') {
    return (
      <div className={cn('space-y-3', className)}>
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Live Activity
        </h3>
        {visibleItems.map((item, index) => (
          <div
            key={`${item.type}-${index}-${currentIndex}`}
            className="flex items-start gap-2 p-2 rounded-lg bg-muted/50"
          >
            {getItemIcon(item.type)}
            <div className="flex-1 min-w-0">
              <p className="text-xs leading-tight">
                {item.message}
              </p>
              {item.timestamp && (
                <p className="text-xs text-muted-foreground mt-1">
                  {item.timestamp}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  // Inline position (default)
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {visibleItems.map((item, index) => (
        <Badge
          key={`${item.type}-${index}-${currentIndex}`}
          variant="secondary"
          className={cn(
            'flex items-center gap-1 px-3 py-1 transition-all duration-500',
            'animate-in fade-in-50',
            item.urgent && 'animate-pulse'
          )}
        >
          {getItemIcon(item.type)}
          <span className="text-xs font-medium">
            {item.message}
          </span>
        </Badge>
      ))}
    </div>
  );
};