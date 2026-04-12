import React, { createContext, useContext, useEffect, useState } from 'react';
import { useVisitorOptimization } from '@/hooks/useVisitorOptimization';
import ExitIntentPopup from './ExitIntentPopup';
import { WebhookProvider } from './WebhookProvider';

import SmartExitIntentModal from '@/components/conversion/SmartExitIntentModal';
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
  const [showSmartExitModal, setShowSmartExitModal] = useState(false);
  const [hasShownExitIntent, setHasShownExitIntent] = useState(false);
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
      optimization.analyzeVisitor(pageViews, []);
      
      // Track page visit for follow-up automation (simplified)
      console.log('Page visit tracked:', window.location.pathname);
    }, 30000);

    return () => clearTimeout(timer);
  }, [optimization]);

  // Set up exit intent detection
  useEffect(() => {
    let exitIntentTimer: NodeJS.Timeout;

    const handleMouseLeave = (e: MouseEvent) => {
      if (
        e.clientY <= 0 && 
        !hasShownExitIntent && 
        window.scrollY > 500 && // Only show if user has scrolled
        !localStorage.getItem('convelabs_exit_intent_shown')
      ) {
        // Show smart exit modal instead of basic popup
        setShowSmartExitModal(true);
        setHasShownExitIntent(true);
        localStorage.setItem('convelabs_exit_intent_shown', 'true');
      }
    };

    const handleFocus = () => {
      clearTimeout(exitIntentTimer);
    };

    const handleBlur = () => {
      exitIntentTimer = setTimeout(() => {
        if (
          !hasShownExitIntent && 
          window.scrollY > 500 &&
          !localStorage.getItem('convelabs_exit_intent_shown')
        ) {
          setShowSmartExitModal(true);
          setHasShownExitIntent(true);
          localStorage.setItem('convelabs_exit_intent_shown', 'true');
        }
      }, 3000); // Show after 3 seconds of inactivity
    };

    document.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      clearTimeout(exitIntentTimer);
    };
  }, [hasShownExitIntent]);

  const handleCloseExitIntent = () => {
    setShowExitIntent(false);
  };

  const handleCloseSmartExitModal = () => {
    setShowSmartExitModal(false);
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

        <SmartExitIntentModal
          isOpen={showSmartExitModal}
          onClose={handleCloseSmartExitModal}
        />
      </WebhookProvider>
    </VisitorOptimizationContext.Provider>
  );
};