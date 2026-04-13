import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Loader2, AlertCircle, Phone, CheckCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { analytics } from '@/utils/analytics';
import { verifyAppointmentCheckout } from '@/services/stripe/appointmentCheckout';
import BookingFlow from '@/components/booking/BookingFlow';
import Header from '@/components/home/Header';

type PageMode = 'booking' | 'verifying' | 'confirmed' | 'cancelled' | 'error';

interface ConfirmedBooking {
  id: string;
  appointment_date: string;
  appointment_time?: string;
  patient_name?: string;
  patient_email?: string;
  address?: string;
  service_name?: string;
  total_amount?: number;
  tip_amount?: number;
}

const BookNow: React.FC = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const status = searchParams.get('status');

  const [mode, setMode] = useState<PageMode>(() => {
    if (status === 'success' && sessionId) return 'verifying';
    if (status === 'cancel') return 'cancelled';
    return 'booking';
  });

  const [booking, setBooking] = useState<ConfirmedBooking | null>(null);
  const [verifyError, setVerifyError] = useState('');

  // Poll for checkout verification on success return
  const verifyPayment = useCallback(async () => {
    if (!sessionId) return;

    let attempts = 0;
    const maxAttempts = 12; // ~60 seconds
    const pollInterval = 5000;

    const poll = async () => {
      attempts++;
      try {
        const result = await verifyAppointmentCheckout(sessionId);

        if (result.status === 'completed' && result.appointment) {
          setBooking(result.appointment);
          setMode('confirmed');
          analytics.trackFunnelStage('payment_success', 10, { sessionId, bookingId: result.bookingId });
          return;
        }

        if (result.status === 'expired') {
          setVerifyError('Payment session expired. Please try again.');
          setMode('error');
          return;
        }

        // Still pending or processing — retry
        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        } else {
          setVerifyError('Verification is taking longer than expected. Your booking may still be processing — check your email for confirmation.');
          setMode('error');
        }
      } catch (err: any) {
        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        } else {
          setVerifyError('Unable to verify payment status. Please check your email for confirmation or call us.');
          setMode('error');
        }
      }
    };

    poll();
  }, [sessionId]);

  useEffect(() => {
    if (mode === 'verifying') {
      verifyPayment();
    }
    if (mode === 'cancelled') {
      analytics.trackFunnelStage('payment_cancel', 11);
    }
  }, [mode, verifyPayment]);

  return (
    <>
      <Helmet>
        <title>Book Appointment - ConveLabs</title>
        <meta name="description" content="Schedule your at-home lab services with ConveLabs. Book a convenient appointment for mobile phlebotomy services." />
      </Helmet>

      <Header />
      <div className="min-h-[100dvh] bg-gradient-to-b from-gray-50/50 to-background">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 md:py-12">

          {/* Booking flow */}
          {mode === 'booking' && (
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Book Your Appointment</h1>
                <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
                  Licensed phlebotomists at your door. Same-day appointments available across Central Florida.
                </p>
              </div>
              <BookingFlow />
            </>
          )}

          {/* Cancelled: Return from Stripe */}
          {mode === 'cancelled' && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 max-w-md mx-auto text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
              <h2 className="text-2xl font-bold text-foreground">Payment Cancelled</h2>
              <p className="text-muted-foreground">Your payment was not completed. You can try booking again.</p>
              <Button
                onClick={() => { setMode('booking'); window.history.replaceState({}, '', '/book-now'); }}
                className="bg-conve-red hover:bg-conve-red-dark text-white rounded-xl"
              >
                Book Again
              </Button>
            </div>
          )}

          {/* Verifying payment */}
          {mode === 'verifying' && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 max-w-md mx-auto text-center">
              <Loader2 className="h-12 w-12 animate-spin text-conve-red" />
              <h2 className="text-2xl font-bold text-foreground">Verifying Your Payment</h2>
              <p className="text-muted-foreground">
                Please wait while we confirm your booking. This usually takes just a few seconds.
              </p>
              <p className="text-xs text-muted-foreground">
                Do not close this page.
              </p>
            </div>
          )}

          {/* Confirmed */}
          {mode === 'confirmed' && booking && (
            <div className="flex flex-col items-center justify-center py-16 gap-6 max-w-lg mx-auto text-center">
              <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <h2 className="text-3xl font-bold text-foreground">Booking Confirmed!</h2>
              <p className="text-muted-foreground">
                Your appointment has been scheduled. A confirmation email has been sent to{' '}
                <span className="font-medium text-foreground">{booking.patient_email}</span>.
              </p>

              <div className="bg-muted/50 p-6 rounded-xl w-full text-left space-y-3 text-sm">
                {booking.service_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service</span>
                    <span className="font-medium">{booking.service_name}</span>
                  </div>
                )}
                {booking.appointment_date && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span className="font-medium">
                      {new Date(booking.appointment_date).toLocaleDateString('en-US', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </span>
                  </div>
                )}
                {booking.appointment_time && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time</span>
                    <span className="font-medium">{booking.appointment_time}</span>
                  </div>
                )}
                {booking.address && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span className="font-medium text-right max-w-[60%]">{booking.address}</span>
                  </div>
                )}
                {booking.total_amount != null && (
                  <div className="flex justify-between border-t pt-3 mt-3">
                    <span className="font-medium">Total Paid</span>
                    <span className="font-bold text-lg">${booking.total_amount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <Button
                  onClick={() => window.location.href = '/dashboard'}
                  className="bg-conve-red hover:bg-conve-red-dark text-white rounded-xl"
                >
                  Go to Dashboard
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setMode('booking'); window.history.replaceState({}, '', '/book-now'); }}
                  className="rounded-xl"
                >
                  Book Another
                </Button>
              </div>

              {/* Post-Booking Upsells */}
              <div className="w-full space-y-3 mt-6 pt-6 border-t">
                {/* Membership Upsell */}
                <div className="bg-gradient-to-r from-[#B91C1C]/5 to-[#991B1B]/5 border border-[#B91C1C]/20 rounded-xl p-4 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">Save on Every Visit</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {booking.total_amount && booking.total_amount >= 150
                          ? `You paid $${booking.total_amount.toFixed(0)} today. Members pay $130. Save $20 every visit.`
                          : 'ConveLabs members save up to 25% on every blood draw.'}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs border-[#B91C1C]/30 text-[#B91C1C] flex-shrink-0" onClick={() => window.location.href = '/pricing'}>
                      View Plans
                    </Button>
                  </div>
                </div>

                {/* Referral */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm text-emerald-800">Refer a Friend, Both Get $25 Off</p>
                      <p className="text-xs text-emerald-600 mt-1">Share ConveLabs with someone who needs convenient lab work.</p>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs border-emerald-300 text-emerald-700 flex-shrink-0" onClick={() => window.location.href = '/dashboard'}>
                      Get Code
                    </Button>
                  </div>
                </div>

                {/* Rebooking */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm text-blue-800">Need Regular Blood Work?</p>
                      <p className="text-xs text-blue-600 mt-1">Schedule your next visit now and never miss a check-up.</p>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs border-blue-300 text-blue-700 flex-shrink-0" onClick={() => { setMode('booking'); window.history.replaceState({}, '', '/book-now'); }}>
                      Book Next
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {mode === 'error' && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 max-w-md mx-auto text-center">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <h2 className="text-2xl font-bold text-foreground">Verification Issue</h2>
              <p className="text-muted-foreground">{verifyError}</p>
              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <Button
                  onClick={() => { setMode('verifying'); setVerifyError(''); verifyPayment(); }}
                  className="bg-conve-red hover:bg-conve-red-dark text-white rounded-xl"
                >
                  Try Again
                </Button>
                <a
                  href="tel:+19415279169"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-border rounded-xl font-medium text-foreground"
                >
                  <Phone className="h-4 w-4" /> Call (941) 527-9169
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default BookNow;
