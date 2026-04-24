import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import DateOfBirthInput from '@/components/ui/DateOfBirthInput';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, UserPlus } from 'lucide-react';

/**
 * AddPatientModal — shared by admin Org drawer and provider portal.
 *
 * Creates a tenant_patients row scoped to the org. Optional extras:
 *  - Reminder cadence (days before next visit) for the no-show killer flow
 *  - "Send booking link now" checkbox → fires request-lab-booking SMS
 *
 * Minimal required fields: first + last name, phone OR email.
 */

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  onCreated?: () => void;
}

const AddPatientModal: React.FC<Props> = ({ open, onOpenChange, organizationId, onCreated }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [reminderDays, setReminderDays] = useState('7');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setDob('');
    setReminderDays('7');
  };

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('First and last name are required');
      return;
    }
    if (!email.trim() && !phone.trim()) {
      toast.error('Add at least a phone or email so we can reach them');
      return;
    }

    setSubmitting(true);
    try {
      // Compute the overdue deadline from the cadence the provider picked.
      // e.g. cadence=7 → deadline = now + 7 days. The cron fn flips
      // overdue_flagged_at once the deadline passes with no completed visit.
      const days = parseInt(reminderDays || '7', 10) || 7;
      const deadlineAt = new Date();
      deadlineAt.setDate(deadlineAt.getDate() + days);

      const { data: newPatient, error } = await supabase.from('tenant_patients').insert({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        date_of_birth: dob || null,
        organization_id: organizationId,
        lab_reminder_cadence_days: days,
        lab_reminder_deadline_at: deadlineAt.toISOString(),
      } as any).select('id').single();

      if (error) throw error;

      toast.success(`${firstName} ${lastName} added`);
      reset();
      onCreated?.();
      onOpenChange(false);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
        toast.error('This patient is already on file');
      } else {
        toast.error(msg || 'Failed to add patient');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[#B91C1C]" />
            Add patient
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">First name *</Label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
                className="mt-1"
                disabled={submitting}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Last name *</Label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1"
                disabled={submitting}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Date of birth</Label>
            <div className="mt-1">
              <DateOfBirthInput value={dob} onChange={setDob} disabled={submitting} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Phone</Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(407) 555-1234"
                className="mt-1"
                disabled={submitting}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="patient@example.com"
                className="mt-1"
                disabled={submitting}
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-500 -mt-2">Phone or email required — we use it to send the booking link + reminders.</p>

          {/* Reminder cadence — Hormozi no-show killer */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <Label className="text-xs font-bold text-amber-900 uppercase tracking-wider">Lab reminder cadence</Label>
            <p className="text-[11px] text-amber-800 mt-0.5">We'll text + email them to book their labs. If they don't by the deadline, your team gets an overdue alert.</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-amber-900">Remind starting</span>
              <select
                value={reminderDays}
                onChange={(e) => setReminderDays(e.target.value)}
                className="h-8 text-sm border border-amber-300 rounded-md px-2 bg-white"
                disabled={submitting}
              >
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
              <span className="text-sm text-amber-900">after today</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className="bg-[#B91C1C] hover:bg-[#991B1B] text-white w-full sm:w-auto"
          >
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Adding…</> : 'Add patient'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddPatientModal;
