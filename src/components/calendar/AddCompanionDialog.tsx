import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, UserPlus } from 'lucide-react';

interface Props {
  appt: any;            // the PRIMARY appointment the companion is added to
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Add a companion to an existing visit and bill them with an itemized Stripe
 * invoice (companion draw fee + optional specialty kit). Calls the admin-gated
 * add-companion-with-invoice edge function. The primary visit is unchanged.
 */
export default function AddCompanionDialog({ appt, open, onOpenChange, onDone }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState((appt?.patient_name || '').split(' ').slice(-1)[0] || '');
  const [dob, setDob] = useState('');
  const [relationship, setRelationship] = useState('Family member');
  const [phone, setPhone] = useState('');
  const [drawFee, setDrawFee] = useState(75);
  const [hasKit, setHasKit] = useState(false);
  const [kitLab, setKitLab] = useState('Vibrant');
  const [kitPrice, setKitPrice] = useState(150);
  const [billingEmail, setBillingEmail] = useState(appt?.patient_email || '');
  const [busy, setBusy] = useState(false);

  const lines = useMemo(() => {
    const out: Array<{ description: string; amountCents: number }> = [];
    if (drawFee > 0) out.push({ description: 'Companion blood draw fee', amountCents: Math.round(drawFee * 100) });
    if (hasKit && kitPrice > 0) out.push({ description: `${kitLab} specialty collection kit`, amountCents: Math.round(kitPrice * 100) });
    return out;
  }, [drawFee, hasKit, kitLab, kitPrice]);
  const totalCents = lines.reduce((s, l) => s + l.amountCents, 0);

  const submit = async () => {
    if (!firstName.trim()) { toast.error('Companion first name is required'); return; }
    if (!billingEmail.trim()) { toast.error('A billing email is required to send the invoice'); return; }
    if (lines.length === 0) { toast.error('Add at least one charge'); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('add-companion-with-invoice', {
        body: {
          primaryAppointmentId: appt.id,
          companion: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            dateOfBirth: dob || null,
            relationship,
            phone: phone || null,
            ...(hasKit ? { serviceType: 'specialty-kit', serviceName: `Specialty Kit Collection (${kitLab})`, specialtyKitCount: 1 } : {}),
          },
          lineItems: lines,
          billingEmail: billingEmail.trim(),
          sendInvoice: true,
          stripeAutoSend: true,
        },
      });
      if (error) throw error;
      if (data?.ok === false || data?.error) throw new Error(data.error || 'Failed');
      toast.success(`${firstName} added · invoice for ${money(totalCents)} sent to ${billingEmail}`, {
        description: data?.hostedInvoiceUrl || undefined, duration: 12000,
      });
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e?.message || 'Could not add the companion');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a companion to this visit</DialogTitle>
          <DialogDescription>
            Books them into the same slot as {appt?.patient_name || 'the patient'} and sends an
            itemized invoice. The original visit is unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Last name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date of birth</Label>
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Relationship</Label>
              <Input value={relationship} onChange={(e) => setRelationship(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Companion draw fee ($)</Label>
            <Input type="number" min={0} value={drawFee} onChange={(e) => setDrawFee(Number(e.target.value))} />
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Specialty collection kit</p>
                <p className="text-xs text-muted-foreground">e.g. Vibrant, Genova</p>
              </div>
              <Switch checked={hasKit} onCheckedChange={setHasKit} />
            </div>
            {hasKit && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Lab</Label>
                  <Input value={kitLab} onChange={(e) => setKitLab(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Kit price ($)</Label>
                  <Input type="number" min={0} value={kitPrice} onChange={(e) => setKitPrice(Number(e.target.value))} />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Bill to (email)</Label>
            <Input type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} placeholder="payer@email.com" />
            <p className="text-xs text-muted-foreground">Defaults to the primary patient; change it to bill a parent/payer.</p>
          </div>

          {/* Itemized preview */}
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            {lines.map((l, i) => (
              <div key={i} className="flex justify-between py-0.5">
                <span>{l.description}</span><span>{money(l.amountCents)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t mt-1 pt-1 font-semibold">
              <span>Total</span><span>{money(totalCents)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || totalCents === 0}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</> : <><UserPlus className="mr-2 h-4 w-4" />Add & invoice {money(totalCents)}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
