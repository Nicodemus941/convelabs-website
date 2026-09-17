
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle, Calendar, CreditCard, Sparkles } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';

interface MembershipSummary {
  planLabel: string;
  annualPriceCents: number | null;
  nextRenewal: string | null;
  benefitBullets: string[];
  familyBookingHeadline: string;
  familyBookingDetail: string;
  familyBookingCta: string;
}

const MEMBERSHIP_COPY: Record<string, {
  label: string;
  benefitBullets: string[];
  familyBookingHeadline: string;
  familyBookingDetail: string;
  familyBookingCta: string;
}> = {
  regular: {
    label: 'Regular',
    benefitBullets: [
      'Priority booking access for member slots',
      '$20 off standard mobile blood draws',
      '$55 same-visit family add-on',
      'Results dashboard access',
    ],
    familyBookingHeadline: 'Bring your spouse or household member on the same appointment',
    familyBookingDetail:
      'Regular members can add one spouse or household member for $55 on the same visit. Use one appointment, one address, and one time slot so the family benefit applies.',
    familyBookingCta: 'Book visit + add family',
  },
  vip: {
    label: 'VIP',
    benefitBullets: [
      'Priority booking with earlier-access slots',
      '$35 off standard mobile blood draws',
      'Lower same-visit family add-on pricing',
      'Priority member perks and dashboard access',
    ],
    familyBookingHeadline: 'Use your VIP family rate on one shared visit',
    familyBookingDetail:
      'Add your spouse or household member during the same booking so the VIP family pricing applies to that same appointment.',
    familyBookingCta: 'Book VIP visit + add family',
  },
  concierge: {
    label: 'Concierge',
    benefitBullets: [
      'Highest-priority booking access',
      'Best per-visit pricing on standard mobile draws',
      'Top-tier family add-on benefits',
      'White-glove member support and dashboard access',
    ],
    familyBookingHeadline: 'Concierge family perks only apply on the same visit',
    familyBookingDetail:
      'Bring family members on the same appointment to use Concierge family benefits. Separate visits still bill as separate appointments.',
    familyBookingCta: 'Book Concierge visit + add family',
  },
};

function normalizePlanKey(planName: string | null | undefined): keyof typeof MEMBERSHIP_COPY {
  const normalized = String(planName || '').toLowerCase();
  if (normalized.includes('concierge')) return 'concierge';
  if (normalized.includes('vip')) return 'vip';
  return 'regular';
}

function formatMoney(cents: number | null): string | null {
  if (typeof cents !== 'number' || Number.isNaN(cents)) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isVerifying, setIsVerifying] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState({
    verified: false,
    message: '',
  });
  const [membershipSummary, setMembershipSummary] = useState<MembershipSummary | null>(null);
  
  const queryParams = new URLSearchParams(location.search);
  const sessionId = queryParams.get('session_id');
  const isUpgrade = queryParams.get('upgrade') === 'true';
  
  useEffect(() => {
    // Clear any reschedule-carry-over stash so the next /book-now load
    // doesn't show the "Rescheduling your..." banner pointing at the
    // already-cancelled-by-webhook old appointment.
    try { sessionStorage.removeItem('convelabs_reschedule_from'); } catch { /* private-browsing safe */ }
    const verifyCheckout = async () => {
      if (!sessionId) return;

      setIsVerifying(true);
      
      try {
        const { data, error } = await supabase.functions.invoke('verify-checkout-session', {
          body: { sessionId, isGuestCheckout: false },
        });
        
        if (error) {
          console.error('Error verifying checkout:', error);
          toast.error('Could not verify your payment. Please contact support.');
          setPaymentStatus({
            verified: false,
            message: 'Payment verification failed. Please contact support.',
          });
          return;
        }
        
        if (data.success) {
          setPaymentStatus({
            verified: true,
            message: isUpgrade ? 'Your membership has been successfully upgraded!' : 'Your membership is now active!',
          });
          
          // Refresh the auth context
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) console.error('Error refreshing auth session:', refreshError);

          const { data: authData } = await supabase.auth.getUser();
          const userId = authData.user?.id;
          if (userId) {
            const { data: membership } = await supabase
              .from('user_memberships')
              .select('billing_frequency, next_renewal, plan:plan_id(name, annual_price)')
              .eq('user_id', userId)
              .eq('status', 'active')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            const planName = String((membership as any)?.plan?.name || '');
            if (planName) {
              const planKey = normalizePlanKey(planName);
              const membershipCopy = MEMBERSHIP_COPY[planKey];
              setMembershipSummary({
                planLabel: membershipCopy.label,
                annualPriceCents: Number((membership as any)?.plan?.annual_price || 0) || null,
                nextRenewal: (membership as any)?.next_renewal || null,
                benefitBullets: membershipCopy.benefitBullets,
                familyBookingHeadline: membershipCopy.familyBookingHeadline,
                familyBookingDetail: membershipCopy.familyBookingDetail,
                familyBookingCta: membershipCopy.familyBookingCta,
              });
              setPaymentStatus({
                verified: true,
                message: `${membershipCopy.label} membership active`,
              });
            }
          }
        } else {
          setPaymentStatus({
            verified: false,
            message: data.error || 'Payment could not be verified. Please contact support.',
          });
        }
      } catch (err) {
        console.error('Verification failed:', err);
        setPaymentStatus({
          verified: false,
          message: 'An unexpected error occurred. Please contact support.',
        });
      } finally {
        setIsVerifying(false);
      }
    };
    
    verifyCheckout();
  }, [sessionId, isUpgrade]);
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-lg text-center">
        <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
        
        <h1 className="text-2xl font-bold mb-2">Thank You!</h1>
        
        <p className="text-gray-700 mb-6">
          {isVerifying
            ? 'Verifying your payment...'
            : paymentStatus.verified
            ? paymentStatus.message
            : paymentStatus.message || 'Your payment has been received and is being processed.'}
        </p>

        {!isVerifying && paymentStatus.verified && membershipSummary && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-left">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-white p-2 text-emerald-600 shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Membership confirmed
                </p>
                <h2 className="mt-1 text-lg font-bold text-gray-900">
                  {membershipSummary.planLabel} membership active
                </h2>
                <div className="mt-3 space-y-2 text-sm text-gray-700">
                  {membershipSummary.annualPriceCents !== null && (
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-emerald-600" />
                      <span>{formatMoney(membershipSummary.annualPriceCents)}/year</span>
                    </div>
                  )}
                  {membershipSummary.nextRenewal && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-emerald-600" />
                      <span>
                        Renews{' '}
                        {new Date(membershipSummary.nextRenewal).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-lg border border-white/70 bg-white/80 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Active perks
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
                    {membershipSummary.benefitBullets.map((benefit) => (
                      <li key={benefit} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-800">
                    Booking the family benefit
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {membershipSummary.familyBookingHeadline}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-700">
                    {membershipSummary.familyBookingDetail}
                  </p>
                  <p className="mt-2 text-xs text-blue-900">
                    Same-visit rule: the additional family member must be booked on the same appointment,
                    at the same address, in the same time slot.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="space-y-4">
          <Button 
            onClick={() => navigate('/dashboard')} 
            className="w-full"
          >
            Go to Dashboard
          </Button>
          {paymentStatus.verified && membershipSummary && (
            <>
              <Button
                variant="outline"
                onClick={() => navigate('/book-now')}
                className="w-full"
              >
                Book Appointment
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/book-now?addFamily=1')}
                className="w-full"
              >
                {membershipSummary.familyBookingCta}
              </Button>
            </>
          )}
          
          {isUpgrade && (
            <p className="text-sm text-gray-500">
              Your membership has been upgraded. It may take a few moments for all changes to reflect in your account.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
