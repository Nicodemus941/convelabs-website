import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Loader2, Send, CheckCircle2, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface InviteStaffDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSent?: () => void;
}

// The role catalog drives both role name shown on the invite AND role_level enforcement
// on the server. Keep in sync with staff_role_definitions.role_level enum.
const ROLE_OPTIONS: { label: string; role: string; roleLevel: string; defaultPayCents: number }[] = [
  { label: 'Phlebotomist', role: 'Phlebotomist Staff', roleLevel: 'staff', defaultPayCents: 3500 },
  { label: 'Nurse', role: 'Nurse', roleLevel: 'staff', defaultPayCents: 5500 },
  { label: 'Customer Service Staff', role: 'Customer Service Staff', roleLevel: 'staff', defaultPayCents: 2200 },
  { label: 'Admin Staff', role: 'Admin Staff', roleLevel: 'staff', defaultPayCents: 2500 },
  { label: 'Phlebotomy Supervisor', role: 'Phlebotomist Territory Supervisor', roleLevel: 'supervisor', defaultPayCents: 4500 },
  { label: 'Phlebotomy Manager', role: 'Phlebotomist Territory Manager', roleLevel: 'manager', defaultPayCents: 6500 },
  { label: 'Territory Director (Phlebotomy)', role: 'Phlebotomist Territory Director', roleLevel: 'director', defaultPayCents: 9000 },
  { label: 'Customer Service Manager', role: 'Customer Service Manager', roleLevel: 'manager', defaultPayCents: 4500 },
  { label: 'Sales Manager', role: 'Sales Manager', roleLevel: 'manager', defaultPayCents: 5000 },
];

const InviteStaffDialog: React.FC<InviteStaffDialogProps> = ({ open, onOpenChange, onSent }) => {
  const [submitting, setSubmitting] = useState(false);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);

  const [form, setForm] = useState(() => ({
    firstName: '', lastName: '', email: '', phone: '',
    roleKey: 'Phlebotomist Staff',
    payRateDollars: '35',
    startDate: '',
    referralBountyDollars: '500',
  }));

  const selectedRole = ROLE_OPTIONS.find(r => r.role === form.roleKey) || ROLE_OPTIONS[0];

  const reset = () => {
    setForm({
      firstName: '', lastName: '', email: '', phone: '',
      roleKey: 'Phlebotomist Staff',
      payRateDollars: '35', startDate: '', referralBountyDollars: '500',
    });
    setAcceptUrl(null);
  };

  const send = async () => {
    if (!form.firstName || !form.lastName || !form.email) {
      toast.error('First name, last name, and email are required');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-staff-invitation', {
        body: {
          email: form.email.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim() || undefined,
          role: selectedRole.role,
          roleLevel: selectedRole.roleLevel,
          payRateCents: form.payRateDollars ? Math.round(parseFloat(form.payRateDollars) * 100) : undefined,
          startDate: form.startDate || undefined,
          referralBountyCents: form.referralBountyDollars ? Math.round(parseFloat(form.referralBountyDollars) * 100) : undefined,
          inviteType: 'hire',
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Invitation failed');

      toast.success(`Invitation sent to ${form.email}`);
      setAcceptUrl(data.invitation.accept_url);
      onSent?.();
    } catch (e: any) {
      toast.error(e.message || 'Failed to send invitation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-[#B91C1C]" /> Invite New Staff Member
          </DialogTitle>
          <DialogDescription>
            Sends an offer email with role, pay, and start date. Invitation expires in 72 hours.
          </DialogDescription>
        </DialogHeader>

        {acceptUrl ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <CheckCircle2 className="h-5 w-5" />
              <p className="text-sm font-medium">Invitation sent to {form.email}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Direct accept link (for copy/paste)</Label>
              <div className="flex gap-2">
                <Input value={acceptUrl} readOnly className="font-mono text-xs" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { navigator.clipboard.writeText(acceptUrl); toast.success('Link copied'); }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <Button className="w-full" onClick={() => { reset(); }}>Send another invitation</Button>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First name</Label>
                <Input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div>
                <Label>Last name</Label>
                <Input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
              </div>
            </div>

            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>

            <div>
              <Label>Phone (optional, for SMS notifications)</Label>
              <Input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>

            <div>
              <Label>Role</Label>
              <Select value={form.roleKey} onValueChange={v => {
                const r = ROLE_OPTIONS.find(o => o.role === v)!;
                setForm(f => ({ ...f, roleKey: v, payRateDollars: (r.defaultPayCents / 100).toString() }));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(o => (
                    <SelectItem key={o.role} value={o.role}>
                      {o.label} <span className="text-muted-foreground text-xs ml-1">({o.roleLevel})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pay rate ($/hr)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.payRateDollars}
                  onChange={e => setForm({ ...form, payRateDollars: e.target.value })}
                />
              </div>
              <div>
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Referral bonus to include in offer ($, optional)</Label>
              <Input
                type="number"
                value={form.referralBountyDollars}
                onChange={e => setForm({ ...form, referralBountyDollars: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Shown in the offer email; paid out after their 10th billable visit.
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>Cancel</Button>
              <Button
                className="bg-[#B91C1C] hover:bg-[#991B1B] text-white"
                onClick={send}
                disabled={submitting}
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending...</>
                ) : (
                  <><Mail className="h-4 w-4 mr-1" /> Send Offer</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default InviteStaffDialog;
