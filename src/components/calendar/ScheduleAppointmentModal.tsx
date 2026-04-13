import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, ArrowRight, Loader2, Crown, Search, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ScheduleAppointmentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultDate?: string;
}

const SERVICE_TYPES = [
  { value: 'mobile', label: 'Mobile Blood Draw', price: 150 },
  { value: 'in-office', label: 'Office Visit', price: 55 },
  { value: 'senior', label: 'Senior (65+)', price: 100 },
  { value: 'specialty-kit', label: 'Specialty Collection Kit', price: 185 },
  { value: 'specialty-kit-genova', label: 'Genova Diagnostics', price: 200 },
  { value: 'therapeutic', label: 'Therapeutic Phlebotomy', price: 200 },
  { value: 'partner-nd-wellness', label: 'ND Wellness', price: 85 },
  { value: 'partner-restoration-place', label: 'Restoration Place', price: 125 },
  { value: 'partner-elite-medical-concierge', label: 'Elite Medical Concierge', price: 72.25 },
  { value: 'partner-naturamed', label: 'NaturaMed', price: 85 },
  { value: 'partner-aristotle-education', label: 'Aristotle Education', price: 185 },
];

const TIME_SLOTS = [
  '6:00 AM', '6:30 AM', '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM',
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM',
];

const AFTER_HOURS_SLOTS = [
  '5:30 PM', '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM',
];

interface PatientResult {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

const ScheduleAppointmentModal: React.FC<ScheduleAppointmentModalProps> = ({
  open, onClose, onCreated, defaultDate,
}) => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Patient search
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<PatientResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);

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

  const resetForm = () => {
    setStep(1);
    setPatientSearch('');
    setPatientResults([]);
    setSelectedPatient(null);
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
  };

  const handleClose = () => { resetForm(); onClose(); };

  // Search patients as user types
  useEffect(() => {
    if (patientSearch.length < 2) { setPatientResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('tenant_patients')
        .select('id, first_name, last_name, email, phone')
        .or(`first_name.ilike.%${patientSearch}%,last_name.ilike.%${patientSearch}%,email.ilike.%${patientSearch}%`)
        .limit(5);
      setPatientResults((data as PatientResult[]) || []);
      setShowResults(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [patientSearch]);

  const selectPatient = (p: PatientResult) => {
    setSelectedPatient(p);
    setPatientName(`${p.first_name} ${p.last_name}`.trim());
    setPatientEmail(p.email || '');
    setPatientPhone(p.phone || '');
    setPatientSearch(`${p.first_name} ${p.last_name}`.trim());
    setShowResults(false);
  };

  const canGoToStep2 = patientName.trim() && serviceType;
  const canGoToStep3 = date && time;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Use selected patient ID or find by email/name
      let patientId = selectedPatient?.id || null;

      if (!patientId && patientEmail) {
        const { data } = await supabase.from('tenant_patients').select('id').ilike('email', patientEmail.trim()).maybeSingle();
        if (data) patientId = data.id;
      }
      if (!patientId && patientName) {
        const firstName = patientName.split(' ')[0];
        const { data } = await supabase.from('tenant_patients').select('id').ilike('first_name', `%${firstName}%`).maybeSingle();
        if (data) patientId = data.id;
      }
      // Fallback: current user
      if (!patientId) {
        const { data: session } = await supabase.auth.getSession();
        patientId = session?.session?.user?.id || null;
      }

      if (!patientId) {
        toast.error('Could not find patient. Check the name or email.');
        setIsSubmitting(false);
        return;
      }

      // Parse time
      let hours = 0, minutes = 0;
      if (time.includes('AM') || time.includes('PM')) {
        const [tStr, period] = time.split(' ');
        [hours, minutes] = tStr.split(':').map(Number);
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
      }
      const appointmentDate = `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

      // Calculate price with discount
      const svc = SERVICE_TYPES.find(s => s.value === serviceType);
      const basePrice = svc?.price || 150;
      let finalPrice = basePrice;
      let discountNote = '';

      if (discountType === 'waive') { finalPrice = 0; discountNote = ' | Fee waived'; }
      else if (discountType === 'percentage' && discountValue) {
        const pct = Math.min(parseFloat(discountValue) || 0, 100);
        finalPrice = Math.round(basePrice * (1 - pct / 100) * 100) / 100;
        discountNote = ` | ${pct}% discount`;
      } else if (discountType === 'fixed' && discountValue) {
        finalPrice = Math.max(basePrice - (parseFloat(discountValue) || 0), 0);
        discountNote = ` | $${parseFloat(discountValue).toFixed(2)} off`;
      }

      const isWaived = finalPrice === 0;
      const invoiceDueAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const billingEmail = orgBilling && orgEmail ? orgEmail : patientEmail;

      // Create appointment
      const { data: newAppt, error } = await supabase.from('appointments').insert([{
        appointment_date: appointmentDate,
        appointment_time: time,
        patient_id: patientId,
        service_type: serviceType,
        status: 'scheduled',
        address: [address, city, zipcode].filter(Boolean).join(', ') || 'TBD',
        zipcode: zipcode || '32801',
        total_amount: finalPrice,
        service_price: finalPrice,
        duration_minutes: serviceType === 'therapeutic' ? 75 : serviceType === 'specialty-kit-genova' ? 80 : 60,
        booking_source: 'manual',
        is_vip: isVip,
        invoice_status: isWaived ? 'not_required' : 'sent',
        invoice_sent_at: isWaived ? null : new Date().toISOString(),
        invoice_due_at: isWaived ? null : invoiceDueAt,
        payment_status: isWaived ? 'completed' : 'pending',
        phlebotomist_id: '91c76708-8c5b-4068-92c6-323805a3b164', // Auto-assign to Nico
        notes: `Patient: ${patientName}${patientEmail ? ` | Email: ${patientEmail}` : ''}${patientPhone ? ` | Phone: ${patientPhone}` : ''}${discountNote}${orgBilling ? ` | Org: ${orgName}` : ''}${invoiceMemo ? ` | Memo: ${invoiceMemo}` : ''}${notes ? ` | Notes: ${notes}` : ''} | Created by admin`,
      }]).select().single();

      if (error) {
        console.error('Appointment creation error:', error);
        toast.error(error.message || 'Failed to create appointment');
        setIsSubmitting(false);
        return;
      }

      // Send Stripe invoice (non-blocking)
      if (newAppt && !isWaived && billingEmail) {
        supabase.functions.invoke('send-appointment-invoice', {
          body: {
            appointmentId: newAppt.id,
            patientName: orgBilling ? orgName : patientName,
            patientEmail: billingEmail,
            patientPhone,
            serviceType,
            serviceName: svc?.label || serviceType,
            servicePrice: finalPrice,
            appointmentDate: date,
            appointmentTime: time,
            address: [address, city, zipcode].filter(Boolean).join(', ') || 'TBD',
            isVip,
            memo: invoiceMemo || (orgBilling ? `Patient: ${patientName}` : ''),
            orgName: orgBilling ? orgName : undefined,
          },
        }).then(() => {
          console.log('Invoice sent for appointment', newAppt.id);
        }).catch(err => {
          console.error('Invoice send error:', err);
        });
      }

      const statusMsg = isWaived ? ' (Fee waived)' : isVip ? ' (VIP)' : ' Invoice sent to patient.';
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule New Appointment</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          {['Patient & Service', 'Schedule', 'Confirm'].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                i + 1 <= step ? 'bg-[#B91C1C] text-white' : 'bg-muted text-muted-foreground'
              }`}>{i + 1}</div>
              <span className={`text-xs font-medium ${i + 1 <= step ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
              {i < 2 && <div className={`w-8 h-px ${i + 1 < step ? 'bg-[#B91C1C]' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Patient & Service */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Patient Search */}
            <div className="relative">
              <Label>Search Patient *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={patientSearch}
                  onChange={e => { setPatientSearch(e.target.value); setShowResults(true); }}
                  placeholder="Type patient name or email..."
                  className="pl-9"
                  onFocus={() => patientResults.length > 0 && setShowResults(true)}
                />
              </div>
              {showResults && patientResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {patientResults.map(p => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b last:border-0"
                      onClick={() => selectPatient(p)}
                    >
                      <p className="font-medium text-sm">{p.first_name} {p.last_name}</p>
                      <p className="text-xs text-muted-foreground">{p.email || 'No email'} {p.phone ? `· ${p.phone}` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
              {patientSearch.length >= 2 && patientResults.length === 0 && showResults && (
                <p className="text-xs text-muted-foreground mt-1">No patients found. Fill in details manually below.</p>
              )}
            </div>

            {selectedPatient && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-emerald-800">Patient selected: {patientName}</p>
                {patientEmail && <p className="text-xs text-emerald-600">{patientEmail}</p>}
                {patientPhone && <p className="text-xs text-emerald-600">{patientPhone}</p>}
              </div>
            )}

            {!selectedPatient && (
              <>
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
              </>
            )}

            <div>
              <Label>Service *</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger><SelectValue placeholder="Select a service" /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label} — ${s.price}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <Checkbox id="vip-patient" checked={isVip} onCheckedChange={(c) => setIsVip(c === true)} className="mt-0.5" />
              <label htmlFor="vip-patient" className="text-sm cursor-pointer">
                <span className="font-medium text-amber-800 flex items-center gap-1"><Crown className="h-3.5 w-3.5" /> VIP Patient</span>
                <p className="text-xs text-amber-600 mt-0.5">VIP appointments will not be auto-cancelled if payment is not received.</p>
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
                <Select value={time} onValueChange={setTime}>
                  <SelectTrigger><SelectValue placeholder="Select time" /></SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                    <div className="px-2 py-1.5 text-[10px] font-semibold text-amber-600 uppercase tracking-wide">After Hours (+$50)</div>
                    {AFTER_HOURS_SLOTS.map(t => (
                      <SelectItem key={t} value={t}>{t} ⏰</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <Checkbox id="override-slot" checked={overrideSlot} onCheckedChange={(c) => setOverrideSlot(c === true)} className="mt-0.5" />
              <label htmlFor="override-slot" className="text-sm cursor-pointer">
                <span className="font-medium text-orange-800">Override Availability</span>
                <p className="text-xs text-orange-600 mt-0.5">Bypass slot blocking for urgent bookings.</p>
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

            {/* Pricing */}
            <div className="border-t pt-3">
              <Label className="text-sm font-semibold">Pricing</Label>
              <div className="flex gap-2 mt-2">
                {(['none', 'percentage', 'fixed', 'waive'] as const).map(t => (
                  <Button key={t} type="button" size="sm" variant={discountType === t ? 'default' : 'outline'}
                    className={`text-xs ${discountType === t ? 'bg-[#B91C1C] hover:bg-[#991B1B]' : ''}`}
                    onClick={() => { setDiscountType(t); setDiscountValue(''); }}>
                    {t === 'none' ? 'Full Price' : t === 'percentage' ? '% Off' : t === 'fixed' ? '$ Off' : 'Waive'}
                  </Button>
                ))}
              </div>
              {(discountType === 'percentage' || discountType === 'fixed') && (
                <Input type="number" min="0" className="mt-2" value={discountValue} onChange={e => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'percentage' ? 'Enter %' : 'Enter $ amount'} />
              )}
            </div>

            {/* Org Billing */}
            <div className="border-t pt-3">
              <div className="flex items-start gap-3">
                <Checkbox id="org-billing" checked={orgBilling} onCheckedChange={(c) => setOrgBilling(c === true)} className="mt-1" />
                <label htmlFor="org-billing" className="text-sm cursor-pointer">
                  <span className="font-medium">Bill to Organization</span>
                  <p className="text-xs text-muted-foreground">Invoice sent to the organization.</p>
                </label>
              </div>
              {orgBilling && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Org name" />
                  <Input type="email" value={orgEmail} onChange={e => setOrgEmail(e.target.value)} placeholder="billing@org.com" />
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">Invoice Memo (optional)</Label>
              <Input value={invoiceMemo} onChange={e => setInvoiceMemo(e.target.value)} placeholder="e.g. Patient: John Doe - Annual Wellness" />
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={!canGoToStep3}>Next: Review <ArrowRight className="ml-1 h-4 w-4" /></Button>
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
              <div className="flex justify-between"><span className="text-muted-foreground">Service</span><span className="font-medium">{SERVICE_TYPES.find(s => s.value === serviceType)?.label} — ${SERVICE_TYPES.find(s => s.value === serviceType)?.price}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{time}</span></div>
              {address && <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span>{[address, city, zipcode].filter(Boolean).join(', ')}</span></div>}
              {isVip && <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-medium text-amber-700 flex items-center gap-1"><Crown className="h-3.5 w-3.5" /> VIP</span></div>}
              {discountType !== 'none' && (
                <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="font-medium text-emerald-700">
                  {discountType === 'waive' ? 'Fee Waived ($0)' : discountType === 'percentage' ? `${discountValue}% off` : `$${parseFloat(discountValue || '0').toFixed(2)} off`}
                </span></div>
              )}
              {orgBilling && <div className="flex justify-between"><span className="text-muted-foreground">Bill To</span><span>{orgName} ({orgEmail})</span></div>}
              {invoiceMemo && <div className="flex justify-between"><span className="text-muted-foreground">Memo</span><span className="text-xs">{invoiceMemo}</span></div>}
              {overrideSlot && <div className="flex justify-between"><span className="text-muted-foreground">Override</span><span className="text-orange-700">Availability Override Active</span></div>}
              {notes && <div className="flex justify-between"><span className="text-muted-foreground">Notes</span><span className="text-xs">{notes}</span></div>}
            </div>

            {!discountType || discountType === 'none' ? (
              <p className="text-xs text-muted-foreground text-center">An invoice for ${SERVICE_TYPES.find(s => s.value === serviceType)?.price || 150} will be sent to the patient via Stripe.</p>
            ) : discountType === 'waive' ? (
              <p className="text-xs text-emerald-600 text-center">Fee waived — no invoice will be sent.</p>
            ) : null}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-[#B91C1C] hover:bg-[#991B1B] text-white">
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
