
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const usePageViewTracking = () => {
  const location = useLocation();
  let userId = null;
  
  // Try to get user ID if auth is available, but don't fail if not
  try {
    const { user } = useAuth();
    userId = user?.id || null;
  } catch (error) {
    console.log('Auth context not available for tracking, proceeding anonymously');
  }
  
  useEffect(() => {
    const trackPageView = async () => {
      if (!location.pathname) return;

      try {
        // Track page view using edge function
        await supabase.functions.invoke('track-page-view', {
          body: {
            path: location.pathname,
            referrer: document.referrer || null,
            userAgent: navigator.userAgent,
            userId: userId
          }
        });
        
        console.log('Page view tracked:', location.pathname);
      } catch (error) {
        // Log the error but don't crash the application
        console.error('Failed to track page view:', error);
      }
    };
    
    // Track the page view with a small delay to ensure components are mounted
    const timeoutId = setTimeout(() => {
      trackPageView();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [location.pathname, userId]);
};

export default usePageViewTracking;
