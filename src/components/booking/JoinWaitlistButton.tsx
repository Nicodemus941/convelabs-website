/**
 * JoinWaitlistButton
 *
 * Compact CTA + inline modal for joining the slot waitlist. Shown anywhere a
 * patient hits a tier-locked or fully-booked slot.
 *
 * Backend: POST → /functions/v1/join-waitlist
 * Behavior: at 5 PM the day before, if VIP-only slots are still open, the
 * unlock-tomorrow-slots cron stamps slot_unlocks AND notifies waitlist FIRST
 * before opening to public traffic.
 */

import React, { useState } from 'react';
import { Loader2, MailCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  /** YYYY-MM-DD the patient wants */
  dateIso: string;
  /** Optional specific time the patient was looking at, e.g. "3:00 PM" */
  desiredTime?: string;
  /** Tier the slot was locked behind (audit only) */
  requiredTier?: string;
  /** Optional org context — for org-billed flows */
  organizationId?: string;
  /** Optional lab-request token if patient came from a provider link */
  labRequestId?: string;
  accessToken?: string;
  /** Pre-fill from the lab-request token if available */
  defaultEmail?: string;
  defaultPhone?: string;
  defaultName?: string;
  /** Visual variant */
  variant?: 'inline' | 'subtle';
}

const JoinWaitlistButton: React.FC<Props> = ({
  dateIso, desiredTime, requiredTier,
  organizationId, labRequestId, accessToken,
  defaultEmail, defaultPhone, defaultName,
  variant = 'inline',
}) => {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState(defaultEmail || '');
  const [phone, setPhone] = useState(defaultPhone || '');
  const [name, setName] = useState(defaultName || '');

  const niceDate = (() => {
    try { return new Date(dateIso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
    catch { return dateIso; }
  })();

  async function submit() {
    if (!email.trim() || !email.includes('@')) {
      toast.error('Please enter a valid email');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('join-waitlist', {
        body: {
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          full_name: name.trim() || undefined,
          desired_date: dateIso,
          desired_time: desiredTime || undefined,
          required_tier: requiredTier || undefined,
          organization_id: organizationId || undefined,
          lab_request_id: labRequestId || undefined,
          access_token: accessToken || undefined,
        },
      });
      if (error) throw error;
      setDone(true);
      toast.success("You're on the list — we'll text or email you the moment it opens up.");
    } catch (e: any) {
      console.error('[join-waitlist]', e);
      toast.error(e?.message || 'Could not join waitlist. Try again or email info@convelabs.com');
    } finally {
      setSubmitting(false);
    }
  }

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={
        variant === 'subtle'
          ? 'text-xs font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2'
          : 'w-full block text-center text-sm font-semibold text-gray-700 border border-gray-300 rounded-lg py-2.5 transition hover:bg-gray-50 hover:border-gray-400'
      }
    >
      {variant === 'subtle' ? 'Join the waitlist' : '🔔 Join the waitlist instead'}
    </button>
  );

  if (!open) return trigger;

  return (
    <>
      {trigger}
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:px-4" onClick={() => !submitting && setOpen(false)}>
        <div className="relative max-w-md w-full bg-white rounded-t-2xl sm:rounded-xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <button onClick={() => !submitting && setOpen(false)} className="absolute top-3 right-3 text-gray-400 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
          {done ? (
            <div className="text-center py-4">
              <MailCheck className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-900 mb-1">You're on the list</h3>
              <p className="text-sm text-gray-600 mb-4">
                If a slot opens for <strong>{niceDate}</strong>, we'll text + email you a one-tap booking link
                <strong> 5 PM the day before</strong> — before opening to the public.
              </p>
              <button
                onClick={() => { setOpen(false); setDone(false); }}
                className="text-sm text-gray-600 hover:text-gray-900 underline"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Join the waitlist</h3>
              <p className="text-sm text-gray-600 mb-4">
                Want <strong>{niceDate}{desiredTime ? ` at ${desiredTime}` : ''}</strong>?
                We'll notify you first if a slot opens — at 5 PM the day before, before opening to the public.
              </p>
              <div className="space-y-2 mb-4">
                <input
                  type="email" placeholder="your@email.com" value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base sm:text-sm focus:border-[#B91C1C] focus:outline-none min-h-[48px]"
                />
                <input
                  type="tel" placeholder="(optional) phone for SMS" value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base sm:text-sm focus:border-[#B91C1C] focus:outline-none min-h-[48px]"
                />
                <input
                  type="text" placeholder="(optional) your name" value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base sm:text-sm focus:border-[#B91C1C] focus:outline-none min-h-[48px]"
                />
              </div>
              <button
                onClick={submit}
                disabled={submitting || !email.trim()}
                className="w-full bg-[#B91C1C] hover:bg-[#991B1B] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-3 text-sm transition flex items-center justify-center"
              >
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Joining…</> : 'Add me to the waitlist'}
              </button>
              <p className="text-[11px] text-gray-500 mt-3 text-center">
                No charge. Unsubscribe anytime by replying STOP.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default JoinWaitlistButton;
