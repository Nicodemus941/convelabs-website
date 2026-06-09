import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Unlink, Loader2 } from 'lucide-react';

/**
 * UnassignOrgButton — admin-only. Removes ALL organization links from an
 * appointment (primary + cc) and clears the lab-order match, so the practice
 * receives NO further notifications (the specimen-delivery notifier loops
 * appointment_organizations / appointments.organization_id — both cleared).
 * Two-click confirm to prevent accidents. Admin-gated server-side via
 * admin_unassign_appointment_orgs (is_admin).
 */
interface Props {
  appointmentId: string;
  size?: 'sm' | 'default';
  className?: string;
  onUnassigned?: () => void;
}

const UnassignOrgButton: React.FC<Props> = ({ appointmentId, size = 'sm', className, onUnassigned }) => {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const doUnassign = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('admin_unassign_appointment_orgs' as any, {
        p_appointment_id: appointmentId,
      });
      if (error) throw error;
      const res = data as any;
      if (res?.ok === false) throw new Error(res.reason === 'not_admin' ? 'Admin access required.' : (res.reason || 'Failed'));
      const n = res?.removed_count ?? 0;
      toast.success(n > 0
        ? `Unassigned ${res.removed || 'organization'} — they'll receive no further notifications.`
        : 'No organization was linked.');
      onUnassigned?.();
    } catch (e: any) {
      toast.error(e?.message || 'Could not unassign the organization.');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button size={size} variant="destructive" className={`gap-1.5 ${className || ''}`} onClick={doUnassign} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
          Confirm unassign
        </Button>
        <Button size={size} variant="ghost" className="text-xs" onClick={() => setConfirming(false)} disabled={busy}>
          Cancel
        </Button>
      </span>
    );
  }

  return (
    <Button size={size} variant="outline" className={`gap-1.5 text-red-700 border-red-200 hover:bg-red-50 ${className || ''}`} onClick={() => setConfirming(true)}>
      <Unlink className="h-3.5 w-3.5" /> Unassign org
    </Button>
  );
};

export default UnassignOrgButton;
