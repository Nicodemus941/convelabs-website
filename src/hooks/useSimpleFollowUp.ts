import { useState, useEffect } from 'react';
import { simpleFollowUpService, SimpleFollowUpAction } from '@/services/SimpleFollowUpService';
import { useConversionOptimization } from '@/contexts/ConversionOptimizationContext';

export const useSimpleFollowUp = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const { visitorId, hasBookingIntent } = useConversionOptimization();

  useEffect(() => {
    if (!isInitialized && visitorId) {
      initializeFollowUpTracking();
      setIsInitialized(true);
    }
  }, [visitorId, isInitialized]);

  const initializeFollowUpTracking = () => {
    // Track page abandonment
    const handleBeforeUnload = () => {
      if (hasBookingIntent && !localStorage.getItem('booking_completed')) {
        scheduleFollowUp('immediate', 'warm');
      }
    };

    // Track inactivity
    let inactivityTimer: NodeJS.Timeout;
    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        if (hasBookingIntent) {
          scheduleFollowUp('1hour', 'warm');
        }
      }, 300000); // 5 minutes of inactivity
    };

    const handleActivity = () => {
      resetInactivityTimer();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('scroll', handleActivity);
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keypress', handleActivity);

    resetInactivityTimer();

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('scroll', handleActivity);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keypress', handleActivity);
      clearTimeout(inactivityTimer);
    };
  };

  const scheduleFollowUp = async (
    timing: 'immediate' | '1hour' | '24hour',
    leadGrade: 'hot' | 'warm' | 'cold'
  ) => {
    if (!visitorId) return;

    const action: SimpleFollowUpAction = {
      sessionId: visitorId,
      actionType: timing === 'immediate' ? 'exit_popup' : 'email_reminder',
      triggerType: timing,
      message: getFollowUpMessage(leadGrade, timing),
      leadGrade
    };

    await simpleFollowUpService.scheduleFollowUp(action);
  };

  const getFollowUpMessage = (leadGrade: string, timing: string): string => {
    if (leadGrade === 'hot') {
      return timing === 'immediate' 
        ? "Don't miss out on premium health services!"
        : "Your personalized health package is ready";
    }
    if (leadGrade === 'warm') {
      return timing === 'immediate'
        ? "Still considering our services?"
        : "We're here to answer any questions";
    }
    return "Learn more about convenient health services";
  };

  const triggerImmediateFollowUp = async (leadGrade: 'hot' | 'warm' | 'cold' = 'warm') => {
    await scheduleFollowUp('immediate', leadGrade);
  };

  const markBookingCompleted = () => {
    localStorage.setItem('booking_completed', 'true');
    sessionStorage.setItem('conversion_completed', 'true');
  };

  const trackFollowUpResponse = async (responseType: 'opened' | 'clicked' | 'converted') => {
    if (!visitorId) return;
    await simpleFollowUpService.trackFollowUpResponse(visitorId, responseType);
  };

  return {
    scheduleFollowUp,
    triggerImmediateFollowUp,
    markBookingCompleted,
    trackFollowUpResponse,
    isInitialized
  };
};