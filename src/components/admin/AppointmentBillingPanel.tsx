import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Receipt, Building2, User, AlertTriangle } from 'lucide-react';

/**
 * AppointmentBillingPanel — bill-to target, editable price, and invoice
 * generation for ONE existing appointment, from the appointment detail panel.
 *
 * Closes three gaps that forced manual Stripe edits:
 *   1. "Link org" only set organization_id, never billed_to — so an org-linked
 *      appointment still billed the patient and no org-invoice option existed.
 *   2. "Generate Invoice" (Invoices tab) could only create a NEW orphan
 *      "Invoice Only" appointment — it could not invoice an EXISTING one.
 *   3. There was no way to edit an existing appointment's price, so the Stripe
 *      invoice could never be corrected from the app.
 *
 * Re-invoicing rule (owner decision): when the appointment ALREADY has a
 * Stripe invoice, changing the amount/target VOIDS the old invoice and
 * REISSUES a new one — behind an explicit confirmation — so Stripe can never
 * disagree with our records. Paid invoices are refused (refund instead).
 */

type BilledTo = 'patient' | 'org';

interface BillingState {
  total_amount: number | null;
  service_price: number | null;
  service_name: string | null;
  billed_to: string | null;
  organization_id: string | null;
  stripe_invoice_id: string | null;
  stripe_invoice_url: string | null;
  invoice_status: string | null;
  payment_status: string | null;
  patient_email: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  org_name: string | null;
  org_billing_email: string | null;
}

const PAID_STATES = ['paid', 'completed', 'succeeded'];

export const AppointmentBillingPanel: React.FC<{
  appointmentId: string;
  onUpdate?: () => void;
}> = ({ appointmentId, onUpdate }) => {
  const [state, setState] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('');
  const [billedTo, setBilledTo] = useState<BilledTo>('patient');
  const [memo, setMemo] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('appointments')
        .select('total_amount, service_price, service_name, billed_to, organization_id, stripe_invoice_id, stripe_invoice_url, invoice_status, payment_status, patient_email, appointment_date, appointment_time')
        .eq('id', appointmentId)
        .maybeSingle();
      if (!data) { setState(null); return; }
      let orgName: string | null = null;
      let orgEmail: string | null = null;
      if ((data as any).organization_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('name, billing_email')
          .eq('id', (data as any).organization_id)
          .maybeSingle();
        orgName = (org as any)?.name || null;
        orgEmail = (org as any)?.billing_email || null;
      }
      const s: BillingState = { ...(data as any), org_name: orgName, org_billing_email: orgEmail };
      setState(s);
      setAmount(String(s.total_amount ?? s.service_price ?? ''));
      setBilledTo(s.billed_to === 'org' ? 'org' : 'patient');
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="text-xs text-muted-foreground flex items-center gap-2 py-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading billing…</div>;
  }
  if (!state) return null;

  const hasOrg = !!state.organization_id;
  const hasInvoice = !!state.stripe_invoice_id;
  const isPaid = PAID_STATES.includes(String(state.payment_status || '')) || state.invoice_status === 'paid';
  const parsedAmount = parseFloat(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const orgMissingEmail = billedTo === 'org' && hasOrg && !state.org_billing_email;
  const canSend = amountValid && !busy && !isPaid && !(billedTo === 'org' && (!hasOrg || orgMissingEmail));

  const currentTotal = Number(state.total_amount ?? state.service_price ?? 0);
  const amountChanged = amountValid && Math.abs(parsedAmount - currentTotal) > 0.004;
  const targetChanged = billedTo !== (state.billed_to === 'org' ? 'org' : 'patient');

  const recipientLabel = billedTo === 'org'
    ? (state.org_billing_email || 'organization (no billing email)')
    : (state.patient_email || 'patient (no email on file)');

  /** No existing invoice → persist edits, then send a fresh invoice. */
  const sendFresh = async () => {
    setBusy(true);
    try {
      const { error: upErr } = await supabase.from('appointments').update({
        total_amount: parsedAmount,
        service_price: parsedAmount,
        billed_to: billedTo,
        updated_at: new Date().toISOString(),
      }).eq('id', appointmentId);
      if (upErr) throw upErr;

      const { data, error } = await supabase.functions.invoke('send-appointment-invoice', {
        body: {
          appointmentId,
          servicePrice: parsedAmount,
          serviceName: state.service_name || 'Mobile Blood Draw',
          appointmentDate: state.appointment_date ? String(state.appointment_date).slice(0, 10) : undefined,
          appointmentTime: state.appointment_time || '',
          memo: memo.trim() || undefined,
        },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.message || (data as any)?.error || error?.message || 'Invoice failed');
      if ((data as any)?.skipped) {
        toast.info(`Invoice skipped: ${(data as any).reason}`);
      } else {
        toast.success(`Invoice sent to ${(data as any)?.recipient || recipientLabel}`);
      }
      await load();
      onUpdate?.();
    } catch (e: any) {
      toast.error(e?.message || 'Could not send invoice');
    } finally {
      setBusy(false);
    }
  };

  /** Existing invoice → void it and reissue at the new amount/target. */
  const reissue = async () => {
    setBusy(true);
    setConfirmOpen(false);
    try {
      const { data, error } = await supabase.functions.invoke('reissue-stripe-invoice', {
        body: {
          appointmentId,
          newTotal: parsedAmount,
          newBilledTo: billedTo,
          ...(billedTo === 'org' && state.org_billing_email ? { newOrgEmail: state.org_billing_email } : {}),
          newServiceName: state.service_name || undefined,
        },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.message || (data as any)?.error || error?.message || 'Reissue failed');
      }
      toast.success(`Old invoice voided — new invoice sent for $${parsedAmount.toFixed(2)}`);
      await load();
      onUpdate?.();
    } catch (e: any) {
      toast.error(e?.message || 'Could not reissue invoice');
    } finally {
      setBusy(false);
    }
  };

  const primaryAction = () => {
    if (hasInvoice) setConfirmOpen(true);
    else sendFresh();
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-conve-red" />
        <p className="text-sm font-semibold">Billing &amp; Invoice</p>
        {hasInvoice && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
            {isPaid ? 'Paid' : `Invoiced${state.invoice_status ? ` · ${state.invoice_status}` : ''}`}
          </span>
        )}
      </div>

      {/* Bill to — patient vs organization */}
      <div className="space-y-1">
        <Label className="text-xs">Bill to</Label>
        <div className="flex gap-2">
          <Button
            type="button" size="sm" variant={billedTo === 'patient' ? 'default' : 'outline'}
            className="flex-1 text-xs" disabled={busy || isPaid}
            onClick={() => setBilledTo('patient')}
          >
            <User className="h-3.5 w-3.5 mr-1" /> Patient
          </Button>
          <Button
            type="button" size="sm" variant={billedTo === 'org' ? 'default' : 'outline'}
            className="flex-1 text-xs" disabled={busy || isPaid || !hasOrg}
            onClick={() => setBilledTo('org')}
            title={hasOrg ? undefined : 'Link an organization first (Assign to org above)'}
          >
            <Building2 className="h-3.5 w-3.5 mr-1" /> {state.org_name || 'Organization'}
          </Button>
        </div>
        {!hasOrg && (
          <p className="text-[11px] text-muted-foreground">No organization linked — use “Assign to org” above to bill a practice.</p>
        )}
        {orgMissingEmail && (
          <p className="text-[11px] text-red-600">This organization has no billing email — add one before invoicing it.</p>
        )}
      </div>

      {/* Editable price */}
      <div className="space-y-1">
        <Label className="text-xs">Invoice amount ($)</Label>
        <Input
          type="number" min="0" step="0.01" value={amount} disabled={busy || isPaid}
          onChange={(e) => setAmount(e.target.value)}
          className="h-9 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          Current on file: ${currentTotal.toFixed(2)}
          {amountChanged && <span className="text-amber-700 font-medium"> → changing to ${parsedAmount.toFixed(2)}</span>}
        </p>
      </div>

      {/* Memo */}
      <div className="space-y-1">
        <Label className="text-xs">Memo (optional)</Label>
        <Input
          value={memo} disabled={busy || isPaid} onChange={(e) => setMemo(e.target.value)}
          placeholder="e.g. Stacia Pierce + 1 companion — 7/23 visit"
          className="h-9 text-sm"
        />
      </div>

      {isPaid ? (
        <div className="flex items-start gap-2 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-emerald-700 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-emerald-800">
            This appointment is already paid. To change the amount, issue a refund first — reissuing a paid invoice would put Stripe and our records out of sync.
          </p>
        </div>
      ) : (
        <>
          <Button
            type="button" size="sm" className="w-full bg-conve-red hover:bg-conve-red-dark text-white"
            disabled={!canSend} onClick={primaryAction}
          >
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Working…</>
              : hasInvoice ? `Update & reissue invoice — $${amountValid ? parsedAmount.toFixed(2) : '—'}`
              : `Send invoice — $${amountValid ? parsedAmount.toFixed(2) : '—'}`}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            Goes to <span className="font-medium">{recipientLabel}</span>
            {hasInvoice && (amountChanged || targetChanged) && ' · old invoice will be voided'}
          </p>
        </>
      )}

      {state.stripe_invoice_url && (
        <a href={state.stripe_invoice_url} target="_blank" rel="noopener noreferrer"
          className="block text-[11px] text-conve-red hover:underline text-center">
          View current invoice in Stripe →
        </a>
      )}

      {/* Void + reissue confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" /> Void and reissue this invoice?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <p>
                The existing Stripe invoice will be <strong>voided</strong> and a new one issued for{' '}
                <strong>${amountValid ? parsedAmount.toFixed(2) : '—'}</strong>, billed to{' '}
                <strong>{recipientLabel}</strong>.
              </p>
              <p className="text-xs text-muted-foreground">
                The patient/organization will receive a new invoice email. The old payment link stops working.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current invoice</AlertDialogCancel>
            <AlertDialogAction onClick={reissue} className="bg-amber-600 hover:bg-amber-700">
              Void &amp; reissue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AppointmentBillingPanel;
