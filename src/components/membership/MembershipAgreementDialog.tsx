import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Shield, AlertTriangle, FileText } from 'lucide-react';

/**
 * MEMBERSHIP AGREEMENT DIALOG
 *
 * Legal acceptance step that fires BEFORE Stripe checkout. Patient reads
 * the full membership terms, explicitly acknowledges the 30-day refund
 * policy + annual commitment, and ticks "I agree" to proceed.
 *
 * On agree we pass back an `agreementVersion` + `agreementSha` to the
 * caller, which writes a membership_agreements row (audit trail) before
 * redirecting to Stripe.
 *
 * Hormozi principle: make the policy UNMISSABLE, but pair it with the
 * "Concierge Promise" (our side) so patients read it as a fair trade,
 * not a harsh lockup.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  tier: {
    name: string;
    planName: string;
    annualPrice: number;
  };
  onAgreed: (meta: { agreementVersion: string; agreementSha: string }) => void;
  submitting?: boolean;
}

// Current agreement version — bump this string whenever the terms change.
// The membership_agreements table stores the version per signature so we
// always know exactly what the patient accepted.
const AGREEMENT_VERSION = '2026-04-18-v1';

const buildAgreementText = (tier: Props['tier']): string => `
ConveLabs Membership Agreement
Version ${AGREEMENT_VERSION}

This agreement governs your enrollment in the ConveLabs "${tier.name}" annual
membership plan at a price of $${tier.annualPrice} per year.

1. MEMBERSHIP TERM
   Your membership begins on the date of successful payment and continues for
   twelve (12) months. Membership automatically renews on the anniversary
   date at the then-current annual rate unless cancelled in writing before
   that date. You will receive a renewal reminder email at least 30 days
   before any automatic renewal charge.

2. BILLING
   Membership is billed ANNUALLY in advance. One charge, one time, once per
   year, to the payment method on file. We do not offer monthly or
   quarterly billing for memberships.

3. REFUND POLICY (READ CAREFULLY)
   a. FIRST 30 DAYS: If you cancel within 30 calendar days of the initial
      charge, you will receive a full refund — no questions asked.
   b. AFTER 30 DAYS: Annual membership fees are NON-REFUNDABLE after the
      30-day window has passed. This is because we reserve priority
      scheduling slots, phlebotomist availability, and discounted family
      add-ons for your use over the full year.
   c. PAUSE INSTEAD: If your circumstances change mid-year, you may PAUSE
      your membership (Regular: 1 month/yr, VIP: 2 months/yr,
      Concierge: 3 months/yr). Paused months do not count against your
      membership year; they extend the renewal date.

4. CANCELLATION
   You may cancel your membership at any time through your patient dashboard
   (My Recurring Plans → Cancel plan) or by calling (941) 527-9169. Cancelled
   memberships remain active until the end of the prepaid year — you keep
   all benefits until then. We will not charge you again at renewal after
   you cancel.

5. MEMBERSHIP BENEFITS
   Specific benefits and booking windows for your tier are listed on the
   ConveLabs pricing page (https://www.convelabs.com/pricing) and were
   shown to you before this agreement. Benefits may be adjusted with at
   least 30 days' notice; adjustments will not reduce the material value
   of the benefits you were sold for the remainder of your current
   membership year.

6. CONCIERGE PROMISE (Concierge tier only)
   If any visit during your Concierge year is not five-star quality, we
   will refund your entire annual fee AND provide your next three visits
   complimentary. This promise is a binding service guarantee, not a
   discretionary offer.

7. HIPAA + PRIVACY
   Your health information is protected under HIPAA. See our Privacy
   Policy at https://www.convelabs.com/privacy for details on how we
   store, transmit, and share your data.

8. NO MEDICAL ADVICE
   ConveLabs provides specimen collection and delivery services. We do
   NOT provide medical advice, diagnosis, or treatment. Lab results
   should be reviewed with your healthcare provider.

9. ACCEPTANCE
   By ticking "I agree" below and proceeding to payment, you acknowledge
   you have read, understood, and agree to every term in this agreement.
   Your IP address, browser information, and a timestamp are recorded as
   proof of your acceptance.

Questions? Call (941) 527-9169 or email hello@convelabs.com before
proceeding with payment. Do not agree if you do not fully understand
any term above.
`.trim();

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const MembershipAgreementDialog: React.FC<Props> = ({ open, onClose, tier, onAgreed, submitting }) => {
  const [agreed, setAgreed] = useState(false);
  const [acknowledgedNoRefund, setAcknowledgedNoRefund] = useState(false);
  const [computingSha, setComputingSha] = useState(false);

  const agreementText = useMemo(() => buildAgreementText(tier), [tier.name, tier.planName, tier.annualPrice]);

  const canProceed = agreed && acknowledgedNoRefund && !submitting;

  const handleProceed = async () => {
    if (!canProceed) return;
    setComputingSha(true);
    try {
      const sha = await sha256Hex(agreementText);
      onAgreed({ agreementVersion: AGREEMENT_VERSION, agreementSha: sha });
    } catch (e) {
      console.error('[agreement] SHA failed:', e);
      // Still proceed — shouldn't block the signup
      onAgreed({ agreementVersion: AGREEMENT_VERSION, agreementSha: '' });
    } finally {
      setComputingSha(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <DialogHeader className="p-5 border-b bg-gray-50 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-[#B91C1C]" />
            ConveLabs {tier.name} — Membership Agreement
          </DialogTitle>
          <DialogDescription className="text-xs">
            Please read the full agreement. You must explicitly acknowledge the refund
            policy before checkout. A signed copy is saved for your records.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1 px-5 py-4">
            <pre className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">
              {agreementText}
            </pre>
          </ScrollArea>
        </div>

        {/* Confirmations */}
        <div className="border-t px-5 py-4 bg-white space-y-3 flex-shrink-0">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 rounded border-gray-400"
              disabled={submitting}
            />
            <span className="text-sm text-gray-800">
              I have read and agree to the ConveLabs <strong>{tier.name}</strong> Membership
              Agreement (version {AGREEMENT_VERSION}).
            </span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer bg-amber-50 border border-amber-200 rounded-md p-2.5">
            <input
              type="checkbox"
              checked={acknowledgedNoRefund}
              onChange={(e) => setAcknowledgedNoRefund(e.target.checked)}
              className="mt-1 rounded border-gray-400"
              disabled={submitting}
            />
            <span className="text-xs text-amber-900 leading-relaxed">
              <AlertTriangle className="h-3.5 w-3.5 inline -mt-0.5 text-amber-700" />{' '}
              I understand that my <strong>${tier.annualPrice}</strong> annual membership fee
              is <strong>non-refundable after 30 days</strong> from the date of payment.
              I can pause or cancel anytime, but I will not receive a refund after the 30-day window.
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Go back
            </Button>
            <Button
              onClick={handleProceed}
              disabled={!canProceed || computingSha}
              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white gap-1.5 min-w-[180px]"
            >
              {submitting || computingSha ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Starting checkout…</>
              ) : (
                <><Shield className="h-4 w-4" /> I agree — continue to payment</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MembershipAgreementDialog;
