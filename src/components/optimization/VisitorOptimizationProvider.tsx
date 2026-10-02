import React, { createContext, useContext, useEffect, useState } from 'react';
import { useVisitorOptimization } from '@/hooks/useVisitorOptimization';
import ExitIntentPopup from './ExitIntentPopup';
import { WebhookProvider } from './WebhookProvider';
import { useSimpleFollowUp } from '@/hooks/useSimpleFollowUp';

interface VisitorOptimizationContextType {
  analysis: any;
  isLoading: boolean;
  sessionId: string;
  trackCTAClick: (ctaText: string, location: string) => void;
  trackFormStart: (formName: string) => void;
  trackFormComplete: (formName: string) => void;
  trackVideoPlay: (videoId: string) => void;
}

const VisitorOptimizationContext = createContext<VisitorOptimizationContextType | undefined>(undefined);

export const useVisitorOptimizationContext = () => {
  const context = useContext(VisitorOptimizationContext);
  if (!context) {
    throw new Error('useVisitorOptimizationContext must be used within VisitorOptimizationProvider');
  }
  return context;
};

interface VisitorOptimizationProviderProps {
  children: React.ReactNode;
}

export const VisitorOptimizationProvider = ({ children }: VisitorOptimizationProviderProps) => {
  const optimization = useVisitorOptimization();
  const [showExitIntent, setShowExitIntent] = useState(false);
  const followUpAutomation = useSimpleFollowUp();

  // Track page views and analyze visitor after some interaction
  useEffect(() => {
    const pageViews = [
      {
        path: window.location.pathname,
        timeOnPage: Date.now(),
        interactions: [],
        timestamp: new Date().toISOString()
      }
    ];

    // Analyze visitor after 30 seconds of activity
    const timer = setTimeout(() => {
      // Visitor analysis retired 2026-09-28 -- see
      // supabase/functions/analyze-visitor-behavior/index.ts. It spent a
      // month returning one hardcoded answer to every visitor while
      // reporting success, and nothing ever read what it stored.
      // optimization.analyzeVisitor(pageViews, []);

      // Track page visit for follow-up automation (simplified)
      console.log('Page visit tracked:', window.location.pathname);
    }, 30000);

    return () => clearTimeout(timer);
  }, [optimization]);

  // Exit-intent modal retired 2026-10-02. SmartExitIntentModal was the only
  // writer to `abandoned_bookings`, but it only mounted here (the home page,
  // not /book-now), only fired on a desktop mouse-leave after a 500px scroll,
  // once per browser — and promised a 10% code nothing ever sent. The table
  // never got a row. Booking drafts are now captured on /book-now by
  // src/hooks/useBookingDraft.ts, which is the single capture path.

  const handleCloseExitIntent = () => {
    setShowExitIntent(false);
  };

  const contextValue: VisitorOptimizationContextType = {
    analysis: optimization.analysis,
    isLoading: optimization.isLoading,
    sessionId: optimization.sessionId,
    trackCTAClick: optimization.trackCTAClick,
    trackFormStart: optimization.trackFormStart,
    trackFormComplete: optimization.trackFormComplete,
    trackVideoPlay: optimization.trackVideoPlay
  };

  return (
    <VisitorOptimizationContext.Provider value={contextValue}>
      <WebhookProvider>
        {children}

        <ExitIntentPopup
          isOpen={showExitIntent}
          onClose={handleCloseExitIntent}
          visitorProfile={optimization.analysis?.visitor_analysis?.profile}
        />
      </WebhookProvider>
    </VisitorOptimizationContext.Provider>
  );
};
