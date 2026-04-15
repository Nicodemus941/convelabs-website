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
  const [submitError, setSubmitError] = useState('');

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
  const [gateCode, setGateCode] = useState('');

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
    setGateCode('');
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

  const selectPatient = async (p: PatientResult) => {
    setSelectedPatient(p);
    setPatientName(`${p.first_name} ${p.last_name}`.trim());
    setPatientEmail(p.email || '');
    setPatientPhone(p.phone || '');
    setPatientSearch(`${p.first_name} ${p.last_name}`.trim());
    setShowResults(false);

    // Hydrate from three sources, priority order:
    //   (1) tenant_patients — the canonical patient profile. Holds address,
    //       gate_code, preferred_day/time, standing_order_doctor. When admin
    //       corrects these mid-booking, the submit handler writes them back
    //       (self-healing data).
    //   (2) most recent appointment — latest truth in case they moved and
    //       tenant_patients hasn't caught up.
    //   (3) user_profiles — only exists for patients with auth accounts
    //       (~4% of the book), kept as last-resort fallback.
    // Pre-populating these cuts 30+ seconds off re-entry and kills the
    // "what's your address again?" call that tanks same-day bookings.
    const [{ data: tp }, { data: lastAppt }, { data: profile }] = await Promise.all([
      supabase
        .from('tenant_patients')
        .select('address, city, state, zipcode, gate_code, preferred_day, preferred_time, standing_order_doctor, patient_notes, insurance_provider, insurance_member_id')
        .eq('id', p.id)
        .maybeSingle(),
      supabase
        .from('appointments')
        .select('address_street, address_city, address_zip, gate_code, service_type, notes')
        .eq('patient_id', p.id)
        .order('appointment_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('user_profiles')
        .select('address_street, address_city, address_state, address_zipcode')
        .eq('id', p.id)
        .maybeSingle(),
    ]);

    const street = tp?.address || lastAppt?.address_street || profile?.address_street || '';
    const cityVal = tp?.city || lastAppt?.address_city || profile?.address_city || '';
    const zip = tp?.zipcode || lastAppt?.address_zip || profile?.address_zipcode || '';
    const gc = tp?.gate_code || lastAppt?.gate_code || '';

    if (street) setAddress(street);
    if (cityVal) setCity(cityVal);
    if (zip) setZipcode(zip);
    if (gc) setGateCode(gc);
    if (lastAppt?.service_type && !serviceType) setServiceType(lastAppt.service_type);

    // Stitch phleb-facing context into notes: standing order doctor + prior
    // patient notes ("hard stick", "dog in yard") + last-visit notes.
    const noteBits: string[] = [];
    if (tp?.standing_order_doctor) noteBits.push(`Standing order: Dr. ${tp.standing_order_doctor}`);
    if (tp?.patient_notes) noteBits.push(tp.patient_notes);
    if (lastAppt?.notes) noteBits.push(`Previous visit: ${lastAppt.notes}`);
    if (noteBits.length && !notes) setNotes(noteBits.join(' | '));
  };

  // Manual "look up saved address" — runs hydration using whatever identifier
  // we have (selected id, email, or phone-digits). Rescues cases where the
  // admin typed a name without clicking a dropdown result.
  const [lookupStatus, setLookupStatus] = useState<'idle' | 'searching' | 'found' | 'missing' | 'no-match'>('idle');
  const lookupSavedAddress = async () => {
    setLookupStatus('searching');
    let query = supabase.from('tenant_patients')
      .select('id, address, city, state, zipcode, gate_code, preferred_day, preferred_time, standing_order_doctor, patient_notes');
    let found: any = null;
    if (selectedPatient?.id) {
      const { data } = await query.eq('id', selectedPatient.id).maybeSingle();
      found = data;
    } else if (patientEmail) {
      const { data } = await query.ilike('email', patientEmail.trim()).maybeSingle();
      found = data;
    } else if (patientPhone) {
      const digitsOnly = patientPhone.replace(/\D+/g, '');
      if (digitsOnly) {
        const { data } = await query.ilike('phone', `%${digitsOnly}%`).maybeSingle();
        found = data;
      }
    }
    if (!found) { setLookupStatus('no-match'); return; }
    if (!found.address && !found.city && !found.gate_code) { setLookupStatus('missing'); return; }
    if (found.address) setAddress(found.address);
    if (found.city) setCity(found.city);
    if (found.zipcode) setZipcode(found.zipcode);
    if (found.gate_code) setGateCode(found.gate_code);
    const noteBits: string[] = [];
    if (found.standing_order_doctor) noteBits.push(`Standing order: Dr. ${found.standing_order_doctor}`);
    if (found.patient_notes) noteBits.push(found.patient_notes);
    if (noteBits.length && !notes) setNotes(noteBits.join(' | '));
    setLookupStatus('found');
  };

  const canGoToStep2 = patientName.trim() && serviceType;
  const canGoToStep3 = date && time;

  // Compute surcharges for preview (same logic as handleSubmit)
  const EXTENDED_CITIES_LIST = ['lake nona','celebration','kissimmee','sanford','eustis','clermont','montverde','deltona','geneva','tavares','mount dora','leesburg','groveland','mascotte','minneola','daytona beach','deland','debary','orange city'];
  const previewSurcharges: { label: string; amount: number }[] = [];
  if (city && EXTENDED_CITIES_LIST.some(c => city.toLowerCase().includes(c))) previewSurcharges.push({ label: 'Extended Area', amount: 75 });
  if (date && [0, 6].includes(new Date(date + 'T12:00:00').getDay())) previewSurcharges.push({ label: 'Weekend', amount: 75 });
  if (time && (() => { const [t, p] = time.split(' '); const h = parseInt(t); return (p === 'PM' && h !== 12 ? h + 12 : h) >= 17; })()) previewSurcharges.push({ label: 'After-Hours', amount: 50 });
  if (date === new Date().toISOString().split('T')[0]) previewSurcharges.push({ label: 'Same-Day', amount: 100 });
  const previewBasePrice = SERVICE_TYPES.find(s => s.value === serviceType)?.price || 150;
  const previewSurchargeTotal = previewSurcharges.reduce((s, x) => s + x.amount, 0);
  const previewTotal = discountType === 'waive' ? 0
    : discountType === 'percentage' && discountValue ? Math.round((previewBasePrice + previewSurchargeTotal) * (1 - (parseFloat(discountValue) || 0) / 100) * 100) / 100
    : discountType === 'fixed' && discountValue ? Math.max((previewBasePrice + previewSurchargeTotal) - (parseFloat(discountValue) || 0), 0)
    : previewBasePrice + previewSurchargeTotal;

  const handleSubmit = async () => {
    console.log('handleSubmit triggered', { patientName, serviceType, date, time, discountType });
    setSubmitError('');
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

      // patient_id is now optional — admin can schedule without a matching patient record
      if (!patientId) {
        console.log('No patient_id found — scheduling without patient link');
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

      // Calculate price with surcharges + discount
      const svc = SERVICE_TYPES.find(s => s.value === serviceType);
      const basePrice = svc?.price || 150;

      // Auto-detect surcharges
      const EXTENDED_CITIES = ['lake nona','celebration','kissimmee','sanford','eustis','clermont','montverde','deltona','geneva','tavares','mount dora','leesburg','groveland','mascotte','minneola','daytona beach','deland','debary','orange city'];
      const isExtendedArea = EXTENDED_CITIES.some(c => city.toLowerCase().includes(c));
      const appointmentDay = date ? new Date(date + 'T12:00:00').getDay() : 1;
      const isWeekend = appointmentDay === 0 || appointmentDay === 6;
      const isAfterHours = time && (() => {
        const [tStr, period] = time.split(' ');
        const [h] = tStr.split(':').map(Number);
        const h24 = period === 'PM' && h !== 12 ? h + 12 : h;
        return h24 >= 17;
      })();
      const isSameDay = date === new Date().toISOString().split('T')[0];

      let surchargeTotal = 0;
      const surchargeItems: string[] = [];
      if (isExtendedArea) { surchargeTotal += 75; surchargeItems.push('Extended area +$75'); }
      if (isWeekend) { surchargeTotal += 75; surchargeItems.push('Weekend +$75'); }
      if (isAfterHours) { surchargeTotal += 50; surchargeItems.push('After-hours +$50'); }
      if (isSameDay) { surchargeTotal += 100; surchargeItems.push('Same-day +$100'); }

      let finalPrice = basePrice + surchargeTotal;
      let discountNote = surchargeItems.join(', ');

      if (discountType === 'waive') { finalPrice = 0; discountNote = 'Fee waived'; }
      else if (discountType === 'percentage' && discountValue) {
        const pct = Math.min(parseFloat(discountValue) || 0, 100);
        finalPrice = Math.round(finalPrice * (1 - pct / 100) * 100) / 100;
        discountNote += (discountNote ? ' | ' : '') + `${pct}% discount`;
      } else if (discountType === 'fixed' && discountValue) {
        finalPrice = Math.max(finalPrice - (parseFloat(discountValue) || 0), 0);
        discountNote += (discountNote ? ' | ' : '') + `$${parseFloat(discountValue).toFixed(2)} off`;
      }

      const isWaived = finalPrice === 0;
      const invoiceDueAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const billingEmail = orgBilling && orgEmail ? orgEmail : patientEmail;

      // Determine duration
      const durationMap: Record<string, number> = {
        'therapeutic': 75, 'specialty-kit': 75, 'specialty-kit-genova': 80,
        'partner-nd-wellness': 65, 'partner-aristotle-education': 75,
      };
      const duration = durationMap[serviceType] || 60;

      // Build appointment payload
      const appointmentPayload: any = {
        appointment_date: appointmentDate,
        appointment_time: time,
        patient_name: patientName,
        patient_email: patientEmail || null,
        patient_phone: patientPhone || null,
        service_type: serviceType,
        service_name: svc?.label || serviceType,
        status: 'scheduled',
        address: [address, city, zipcode].filter(Boolean).join(', ') || 'TBD',
        zipcode: zipcode || '32801',
        total_amount: finalPrice,
        service_price: basePrice,
        surcharge_amount: surchargeTotal,
        duration_minutes: duration,
        booking_source: 'manual',
        is_vip: isVip,
        invoice_status: isWaived ? 'not_required' : 'sent',
        invoice_sent_at: isWaived ? null : new Date().toISOString(),
        invoice_due_at: isWaived ? null : invoiceDueAt,
        payment_status: isWaived ? 'completed' : 'pending',
        gate_code: gateCode || null,
        phlebotomist_id: '91c76708-8c5b-4068-92c6-323805a3b164',
        notes: [notes, gateCode ? `Gate: ${gateCode}` : '', discountNote, orgBilling ? `Org: ${orgName}` : '', invoiceMemo ? `Memo: ${invoiceMemo}` : ''].filter(Boolean).join(' | ') || null,
      };

      // Only include patient_id if we found one (column is nullable)
      if (patientId) {
        appointmentPayload.patient_id = patientId;
      }

      console.log('Creating appointment:', JSON.stringify(appointmentPayload, null, 2));

      // Create appointment
      const { data: newAppt, error } = await supabase.from('appointments').insert([appointmentPayload]).select().single();

      if (error) {
        console.error('Appointment creation error:', error);
        const errMsg = `Failed: ${error.message || 'Unknown database error'}`;
        setSubmitError(errMsg);
        toast.error(errMsg, { duration: 8000 });
        setIsSubmitting(false);
        return;
      }

      if (!newAppt) {
        console.error('No appointment returned after insert');
        const errMsg = 'Appointment was not created. RLS policy may be blocking — contact support.';
        setSubmitError(errMsg);
        toast.error(errMsg, { duration: 8000 });
        setIsSubmitting(false);
        return;
      }

      console.log('Appointment created:', newAppt.id);

      // Self-healing data: if admin typed a new/corrected address or gate_code
      // for a known patient, write it back to tenant_patients so the next
      // booking pre-fills with the right info. Fire-and-forget — a failure
      // here must not block the appointment that just saved.
      if (patientId) {
        const backfill: Record<string, string> = {};
        if (address) backfill.address = address;
        if (city) backfill.city = city;
        if (zipcode) backfill.zipcode = zipcode;
        if (gateCode) backfill.gate_code = gateCode;
        if (Object.keys(backfill).length > 0) {
          supabase
            .from('tenant_patients')
            .update({ ...backfill, updated_at: new Date().toISOString() })
            .eq('id', patientId)
            .then(({ error: bfErr }) => {
              if (bfErr) console.warn('tenant_patients backfill failed (non-fatal):', bfErr.message);
            });
        }
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

      // Send ALL notifications (non-blocking)
      if (newAppt) {
        const svcLabel = svc?.label || serviceType;
        const fullAddress = [address, city, zipcode].filter(Boolean).join(', ') || 'TBD';

        // 1. Patient confirmation (email + SMS)
        supabase.functions.invoke('send-appointment-confirmation', {
          body: {
            appointmentId: newAppt.id,
            patientName,
            patientEmail: patientEmail || null,
            patientPhone: patientPhone || null,
            serviceName: svcLabel,
            appointmentDate: date,
            appointmentTime: time,
            address: fullAddress,
            totalAmount: finalPrice,
            isWaived,
          },
        }).catch(err => console.error('Patient confirmation error:', err));

        // 2. Owner SMS
        supabase.functions.invoke('send-sms-notification', {
          body: {
            to: '9415279169',
            message: `💰 New Booking (Admin)\n\nPatient: ${patientName}\nService: ${svcLabel}\nRevenue: $${finalPrice.toFixed(2)}\nDate: ${date} at ${time}\nSource: manual`,
          },
        }).catch(() => {});

        // 3. Phlebotomist SMS
        supabase.from('staff_profiles').select('phone').eq('user_id', '91c76708-8c5b-4068-92c6-323805a3b164').maybeSingle()
          .then(({ data: staff }) => {
            if (staff?.phone) {
              supabase.functions.invoke('send-sms-notification', {
                body: {
                  to: staff.phone,
                  message: `New Booking!\n\nPatient: ${patientName}\nService: ${svcLabel}\nDate: ${date} at ${time}\nLocation: ${fullAddress}\nAmount: $${finalPrice.toFixed(2)}`,
                },
              }).catch(() => {});
            }
          });
      }

      const statusMsg = isWaived ? ' (Fee waived)' : isVip ? ' (VIP)' : ' Invoice sent to patient.';
      toast.success(`Appointment scheduled!${statusMsg}`);
      handleClose();
      onCreated();
    } catch (err: any) {
      console.error('Schedule error:', err);
      const errMsg = err.message || 'Failed to schedule appointment';
      setSubmitError(errMsg);
      toast.error(errMsg, { duration: 8000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full p-4 sm:p-6">
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
              <div className="flex items-center justify-between">
                <Label>Address</Label>
                {(selectedPatient || patientEmail || patientPhone) && (
                  <button
                    type="button"
                    onClick={lookupSavedAddress}
                    className="text-xs text-[#B91C1C] hover:underline"
                  >
                    {lookupStatus === 'searching' ? 'Looking up…' : '↻ Look up saved address'}
                  </button>
                )}
              </div>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St" />
              {lookupStatus === 'found' && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 mt-1">
                  ✓ Loaded saved address from patient profile.
                </p>
              )}
              {lookupStatus === 'missing' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                  ⚠ Patient on file but no address saved yet — ask the patient; we'll save it back for next time.
                </p>
              )}
              {lookupStatus === 'no-match' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                  ⚠ No matching patient in our records by that email/phone.
                </p>
              )}
              {lookupStatus === 'idle' && selectedPatient && !address && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                  ⚠ No address loaded. Click "Look up saved address" or type manually.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>City</Label>
                <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Orlando" />
              </div>
              <div>
                <Label>Zip Code</Label>
                <Input value={zipcode} onChange={e => setZipcode(e.target.value)} placeholder="32801" />
              </div>
              <div>
                <Label>Gate Code</Label>
                <Input value={gateCode} onChange={e => setGateCode(e.target.value)} placeholder="#1234" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Special instructions, gate code, parking..." rows={2} />
            </div>

            {/* Pricing & Invoicing */}
            <div className="border-t pt-3">
              <Label className="text-sm font-semibold">Pricing & Invoice</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button type="button" onClick={() => { setDiscountType('none'); setDiscountValue(''); }}
                  className={`p-2.5 rounded-lg border-2 text-xs font-medium transition-all text-left ${
                    discountType === 'none' ? 'border-[#B91C1C] bg-[#B91C1C]/10 text-[#B91C1C]' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <span className="block font-semibold">Full Price</span>
                  <span className="block text-[10px] opacity-70 mt-0.5">Invoice sent to patient</span>
                </button>
                <button type="button" onClick={() => { setDiscountType('waive'); setDiscountValue(''); }}
                  className={`p-2.5 rounded-lg border-2 text-xs font-medium transition-all text-left ${
                    discountType === 'waive' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <span className="block font-semibold">Waive Fee</span>
                  <span className="block text-[10px] opacity-70 mt-0.5">No invoice, marked as paid</span>
                </button>
                <button type="button" onClick={() => { setDiscountType('percentage'); setDiscountValue(''); }}
                  className={`p-2.5 rounded-lg border-2 text-xs font-medium transition-all text-left ${
                    discountType === 'percentage' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <span className="block font-semibold">% Discount</span>
                  <span className="block text-[10px] opacity-70 mt-0.5">Percentage off base price</span>
                </button>
                <button type="button" onClick={() => { setDiscountType('fixed'); setDiscountValue(''); }}
                  className={`p-2.5 rounded-lg border-2 text-xs font-medium transition-all text-left ${
                    discountType === 'fixed' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <span className="block font-semibold">$ Discount</span>
                  <span className="block text-[10px] opacity-70 mt-0.5">Fixed dollar amount off</span>
                </button>
              </div>

              {/* Discount amount input */}
              {(discountType === 'percentage' || discountType === 'fixed') && (
                <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                  <Label className="text-xs font-medium">
                    {discountType === 'percentage' ? 'Discount Percentage' : 'Discount Amount ($)'}
                  </Label>
                  <div className="flex items-center gap-2 mt-1">
                    {discountType === 'percentage' && <span className="text-sm text-muted-foreground">%</span>}
                    {discountType === 'fixed' && <span className="text-sm text-muted-foreground">$</span>}
                    <Input
                      type="number"
                      min="0"
                      max={discountType === 'percentage' ? '100' : undefined}
                      value={discountValue}
                      onChange={e => setDiscountValue(e.target.value)}
                      placeholder={discountType === 'percentage' ? 'e.g. 25' : 'e.g. 50'}
                      className="flex-1"
                      autoFocus
                    />
                  </div>
                  {discountValue && (
                    <p className="text-xs text-emerald-600 mt-1 font-medium">
                      Final price: ${(() => {
                        const base = SERVICE_TYPES.find(s => s.value === serviceType)?.price || 150;
                        if (discountType === 'percentage') return Math.round(base * (1 - (parseFloat(discountValue) || 0) / 100) * 100) / 100;
                        return Math.max(base - (parseFloat(discountValue) || 0), 0);
                      })().toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              {/* Status messages */}
              {discountType === 'waive' && (
                <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-xs text-emerald-700 font-medium">Fee waived — no invoice, appointment marked as paid.</p>
                </div>
              )}
              {discountType === 'none' && (
                <p className="text-xs text-muted-foreground mt-2">
                  Stripe invoice for <span className="font-semibold">${SERVICE_TYPES.find(s => s.value === serviceType)?.price || 150}</span> → {patientEmail || 'patient email'}
                </p>
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
              <div className="flex justify-between"><span className="text-muted-foreground">Service</span><span className="font-medium">{SERVICE_TYPES.find(s => s.value === serviceType)?.label} — ${previewBasePrice}</span></div>
              {previewSurcharges.map((sc, i) => (
                <div key={i} className="flex justify-between text-xs"><span className="text-amber-600">+ {sc.label}</span><span className="text-amber-600">+${sc.amount}</span></div>
              ))}
              <div className="flex justify-between border-t pt-1 mt-1"><span className="font-semibold">Total</span><span className="font-bold text-[#B91C1C]">${previewTotal.toFixed(2)}</span></div>
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

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <p className="font-medium">Error:</p>
                <p className="text-xs mt-1">{submitError}</p>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => { setStep(2); setSubmitError(''); }}>Back</Button>
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
