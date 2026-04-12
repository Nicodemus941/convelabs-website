
import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  fullPage?: boolean;
  variant?: 'default' | 'overlay' | 'inline' | 'skeleton';
  children?: React.ReactNode;
}

const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  size = 'medium',
  className = '',
  fullPage = false,
  variant = 'default',
  children
}) => {
  // Determine container classes based on variant and fullPage props
  const containerClasses = (() => {
    if (fullPage) {
      return 'fixed inset-0 flex items-center justify-center bg-background/80 z-50';
    }
    
    switch (variant) {
      case 'overlay':
        return 'absolute inset-0 flex items-center justify-center bg-background/60 z-10 rounded-md';
      case 'inline':
        return 'inline-flex items-center gap-2';
      case 'skeleton':
        return 'flex flex-col w-full animate-pulse';
      default:
        return 'flex flex-col items-center justify-center py-8';
    }
  })();
  
  // Size classes for the spinner
  const iconSize = {
    small: 'h-4 w-4',
    medium: 'h-8 w-8',
    large: 'h-12 w-12'
  };
  
  // For skeleton variant
  if (variant === 'skeleton') {
    return (
      <div className={`${containerClasses} ${className}`}>
        {children ? children : (
          <>
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
          </>
        )}
      </div>
    );
  }
  
  // For all other variants
  return (
    <div className={`${containerClasses} ${className}`}>
      <Loader2 className={`${iconSize[size]} animate-spin text-primary`} />
      {message && variant !== 'inline' && (
        <p className="mt-2 text-muted-foreground text-sm">{message}</p>
      )}
      {message && variant === 'inline' && (
        <span className="text-muted-foreground text-sm">{message}</span>
      )}
    </div>
  );
};

export default LoadingState;
