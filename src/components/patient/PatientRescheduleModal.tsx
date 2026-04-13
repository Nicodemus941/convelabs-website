import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarClock, Loader2, AlertTriangle, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PatientRescheduleModalProps {
  appointment: {
    id: string;
    appointment_date: string;
    appointment_time: string;
    service_type: string;
    reschedule_count?: number;
  };
  open: boolean;
  onClose: () => void;
  onRescheduled: () => void;
}

const TIME_SLOTS = [
  '6:00 AM', '6:30 AM', '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM',
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM',
];

// US holidays + blocked date check (simplified)
function isHoliday(date: Date): boolean {
  const y = date.getFullYear();
  const holidays = [
    `${y}-01-01`, `${y}-06-19`, `${y}-07-04`, `${y}-12-24`, `${y}-12-25`, `${y}-12-31`,
  ];
  const ds = `${y}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return holidays.includes(ds);
}

const PatientRescheduleModal: React.FC<PatientRescheduleModalProps> = ({
  appointment, open, onClose, onRescheduled,
}) => {
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const rescheduleCount = appointment.reschedule_count || 0;
  const canReschedule = rescheduleCount < 2;

  // Fetch blocked dates
  useEffect(() => {
    if (!open) return;
    supabase.from('time_blocks' as any).select('start_date, end_date').then(({ data }) => {
      const dates: string[] = [];
      (data || []).forEach((b: any) => {
        let d = new Date(b.start_date + 'T12:00:00');
        const end = new Date(b.end_date + 'T12:00:00');
        while (d <= end) {
          dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
          d.setDate(d.getDate() + 1);
        }
      });
      setBlockedDates(dates);
    });
  }, [open]);

  // Fetch booked slots when date changes
  useEffect(() => {
    if (!newDate) return;
    setLoadingSlots(true);
    supabase.from('appointments')
      .select('appointment_time')
      .gte('appointment_date', `${newDate}T00:00:00`)
      .lte('appointment_date', `${newDate}T23:59:59`)
      .in('status', ['scheduled', 'confirmed', 'en_route', 'in_progress'])
      .then(({ data }) => {
        const booked = new Set<string>();
        (data || []).forEach((a: any) => {
          if (a.appointment_time) {
            const t = String(a.appointment_time);
            // Convert 24h to 12h for matching
            if (!t.includes('AM') && !t.includes('PM')) {
              const [h, m] = t.split(':').map(Number);
              const period = h >= 12 ? 'PM' : 'AM';
              const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
              booked.add(`${h12}:${String(m).padStart(2,'0')} ${period}`);
            } else {
              booked.add(t);
            }
          }
        });
        setBookedSlots(booked);
        setLoadingSlots(false);
      });
  }, [newDate]);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
  const maxDate = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 2);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  const isDateBlocked = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.getDay() === 0 || isHoliday(d) || blockedDates.includes(dateStr);
  };

  const handleSubmit = async () => {
    if (!newDate || !newTime) { toast.error('Please select a date and time'); return; }
    if (isDateBlocked(newDate)) { toast.error('This date is not available'); return; }

    setIsSubmitting(true);
    try {
      // Parse time
      let hours = 0, minutes = 0;
      const [tStr, period] = newTime.split(' ');
      [hours, minutes] = tStr.split(':').map(Number);
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      const appointmentDate = `${newDate}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00`;

      const { error } = await supabase.from('appointments').update({
        appointment_date: appointmentDate,
        appointment_time: newTime,
        rescheduled_at: new Date().toISOString(),
        reschedule_count: rescheduleCount + 1,
        status: 'scheduled',
      }).eq('id', appointment.id);

      if (error) throw error;

      // Log activity
      await supabase.from('activity_log' as any).insert({
        appointment_id: appointment.id,
        activity_type: 'reschedule',
        description: `Patient rescheduled to ${newDate} at ${newTime}`,
        performed_by: 'patient',
      }).catch(() => {});

      // Notify owner + phlebotomist
      supabase.functions.invoke('send-sms-notification', {
        body: { to: '9415279169', message: `Patient rescheduled appointment to ${newDate} at ${newTime}` },
      }).catch(() => {});

      toast.success('Appointment rescheduled!');
      onRescheduled();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reschedule');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canReschedule) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm w-[95vw]">
          <DialogHeader><DialogTitle>Reschedule Limit Reached</DialogTitle></DialogHeader>
          <div className="space-y-4 text-center py-4">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
            <p className="text-sm text-muted-foreground">
              You've rescheduled this appointment {rescheduleCount} times. Please call us to make further changes.
            </p>
            <Button className="w-full" asChild>
              <a href="tel:+19415279169"><Phone className="h-4 w-4 mr-2" /> Call (941) 527-9169</a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-[#B91C1C]" /> Reschedule Appointment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {rescheduleCount === 1 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              This is your last free reschedule. After this, please call to make changes.
            </div>
          )}

          <div>
            <Label>New Date</Label>
            <Input type="date" value={newDate} min={minDate} max={maxDate}
              onChange={e => { setNewDate(e.target.value); setNewTime(''); }} />
            {newDate && isDateBlocked(newDate) && (
              <p className="text-xs text-red-600 mt-1">This date is unavailable. Please select another.</p>
            )}
          </div>

          {newDate && !isDateBlocked(newDate) && (
            <div>
              <Label>New Time</Label>
              {loadingSlots ? (
                <p className="text-xs text-muted-foreground py-2">Checking availability...</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                  {TIME_SLOTS.map(slot => {
                    const isBooked = bookedSlots.has(slot);
                    const isSelected = newTime === slot;
                    return (
                      <button key={slot} type="button" disabled={isBooked}
                        className={`rounded-lg border text-center py-2.5 text-sm font-medium transition-all ${
                          isBooked ? 'bg-gray-50 text-gray-300 line-through cursor-not-allowed'
                          : isSelected ? 'bg-[#B91C1C] text-white border-[#B91C1C] shadow-md'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-[#B91C1C]/50'
                        }`}
                        onClick={() => setNewTime(slot)}>
                        {slot}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 bg-[#B91C1C] hover:bg-[#991B1B] text-white"
              disabled={!newDate || !newTime || isSubmitting || isDateBlocked(newDate)}
              onClick={handleSubmit}>
              {isSubmitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Rescheduling...</> : 'Confirm'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PatientRescheduleModal;
