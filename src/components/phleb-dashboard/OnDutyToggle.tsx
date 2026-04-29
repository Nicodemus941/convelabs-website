/**
 * OnDutyToggle — phleb-side after-hours availability switch
 *
 * Sets phleb_duty_status.duty_through via set_my_duty_status RPC. The patient
 * slot picker reads is_any_phleb_on_duty_for_slot() to know whether to show
 * after-hours slots (post-6 PM).
 *
 * Behavior:
 *   - Off: duty_through cleared. After-hours slots stay locked.
 *   - "Until midnight": duty_through = today 11:59 PM ET.
 *   - "+4 hours": duty_through = now() + 4hr.
 *   - Future bookings made while on-duty stay valid even after toggling off.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Moon, Power, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const OnDutyToggle: React.FC<{ variant?: 'desktop' | 'mobile' }> = ({ variant = 'desktop' }) => {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [dutyThrough, setDutyThrough] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_duty_status' as any);
        if (cancelled) return;
        if (error) {
          console.warn('[on-duty] load:', error);
        } else if (data) {
          const dt = (data as any)?.duty_through;
          if (dt) {
            const parsed = new Date(dt);
            setDutyThrough(parsed > new Date() ? parsed : null);
          } else {
            setDutyThrough(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isOnDuty = !!dutyThrough && dutyThrough > new Date();

  async function setDuty(through: Date | null) {
    setUpdating(true);
    try {
      const { error } = await supabase.rpc('set_my_duty_status' as any, { p_duty_through: through?.toISOString() || null });
      if (error) {
        toast.error(`Couldn't update duty: ${error.message}`);
        return;
      }
      setDutyThrough(through);
      setOpen(false);
      if (through) {
        toast.success(`On duty until ${through.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`);
      } else {
        toast.success('Off duty — after-hours slots closed');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
    } finally {
      setUpdating(false);
    }
  }

  function until4Hr() {
    // Preserve current minute — previously zeroed minutes which made
    // "4 hours" at 5:45 AM resolve to 9:00 AM (4h - 45min). Now stays
    // a true 4 hours.
    const t = new Date();
    t.setHours(t.getHours() + 4);
    setDuty(t);
  }
  function untilEndOfDay() {
    // 8 PM local — covers a typical phleb workday from any morning start.
    // Most-tapped option; placed first.
    const t = new Date();
    t.setHours(20, 0, 0, 0);
    // If it's already past 8 PM, fall back to midnight.
    if (t < new Date()) t.setHours(23, 59, 59, 999);
    setDuty(t);
  }
  function untilMidnight() {
    const t = new Date();
    t.setHours(23, 59, 59, 999);
    setDuty(t);
  }

  if (loading) {
    return (
      <button disabled className={`inline-flex items-center gap-1.5 rounded-full ${variant === 'mobile' ? 'bg-white/10 text-white/80' : 'bg-gray-100 text-gray-500'} px-3 py-1.5 text-xs`}>
        <Loader2 className="h-3 w-3 animate-spin" /> Duty…
      </button>
    );
  }

  // Visual state
  const dotColor = isOnDuty ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400';
  const label = isOnDuty
    ? `On duty · until ${dutyThrough!.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : 'Off duty';

  const buttonClass = variant === 'mobile'
    ? `inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 text-xs font-medium transition`
    : `inline-flex items-center gap-1.5 rounded-full ${isOnDuty ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-gray-100 text-gray-700 border border-gray-200'} hover:opacity-90 px-3 py-1.5 text-xs font-medium transition`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={buttonClass}
        disabled={updating}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <span className="truncate max-w-[140px] sm:max-w-none">{label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
            <div className="px-4 py-3 border-b">
              <p className="font-semibold text-sm text-gray-900">After-hours availability</p>
              <p className="text-[11px] text-gray-500 mt-0.5">When on duty, patients can book slots past 6 PM. Already-scheduled visits stay regardless.</p>
            </div>
            <div className="p-2 space-y-1">
              {!isOnDuty ? (
                <>
                  <button
                    onClick={untilEndOfDay}
                    disabled={updating}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-emerald-50 border border-emerald-200 bg-emerald-50/40 transition flex items-center gap-2.5"
                  >
                    <Sun className="h-4 w-4 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">On duty for the workday</p>
                      <p className="text-[11px] text-emerald-700">Auto-ends at 8:00 PM · most-tapped</p>
                    </div>
                  </button>
                  <button
                    onClick={until4Hr}
                    disabled={updating}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 transition flex items-center gap-2.5"
                  >
                    <Power className="h-4 w-4 text-emerald-600" />
                    <div>
                      <p className="text-sm font-medium">On duty for 4 hours</p>
                      <p className="text-[11px] text-gray-500">Auto-ends at {(() => { const t = new Date(); t.setHours(t.getHours() + 4); return t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); })()}</p>
                    </div>
                  </button>
                  <button
                    onClick={untilMidnight}
                    disabled={updating}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 transition flex items-center gap-2.5"
                  >
                    <Moon className="h-4 w-4 text-emerald-600" />
                    <div>
                      <p className="text-sm font-medium">On duty until midnight</p>
                      <p className="text-[11px] text-gray-500">Auto-ends at 12:00 AM</p>
                    </div>
                  </button>
                </>
              ) : (
                <>
                  <div className="px-3 py-2 bg-emerald-50 rounded-lg">
                    <p className="text-xs text-emerald-800">
                      Currently on duty until <strong>{dutyThrough!.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</strong>.
                    </p>
                  </div>
                  <button
                    onClick={() => setDuty(null)}
                    disabled={updating}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-red-50 transition flex items-center gap-2.5"
                  >
                    <Power className="h-4 w-4 text-red-600" />
                    <div>
                      <p className="text-sm font-medium text-red-700">Go off duty</p>
                      <p className="text-[11px] text-gray-500">Closes future after-hours slots. Existing bookings stay.</p>
                    </div>
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default OnDutyToggle;
