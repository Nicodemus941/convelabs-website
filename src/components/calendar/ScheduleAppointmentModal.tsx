import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, UserPlus, Clock, ArrowRight, Loader2 } from 'lucide-react';
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
    setShowCreatePatient(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const canGoToStep2 = patientName.trim() && serviceType;
  const canGoToStep3 = date && time;

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
      const [timeStr, period] = time.split(' ');
      let [hours, minutes] = timeStr.split(':').map(Number);
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      const appointmentDate = `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

      const { error } = await supabase.from('appointments').insert([{
        appointment_date: appointmentDate,
        appointment_time: time,
        patient_id: patientId,
        service_type: serviceType,
        status: 'scheduled',
        address: address || 'TBD',
        zipcode: zipcode || '32801',
        notes: `Patient: ${patientName}${patientEmail ? ` | Email: ${patientEmail}` : ''}${patientPhone ? ` | Phone: ${patientPhone}` : ''}${notes ? ` | Notes: ${notes}` : ''} | Created by admin`,
      }]);

      if (error) throw error;

      toast.success('Appointment scheduled!');
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
                  </SelectContent>
                </Select>
              </div>
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
              <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{time}</span></div>
              {address && <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span>{address}{city ? `, ${city}` : ''} {zipcode}</span></div>}
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
