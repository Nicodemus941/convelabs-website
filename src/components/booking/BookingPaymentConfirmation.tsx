import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Calendar, MapPin, User, CalendarPlus, Home, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import type { CheckoutStatusResponse } from '@/services/ghsBookingService';

interface BookingPaymentConfirmationProps {
  booking: CheckoutStatusResponse;
}

const BookingPaymentConfirmation: React.FC<BookingPaymentConfirmationProps> = ({ booking }) => {
  const navigate = useNavigate();

  const serviceNameFallbacks: Record<string, string> = {
    'at_home_blood_draw': 'Mobile Blood Draw (At Home)',
    'blood_draw': 'Mobile Blood Draw (At Home)',
    'senior_blood_draw': 'Senior Blood Draw (65+)',
    'doctor_office_blood_draw': 'Doctor Office Blood Draw',
    'therapeutic_phlebotomy': 'Therapeutic Phlebotomy',
    'specialty_collection': 'Specialty Collection Kit',
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const formatTime12h = (time?: string) => {
    if (!time) return '';
    if (time.includes('AM') || time.includes('PM')) return time;
    const [h, m] = time.split(':').map(Number);
    if (isNaN(h)) return time;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const displayServiceName = booking.serviceName && !booking.serviceName.includes('_')
    ? booking.serviceName
    : serviceNameFallbacks[booking.serviceName || ''] || 'Mobile Blood Draw';

  const addToCalendarUrl = () => {
    if (!booking.appointmentDate || !booking.appointmentTime) return '#';
    const start = new Date(`${booking.appointmentDate}T${booking.appointmentTime}`);
    const end = new Date(start.getTime() + 30 * 60000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('ConveLabs Mobile Blood Draw')}&dates=${fmt(start)}/${fmt(end)}&location=${encodeURIComponent(booking.address || '')}&details=${encodeURIComponent(`Confirmation: ${booking.confirmationNumber || booking.bookingId}`)}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-2xl mx-auto"
    >
      {/* Success header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Booking Confirmed!</h2>
        {booking.confirmationNumber && (
          <p className="text-muted-foreground">Confirmation #{booking.confirmationNumber}</p>
        )}
      </div>

      {/* Booking details */}
      <div className="bg-muted/30 rounded-xl p-5 sm:p-6 space-y-3 mb-6 border border-border">
        <DetailRow icon={<User className="h-5 w-5 text-conve-red" />} label="Service" value={displayServiceName} />
        {booking.appointmentDate && (
          <DetailRow
            icon={<Calendar className="h-5 w-5 text-conve-red" />}
            label="Date & Time"
            value={`${formatDate(booking.appointmentDate)} · ${booking.arrivalWindow || formatTime12h(booking.appointmentTime) || ''}`}
          />
        )}
        {booking.address && (
          <DetailRow icon={<MapPin className="h-5 w-5 text-conve-red" />} label="Location" value={booking.address} />
        )}
        {booking.providerName && (
          <DetailRow icon={<User className="h-5 w-5 text-conve-red" />} label="Provider" value={booking.providerName} />
        )}
        {booking.bookingId && (
          <DetailRow icon={<CheckCircle className="h-5 w-5 text-conve-red" />} label="Booking ID" value={booking.bookingId} />
        )}
        {booking.price != null && (
          <div className="border-t border-border pt-3 flex justify-between items-center">
            <span className="text-foreground font-semibold">Total Charged</span>
            <span className="text-xl font-bold text-conve-red">${booking.price}</span>
          </div>
        )}
      </div>

      {/* Notification message */}
      <div className="bg-accent/50 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <Mail className="h-5 w-5 text-conve-red flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-foreground text-sm mb-1">Confirmation Sent</h3>
            <p className="text-sm text-muted-foreground">
              An SMS and email confirmation have been sent with your appointment details. Your phlebotomist will contact you before arriving.
            </p>
          </div>
        </div>
      </div>

      {/* What to expect */}
      <div className="bg-muted/30 rounded-xl p-4 mb-6 border border-border">
        <h3 className="font-semibold text-foreground text-sm mb-2">What to Expect</h3>
        <ul className="text-sm text-muted-foreground space-y-1.5">
          <li>• Your phlebotomist will contact you before arriving</li>
          <li>• Please have your lab order ready if applicable</li>
          <li>• Stay hydrated before your appointment</li>
          <li>• The visit typically takes 10-15 minutes</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={addToCalendarUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-2 h-12 px-5 border-2 border-border rounded-xl font-semibold text-sm text-foreground hover:bg-accent transition-colors min-h-[44px]"
        >
          <CalendarPlus className="h-4 w-4" /> Add to Calendar
        </a>
        <Button onClick={() => navigate('/')} variant="outline" className="flex-1 h-12 rounded-xl min-h-[44px]">
          <Home className="h-4 w-4 mr-2" /> Return Home
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        Need help? Call <a href="tel:+19415279169" className="text-conve-red font-semibold">(941) 527-9169</a>
      </p>
    </motion.div>
  );
};

const DetailRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-start gap-3">
    <div className="flex-shrink-0 mt-0.5">{icon}</div>
    <div>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block text-sm font-medium text-foreground">{value}</span>
    </div>
  </div>
);

export default BookingPaymentConfirmation;
