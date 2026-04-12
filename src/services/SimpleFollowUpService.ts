// Simplified Follow-Up service that works with existing tables
import { supabase } from '@/integrations/supabase/client';

export interface SimpleFollowUpAction {
  sessionId: string;
  actionType: 'exit_popup' | 'email_reminder' | 'sms_follow_up';
  triggerType: 'immediate' | '1hour' | '24hour';
  message: string;
  leadGrade: 'hot' | 'warm' | 'cold';
}

class SimpleFollowUpService {
  async scheduleFollowUp(action: SimpleFollowUpAction): Promise<void> {
    try {
      // Use existing conversion_events table to track follow-up actions
      await supabase
        .from('conversion_events')
        .insert({
          session_id: action.sessionId,
          event_type: 'follow_up_scheduled',
          metadata: {
            action_type: action.actionType,
            trigger_type: action.triggerType,
            message: action.message,
            lead_grade: action.leadGrade,
            scheduled_at: new Date().toISOString()
          }
        });

      console.log('Follow-up scheduled:', action);
    } catch (error) {
      console.error('Error scheduling follow-up:', error);
    }
  }

  async trackFollowUpResponse(sessionId: string, responseType: 'opened' | 'clicked' | 'converted'): Promise<void> {
    try {
      await supabase
        .from('conversion_events')
        .insert({
          session_id: sessionId,
          event_type: 'follow_up_response',
          metadata: {
            response_type: responseType,
            responded_at: new Date().toISOString()
          }
        });
    } catch (error) {
      console.error('Error tracking follow-up response:', error);
    }
  }

  async getFollowUpPerformance(dateRange: { start: string; end: string }) {
    try {
      const { data, error } = await supabase
        .from('conversion_events')
        .select('event_type, metadata, created_at')
        .in('event_type', ['follow_up_scheduled', 'follow_up_response'])
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end);

      if (error) throw error;

      // Analyze performance
      const scheduled = data?.filter(e => e.event_type === 'follow_up_scheduled').length || 0;
      const responses = data?.filter(e => e.event_type === 'follow_up_response').length || 0;
      const conversions = data?.filter(e => 
        e.event_type === 'follow_up_response' && 
        (e.metadata as any)?.response_type === 'converted'
      ).length || 0;

      return {
        totalScheduled: scheduled,
        totalResponses: responses,
        totalConversions: conversions,
        responseRate: scheduled > 0 ? (responses / scheduled) * 100 : 0,
        conversionRate: responses > 0 ? (conversions / responses) * 100 : 0
      };
    } catch (error) {
      console.error('Error getting follow-up performance:', error);
      return {
        totalScheduled: 0,
        totalResponses: 0,
        totalConversions: 0,
        responseRate: 0,
        conversionRate: 0
      };
    }
  }
}

export const simpleFollowUpService = new SimpleFollowUpService();