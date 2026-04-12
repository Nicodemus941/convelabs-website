import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Loader2, AlertCircle, Phone } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { analytics } from '@/utils/analytics';
import { getCheckoutStatus, type CheckoutStatusResponse } from '@/services/ghsBookingService';
import BookingPaymentConfirmation from '@/components/booking/BookingPaymentConfirmation';
import { GHS_BOOKING_PAGE } from '@/lib/constants/urls';

type PageMode = 'booking' | 'verifying' | 'confirmed' | 'cancelled' | 'error';

const BookNow: React.FC = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const status = searchParams.get('status');
  const zipFromUrl = searchParams.get('zip');
  const partnerCode = searchParams.get('partner');

  const [mode, setMode] = useState<PageMode>(() => {
    if (status === 'success' && sessionId) return 'verifying';
    if (status === 'cancel') return 'cancelled';
    return 'booking';
  });

  const [booking, setBooking] = useState<CheckoutStatusResponse | null>(null);
  const [verifyError, setVerifyError] = useState('');

  // Poll for checkout status on success return
  const verifyPayment = useCallback(async () => {
    if (!sessionId) return;

    let attempts = 0;
    const maxAttempts = 12; // ~60 seconds
    const pollInterval = 5000;

    const poll = async () => {
      attempts++;
      try {
        const result = await getCheckoutStatus(sessionId);

        if (result.status === 'completed') {
          setBooking(result);
          setMode('confirmed');
          analytics.trackFunnelStage('payment_success', 10, { sessionId, bookingId: result.bookingId });
          analytics.trackFunnelStage('booking_confirmed', 12, { bookingId: result.bookingId });
          sessionStorage.removeItem('convelabs_booking_summary');
          return;
        }

        if (result.status === 'expired' || result.status === 'cancelled') {
          setVerifyError('Payment was not completed. Please try again.');
          setMode('error');
          return;
        }

        // Still pending — retry
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

      <div className="min-h-[100dvh] bg-background">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 md:py-12">

          {/* Default: Redirect to external GHS booking page (temporary) */}
          {mode === 'booking' && (
            (() => {
              // Auto-redirect to external GHS booking page
              window.open(GHS_BOOKING_PAGE, '_blank', 'noopener,noreferrer');
              return (
                <div className="flex flex-col items-center justify-center py-24 gap-4 max-w-md mx-auto text-center">
                  <h2 className="text-2xl font-bold text-foreground">Redirecting to Booking</h2>
                  <p className="text-muted-foreground">
                    A new tab should have opened with our booking page. If it didn't, click below.
                  </p>
                  <a
                    href={GHS_BOOKING_PAGE}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-conve-red hover:bg-conve-red-dark text-white font-semibold rounded-xl transition-colors"
                  >
                    Open Booking Page
                  </a>
                </div>
              );
            })()
          )}

          {/* Cancelled: Return from Stripe */}
          {mode === 'cancelled' && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 max-w-md mx-auto text-center">
              <h2 className="text-2xl font-bold text-foreground">Payment Cancelled</h2>
              <p className="text-muted-foreground">Your payment was not completed. You can try booking again.</p>
              <a
                href={GHS_BOOKING_PAGE}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-conve-red hover:bg-conve-red-dark text-white font-semibold rounded-xl transition-colors"
              >
                Book Again
              </a>
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
            <BookingPaymentConfirmation booking={booking} />
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
