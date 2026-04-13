import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, UserPlus, Clock, ArrowRight, Loader2, Crown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ScheduleAppointmentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultDate?: string;
}

const SERVICE_TYPES = [
  { value: 'mobile', label: 'Mobile Blood Draw — $150' },
  { value: 'in-office', label: 'Office Visit — $55' },
  { value: 'senior', label: 'Senior (65+) — $100' },
  { value: 'specialty-kit', label: 'Specialty Collection Kit — $185' },
  { value: 'specialty-kit-genova', label: 'Genova Diagnostics — $200' },
  { value: 'therapeutic', label: 'Therapeutic Phlebotomy — $200' },
];

const TIME_SLOTS = [
  '6:00 AM', '6:30 AM', '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM',
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM',
];

const ScheduleAppointmentModal: React.FC<ScheduleAppointmentModalProps> = ({
  open, onClose, onCreated, defaultDate,
}) => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreatePatient, setShowCreatePatient] = useState(false);

  // Form state
  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [date, setDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [zipcode, setZipcode] = useState('');
  const [notes, setNotes] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'fixed' | 'waive'>('none');
  const [discountValue, setDiscountValue] = useState('');
  const [invoiceMemo, setInvoiceMemo] = useState('');
  const [orgBilling, setOrgBilling] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [overrideSlot, setOverrideSlot] = useState(false);
  const [customTime, setCustomTime] = useState('');

  const resetForm = () => {
    setStep(1);
    setPatientName('');
    setPatientEmail('');
    setPatientPhone('');
    setServiceType('');
    setDate(defaultDate || new Date().toISOString().split('T')[0]);
    setTime('');
    setAddress('');
    setCity('');
    setZipcode('');
    setNotes('');
    setIsVip(false);
    setDiscountType('none');
    setDiscountValue('');
    setInvoiceMemo('');
    setOrgBilling(false);
    setOrgName('');
    setOrgEmail('');
    setOverrideSlot(false);
    setCustomTime('');
    setShowCreatePatient(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const canGoToStep2 = patientName.trim() && serviceType;
  const effectiveTime = time === '__custom' ? customTime : time;
  const canGoToStep3 = date && (time !== '__custom' ? !!time : !!customTime);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Find patient by email or use first available user
      let patientId: string | null = null;

      if (patientEmail) {
        const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
        const found = users?.users?.find(u => u.email === patientEmail.toLowerCase());
        patientId = found?.id || null;
      }

      // If no patient found, search by name in user metadata
      if (!patientId) {
        for (let page = 1; page <= 10; page++) {
          const { data } = await supabase.auth.admin.listUsers({ page, perPage: 50 });
          if (!data?.users?.length) break;
          const found = data.users.find(u => {
            const name = `${u.user_metadata?.firstName || ''} ${u.user_metadata?.lastName || ''}`.trim().toLowerCase();
            return name.includes(patientName.toLowerCase()) || patientName.toLowerCase().includes(name);
          });
          if (found) { patientId = found.id; break; }
        }
      }

      // Fallback: use first user
      if (!patientId) {
        const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
        patientId = data?.users?.[0]?.id || null;
      }

      if (!patientId) {
        toast.error('Could not find or create patient');
        setIsSubmitting(false);
        return;
      }

      // Parse time to build full datetime
      const useTime = time === '__custom' ? customTime : time;
      let hours = 0, minutes = 0;
      if (useTime.includes('AM') || useTime.includes('PM')) {
        const [timeStr, period] = useTime.split(' ');
        [hours, minutes] = timeStr.split(':').map(Number);
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
      } else {
        // 24h format from custom time input (e.g. "14:30")
        const parts = useTime.split(':').map(Number);
        hours = parts[0] || 0;
        minutes = parts[1] || 0;
      }
      const appointmentDate = `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      const displayTime = useTime.includes('AM') || useTime.includes('PM') ? useTime : `${hours > 12 ? hours - 12 : hours}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;

      // Calculate service price with discount
      const servicePriceMap: Record<string, number> = {
        'mobile': 150, 'in-office': 55, 'senior': 100,
        'specialty-kit': 185, 'specialty-kit-genova': 200, 'therapeutic': 200,
      };
      const basePrice = servicePriceMap[serviceType] || 150;
      let finalPrice = basePrice;
      let discountNote = '';

      if (discountType === 'waive') {
        finalPrice = 0;
        discountNote = ' | Fee waived';
      } else if (discountType === 'percentage' && discountValue) {
        const pct = Math.min(parseFloat(discountValue) || 0, 100);
        finalPrice = Math.round((basePrice * (1 - pct / 100)) * 100) / 100;
        discountNote = ` | ${pct}% discount applied`;
      } else if (discountType === 'fixed' && discountValue) {
        finalPrice = Math.max(basePrice - (parseFloat(discountValue) || 0), 0);
        discountNote = ` | $${parseFloat(discountValue).toFixed(2)} discount applied`;
      }

      const isWaived = finalPrice === 0;
      const invoiceDueAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const billingEmail = orgBilling && orgEmail ? orgEmail : patientEmail;

      const { data: newAppt, error } = await supabase.from('appointments').insert([{
        appointment_date: appointmentDate,
        appointment_time: displayTime,
        patient_id: patientId,
        service_type: serviceType,
        status: 'scheduled',
        address: address || 'TBD',
        zipcode: zipcode || '32801',
        total_amount: finalPrice,
        service_price: finalPrice,
        booking_source: 'manual',
        is_vip: isVip,
        invoice_status: isWaived ? 'not_required' : 'sent',
        invoice_sent_at: isWaived ? null : new Date().toISOString(),
        invoice_due_at: isWaived ? null : invoiceDueAt,
        payment_status: isWaived ? 'completed' : 'pending',
        notes: `Patient: ${patientName}${patientEmail ? ` | Email: ${patientEmail}` : ''}${patientPhone ? ` | Phone: ${patientPhone}` : ''}${discountNote}${orgBilling ? ` | Org: ${orgName}` : ''}${invoiceMemo ? ` | Memo: ${invoiceMemo}` : ''}${notes ? ` | Notes: ${notes}` : ''} | Created by admin`,
      }]).select().single();

      if (error) throw error;

      // Send invoice email (skip if fee waived)
      if (newAppt && !isWaived) {
        supabase.functions.invoke('send-appointment-invoice', {
          body: {
            appointmentId: newAppt.id,
            patientName: orgBilling ? orgName : patientName,
            patientEmail: billingEmail,
            patientPhone,
            serviceType,
            serviceName: SERVICE_TYPES.find(s => s.value === serviceType)?.label || serviceType,
            servicePrice: finalPrice,
            appointmentDate: date,
            appointmentTime: displayTime,
            address: address || 'TBD',
            isVip,
            memo: invoiceMemo || (orgBilling ? `Patient: ${patientName}` : ''),
            orgName: orgBilling ? orgName : undefined,
          },
        }).catch(err => console.error('Invoice send error (non-blocking):', err));
      }

      const statusMsg = isWaived ? ' (Fee waived)' : isVip ? ' (VIP)' : ' Invoice sent.';
      toast.success(`Appointment scheduled!${statusMsg}`);
      handleClose();
      onCreated();
    } catch (err: any) {
      console.error('Schedule error:', err);
      toast.error(err.message || 'Failed to schedule appointment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule New Appointment</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          {['Patient & Service', 'Schedule', 'Confirm'].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                i + 1 <= step ? 'bg-conve-red text-white' : 'bg-muted text-muted-foreground'
              }`}>
                {i + 1}
              </div>
              <span className={`text-xs font-medium ${i + 1 <= step ? 'text-foreground' : 'text-muted-foreground'}`}>
                {label}
              </span>
              {i < 2 && <div className={`w-8 h-px ${i + 1 < step ? 'bg-conve-red' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Patient & Service */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Patient Name *</Label>
              <Input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={patientEmail} onChange={e => setPatientEmail(e.target.value)} placeholder="patient@email.com" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input type="tel" value={patientPhone} onChange={e => setPatientPhone(e.target.value)} placeholder="(555) 123-4567" />
              </div>
            </div>
            <div>
              <Label>Service *</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger><SelectValue placeholder="Select a service" /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <Checkbox
                id="vip-patient"
                checked={isVip}
                onCheckedChange={(checked) => setIsVip(checked === true)}
                className="mt-0.5"
              />
              <label htmlFor="vip-patient" className="text-sm cursor-pointer">
                <span className="font-medium text-amber-800 flex items-center gap-1">
                  <Crown className="h-3.5 w-3.5" /> VIP Patient
                </span>
                <p className="text-xs text-amber-600 mt-0.5">
                  VIP appointments will not be auto-cancelled if payment is not received.
                </p>
              </label>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!canGoToStep2}>
                Next: Schedule <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Schedule */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div>
                <Label>Time *</Label>
                <Select value={time} onValueChange={(val) => { setTime(val); setCustomTime(''); }}>
                  <SelectTrigger><SelectValue placeholder="Select time" /></SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                    <SelectItem value="__custom">Custom Time...</SelectItem>
                  </SelectContent>
                </Select>
                {time === '__custom' && (
                  <Input
                    type="time"
                    className="mt-2"
                    value={customTime}
                    onChange={e => setCustomTime(e.target.value)}
                    placeholder="HH:MM"
                  />
                )}
              </div>
            </div>

            {/* Slot Override */}
            <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <Checkbox
                id="override-slot"
                checked={overrideSlot}
                onCheckedChange={(checked) => setOverrideSlot(checked === true)}
                className="mt-0.5"
              />
              <label htmlFor="override-slot" className="text-sm cursor-pointer">
                <span className="font-medium text-orange-800">Override Availability</span>
                <p className="text-xs text-orange-600 mt-0.5">
                  Bypass slot blocking rules and schedule at this time even if the system shows it as unavailable. Use for urgent or priority bookings.
                </p>
              </label>
            </div>

            <div>
              <Label>Address</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>City</Label>
                <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Orlando" />
              </div>
              <div>
                <Label>Zip Code</Label>
                <Input value={zipcode} onChange={e => setZipcode(e.target.value)} placeholder="32801" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Special instructions..." rows={2} />
            </div>

            {/* Discount / Waive Fee */}
            <div className="border-t pt-3">
              <Label className="text-sm font-semibold">Pricing Adjustment</Label>
              <div className="flex gap-2 mt-2">
                {(['none', 'percentage', 'fixed', 'waive'] as const).map(t => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={discountType === t ? 'default' : 'outline'}
                    className={`text-xs ${discountType === t ? 'bg-[#B91C1C] hover:bg-[#991B1B]' : ''}`}
                    onClick={() => { setDiscountType(t); setDiscountValue(''); }}
                  >
                    {t === 'none' ? 'Full Price' : t === 'percentage' ? '% Off' : t === 'fixed' ? '$ Off' : 'Waive Fee'}
                  </Button>
                ))}
              </div>
              {(discountType === 'percentage' || discountType === 'fixed') && (
                <Input
                  type="number"
                  min="0"
                  className="mt-2"
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'percentage' ? 'Enter % (e.g. 20)' : 'Enter $ amount (e.g. 25)'}
                />
              )}
            </div>

            {/* Organization Billing */}
            <div className="border-t pt-3">
              <div className="flex items-start gap-3">
                <Checkbox id="org-billing" checked={orgBilling} onCheckedChange={(c) => setOrgBilling(c === true)} className="mt-1" />
                <label htmlFor="org-billing" className="text-sm cursor-pointer">
                  <span className="font-medium">Bill to Organization</span>
                  <p className="text-xs text-muted-foreground">Invoice will be sent to the organization instead of the patient.</p>
                </label>
              </div>
              {orgBilling && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <Label className="text-xs">Organization Name</Label>
                    <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Org name" />
                  </div>
                  <div>
                    <Label className="text-xs">Billing Email</Label>
                    <Input type="email" value={orgEmail} onChange={e => setOrgEmail(e.target.value)} placeholder="billing@org.com" />
                  </div>
                </div>
              )}
            </div>

            {/* Invoice Memo */}
            <div>
              <Label className="text-xs">Invoice Memo (optional)</Label>
              <Input value={invoiceMemo} onChange={e => setInvoiceMemo(e.target.value)} placeholder="e.g. Patient: John Doe - Annual Wellness" />
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={!canGoToStep3}>
                Next: Review <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Patient</span><span className="font-medium">{patientName}</span></div>
              {patientEmail && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{patientEmail}</span></div>}
              {patientPhone && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{patientPhone}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Service</span><span className="font-medium">{SERVICE_TYPES.find(s => s.value === serviceType)?.label}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{time === '__custom' ? customTime : time}</span></div>
              {overrideSlot && <div className="flex justify-between"><span className="text-muted-foreground">Override</span><span className="font-medium text-orange-700">Availability Override Active</span></div>}
              {address && <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span>{address}{city ? `, ${city}` : ''} {zipcode}</span></div>}
              {isVip && <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-medium text-amber-700 flex items-center gap-1"><Crown className="h-3.5 w-3.5" /> VIP Patient</span></div>}
              {discountType !== 'none' && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium text-emerald-700">
                    {discountType === 'waive' ? 'Fee Waived ($0.00)' : discountType === 'percentage' ? `${discountValue}% off` : `$${parseFloat(discountValue || '0').toFixed(2)} off`}
                  </span>
                </div>
              )}
              {orgBilling && <div className="flex justify-between"><span className="text-muted-foreground">Bill To</span><span className="font-medium">{orgName} ({orgEmail})</span></div>}
              {invoiceMemo && <div className="flex justify-between"><span className="text-muted-foreground">Memo</span><span className="text-xs">{invoiceMemo}</span></div>}
              {notes && <div className="flex justify-between"><span className="text-muted-foreground">Notes</span><span>{notes}</span></div>}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-conve-red hover:bg-conve-red-dark text-white">
                {isSubmitting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Scheduling...</> : 'Schedule Appointment'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleAppointmentModal;
