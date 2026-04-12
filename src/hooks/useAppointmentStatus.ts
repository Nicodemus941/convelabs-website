import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StatusUpdateParams {
  appointmentId: string;
  status: string;
  etaMinutes?: number;
  specimenLabName?: string;
  specimenTrackingId?: string;
  phlebotomistName?: string;
  patientPhone?: string;
}

export function useAppointmentStatus() {
  const updateStatus = async (params: StatusUpdateParams) => {
    const { appointmentId, status, etaMinutes, specimenLabName, specimenTrackingId } = params;

    const updateData: Record<string, any> = { status };

    if (status === 'en_route' && etaMinutes) {
      updateData.phlebotomist_eta_minutes = etaMinutes;
    }
    if (status === 'in_progress') {
      updateData.job_started_at = new Date().toISOString();
    }
    if (status === 'specimens_delivered') {
      updateData.specimens_delivered_at = new Date().toISOString();
      if (specimenLabName) updateData.specimen_lab_name = specimenLabName;
      if (specimenTrackingId) updateData.specimen_tracking_id = specimenTrackingId;
    }

    const { error } = await supabase
      .from('appointments')
      .update(updateData)
      .eq('id', appointmentId);

    if (error) {
      console.error('Status update failed:', error);
      toast.error('Failed to update status');
      return false;
    }

    // Trigger SMS notification via edge function
    try {
      await supabase.functions.invoke('send-sms-notification', {
        body: {
          appointmentId,
          notificationType: status,
          phlebotomistName: params.phlebotomistName,
          etaMinutes,
          specimenLabName,
          specimenTrackingId,
        },
      });
    } catch (smsErr) {
      console.error('SMS notification failed:', smsErr);
      // Non-blocking
    }

    return true;
  };

  return { updateStatus };
}
