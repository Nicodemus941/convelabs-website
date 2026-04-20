import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DollarSign, Loader2, AlertTriangle, CheckCircle2, Undo2 } from 'lucide-react';

/**
 * StaffRefundButton — drop this into any appointment row / detail modal.
 *
 * Hormozi safety rails:
 *   - Amount pre-fills to FULL charge (most refunds are full)
 *   - Reason is a DROPDOWN, not free-text (keeps audit data clean)
 *   - Internal note optional — visible to other admins, never to patient
 *   - > $500 refunds surface escalation prompt instead of just failing
 *   - Confirmation dialog with amount in 28pt so no one fat-fingers a decimal
 *   - Patient gets Stripe's automatic refund email (we don't duplicate)
 */

interface Props {
  appointmentId: string;
  patientEmail?: string;
  patientName?: string;
  totalAmountDollars: number;
  alreadyRefunded?: boolean;
  refundedAmountCents?: number | null;
  onRefunded?: () => void;
  size?: 'sm' | 'default';
}

const REASONS: { value: string; label: string; description: string }[] = [
  { value: 'duplicate', label: 'Duplicate charge', description: 'Patient was charged twice by mistake.' },
  { value: 'requested_by_customer', label: 'Customer requested', description: 'Patient asked for a refund, no service issue.' },
  { value: 'service_issue', label: 'Service issue', description: 'Phleb no-show, bad draw, scheduling error.' },
  { value: 'fraudulent', label: 'Fraudulent charge', description: 'Card wasn\'t the real customer\'s.' },
  { value: 'other', label: 'Other', description: 'Explain in the internal note.' },
];

const StaffRefundButton: React.FC<Props> = ({
  appointmentId, patientEmail, patientName, totalAmountDollars,
  alreadyRefunded = false, refundedAmountCents, onRefunded, size = 'sm',
}) => {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [amountDollars, setAmountDollars] = useState(totalAmountDollars.toFixed(2));
  const [reason, setReason] = useState('duplicate');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [escalationRequired, setEscalationRequired] = useState(false);
  const [successRefundId, setSuccessRefundId] = useState<string | null>(null);

  if (alreadyRefunded) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
        <Undo2 className="h-3 w-3" /> Refunded {refundedAmountCents ? `$${(refundedAmountCents/100).toFixed(2)}` : ''}
      </span>
    );
  }

  const resetForm = () => {
    setAmountDollars(totalAmountDollars.toFixed(2));
    setReason('duplicate');
    setNote('');
    setConfirming(false);
    setEscalationRequired(false);
    setSuccessRefundId(null);
  };

  const amountCents = Math.round(parseFloat(amountDollars || '0') * 100);
  const isValid = amountCents > 0 && amountCents <= totalAmountDollars * 100 && reason;

  const submit = async (force_escalated = false) => {
    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/staff-issue-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          appointment_id: appointmentId,
          amount_cents: amountCents,
          reason,
          internal_note: note.trim() || null,
          force_escalated,
        }),
      });
      const j = await resp.json();
      if (resp.status === 403 && j.requires_escalation) {
        setEscalationRequired(true);
        return;
      }
      if (!resp.ok) throw new Error(j.error || 'Refund failed');
      setSuccessRefundId(j.refund_id);
      toast.success(`Refunded ${j.amount_display} · Stripe ID ${j.refund_id}`);
      onRefunded?.();
    } catch (e: any) {
      toast.error(e?.message || 'Refund failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        size={size}
        variant="outline"
        onClick={() => { resetForm(); setOpen(true); }}
        className="gap-1 text-xs text-red-700 border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600"
      >
        <Undo2 className="h-3.5 w-3.5" /> Refund
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-md">
          {successRefundId ? (
            <div className="py-4 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div>
                <p className="text-lg font-bold">Refund processed</p>
                <p className="text-sm text-gray-600 mt-1">${amountDollars} refunded to {patientName || 'the customer'}. Stripe will email them within 60 seconds. The money lands on their card in 5–10 business days.</p>
                <p className="text-[11px] text-gray-400 mt-2 font-mono">{successRefundId}</p>
              </div>
              <Button onClick={() => { setOpen(false); resetForm(); }} className="mt-2">Done</Button>
            </div>
          ) : escalationRequired ? (
            <div className="py-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <DialogTitle>Escalation required — refund over $500</DialogTitle>
                  <p className="text-sm text-gray-600 mt-1">Refunds over $500 need a quick verbal approval from Nico before they go through. Your request has been logged + Nico just got an SMS.</p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
                <strong>What to do now:</strong>
                <ol className="list-decimal pl-4 mt-1 space-y-1">
                  <li>Text or call Nico with the patient name + amount</li>
                  <li>Get his "yes, process it"</li>
                  <li>Click "I have approval" below</li>
                </ol>
              </div>
              <div className="flex justify-between gap-2 pt-2">
                <Button variant="ghost" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
                <Button onClick={() => submit(true)} disabled={submitting} className="bg-amber-600 hover:bg-amber-700 text-white">
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Processing…</> : 'I have Nico\'s approval — fire the refund'}
                </Button>
              </div>
            </div>
          ) : confirming ? (
            <div className="py-3 space-y-3">
              <DialogHeader>
                <DialogTitle>Confirm refund</DialogTitle>
              </DialogHeader>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <p className="text-xs text-red-700 uppercase tracking-wider font-semibold">Refund amount</p>
                <p className="text-4xl font-extrabold text-red-700 mt-1">${amountDollars}</p>
                <p className="text-xs text-red-900 mt-1">to {patientName || patientEmail || 'customer'}</p>
              </div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Reason:</span><span className="font-medium">{REASONS.find(r => r.value === reason)?.label}</span></div>
                {note && <div className="pt-1 border-t"><span className="text-[11px] text-gray-500">Internal note:</span><p className="text-xs italic">{note}</p></div>}
              </div>
              <p className="text-[11px] text-gray-600 text-center pt-1">Stripe will email the customer automatically. Money lands on card in 5–10 business days. Owner gets SMS.</p>
              <div className="flex justify-between gap-2 pt-2">
                <Button variant="ghost" onClick={() => setConfirming(false)}>Back</Button>
                <Button onClick={() => submit(false)} disabled={submitting} className="bg-red-600 hover:bg-red-700 text-white gap-1">
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : <>Issue Refund</>}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-red-600" /> Refund for {patientName || patientEmail}
                </DialogTitle>
              </DialogHeader>

              <div>
                <Label className="text-xs">Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={totalAmountDollars}
                  value={amountDollars}
                  onChange={e => setAmountDollars(e.target.value)}
                  className="text-lg font-bold"
                />
                <div className="flex justify-between text-[11px] text-gray-500 mt-1">
                  <button type="button" onClick={() => setAmountDollars(totalAmountDollars.toFixed(2))} className="text-blue-600 hover:underline">
                    Full amount (${totalAmountDollars.toFixed(2)})
                  </button>
                  <span>Max: ${totalAmountDollars.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <Label className="text-xs">Reason *</Label>
                <select value={reason} onChange={e => setReason(e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white">
                  {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">{REASONS.find(r => r.value === reason)?.description}</p>
              </div>

              <div>
                <Label className="text-xs">Internal note <span className="text-gray-400">(optional, admin-only)</span></Label>
                <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="e.g. 'Patient called — phleb was 45 min late, apologized and offered refund'" />
              </div>

              {amountCents > 50000 && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[11px] text-amber-900">
                  ⚠ This is over the $500 escalation threshold. You'll need Nico's verbal approval before it processes.
                </div>
              )}

              <div className="flex justify-between gap-2 pt-1">
                <Button variant="ghost" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
                <Button onClick={() => setConfirming(true)} disabled={!isValid} className="bg-red-600 hover:bg-red-700 text-white">
                  Review →
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StaffRefundButton;
