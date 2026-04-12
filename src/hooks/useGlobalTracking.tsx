
import { useEffect } from 'react';
import usePageViewTracking from './usePageViewTracking';

/**
 * A hook to consolidate all global tracking functions
 * @param {boolean} enablePageViewTracking - Option to enable/disable page view tracking
 */
export const useGlobalTracking = (enablePageViewTracking = true) => {
  // Use page view tracking if enabled
  if (enablePageViewTracking) {
    try {
      usePageViewTracking();
    } catch (error) {
      console.error('Failed to initialize page view tracking:', error);
    }
  }
  
  // Add any other global tracking here
  useEffect(() => {
    // Initialize any other tracking services here
  }, []);
};

export default useGlobalTracking;
