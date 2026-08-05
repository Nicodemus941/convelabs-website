import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { landingRouteForTarget } from '@/lib/appTarget';

/**
 * On a native launch the app opens at "/" (the marketing home, which we don't
 * want inside the app). Redirect that initial root entry to this build's home
 * — patient dashboard or phleb app — while leaving deep links to other paths
 * untouched. Renders nothing and does nothing on the website build.
 */
export function NativeLaunchRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (location.pathname === '/') {
      navigate(landingRouteForTarget(), { replace: true });
    }
    // Run once on mount; deep links handled separately in initNativeApp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
