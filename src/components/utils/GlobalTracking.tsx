
import React from 'react';
import useGlobalTracking from '@/hooks/useGlobalTracking';

interface GlobalTrackingProps {
  enablePageViewTracking?: boolean;
}

const GlobalTracking: React.FC<GlobalTrackingProps> = ({ 
  enablePageViewTracking = true 
}) => {
  try {
    // This component doesn't render anything, it just sets up the tracking
    useGlobalTracking(enablePageViewTracking);
  } catch (error) {
    console.error('Error initializing tracking:', error);
  }
  return null;
};

export default GlobalTracking;
