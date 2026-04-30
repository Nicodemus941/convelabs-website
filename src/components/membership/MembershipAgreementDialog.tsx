import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
const AGREEMENT_VERSION = '2026-04-30-v3';

const buildAgreementText = (tier: Props['tier']): string => `
ConveLabs Membership Agreement
Version ${AGREEMENT_VERSION}

THIS MEMBERSHIP AGREEMENT (the "Agreement") is entered into by and between
ConveLabs, LLC, a Florida limited liability company ("ConveLabs," "we," "us,"
or "our"), and the individual identified at checkout ("Member," "you," or
"your"). This Agreement governs your enrollment in the ConveLabs
"${tier.name}" annual membership plan at a price of $${tier.annualPrice} per year (the
"Annual Fee").

1. MEMBERSHIP TERM AND AUTO-RENEWAL
   1.1 Term. Your membership begins on the date the Annual Fee is
       successfully charged (the "Effective Date") and continues for a
       period of twelve (12) consecutive months (the "Initial Term").
   1.2 Auto-Renewal. UNLESS YOU CANCEL IN WRITING (or via the in-app
       cancellation flow described in Section 5) BEFORE THE END OF THE
       THEN-CURRENT TERM, YOUR MEMBERSHIP WILL AUTOMATICALLY RENEW for
       successive twelve-month renewal terms (each a "Renewal Term") at
       the then-current published annual rate for your tier, unless a
       founding-member rate-lock applies.
   1.3 Renewal Notice. We will deliver an electronic renewal reminder to
       the email address on file no fewer than thirty (30) days prior to
       any auto-renewal charge.

2. BILLING
   2.1 Annual Billing. Membership is billed ANNUALLY IN ADVANCE in a
       single charge to the payment method on file. We do not offer
       monthly or quarterly billing for memberships.
   2.2 Authorization. By accepting this Agreement and providing payment
       credentials at checkout, you authorize ConveLabs (and our
       payment processor, Stripe) to charge the Annual Fee on the
       Effective Date and on each subsequent renewal anniversary.
   2.3 Failed Payment. If a renewal charge fails, we will retry the
       payment method up to three (3) times over fourteen (14) days.
       If all retries fail, your membership will be suspended; benefits
       will not accrue and bookings made during suspension will be
       charged at non-member rates.
   2.4 Taxes and Surcharges. The Annual Fee is exclusive of any
       applicable sales, use, or other transaction taxes, which will
       be added at checkout where required by law.

3. REFUND POLICY (READ CAREFULLY — MATERIAL TERM)
   3.1 30-DAY GUARANTEE — CONDITIONAL. Subject to Section 3.2, if you
       cancel within thirty (30) calendar days of the Effective Date,
       you will receive a full refund of the Annual Fee.
   3.2 NO REFUND IF SERVICES USED. NOTWITHSTANDING SECTION 3.1, IF YOU
       HAVE USED, BOOKED, OR REDEEMED ANY MEMBER BENEFIT DURING THE
       FIRST THIRTY (30) DAYS — INCLUDING BUT NOT LIMITED TO COMPLETING
       A LAB DRAW AT MEMBER PRICING, BOOKING A SLOT IN A MEMBER-ONLY
       BOOKING WINDOW, REDEEMING A FAMILY ADD-ON DISCOUNT, RECEIVING
       COMPLIMENTARY RESULTS RETRIEVAL, USING A MEMBER REFERRAL CREDIT,
       OR EXERCISING ANY OTHER TIER-EXCLUSIVE BENEFIT — THE ANNUAL FEE
       IS NON-REFUNDABLE. Use of any such benefit constitutes
       acceptance of, and consideration for, the full Annual Fee.
   3.3 AFTER 30 DAYS. After the 30-day window has elapsed, the Annual
       Fee is NON-REFUNDABLE for any reason, with the limited
       exception of the Concierge Promise (Section 7) where applicable
       and any refund expressly required by Florida or U.S. federal law.
   3.4 PAUSE OPTION. In lieu of cancellation, you may PAUSE your
       membership for the periods set forth on the pricing page
       (Regular: up to 1 month/year; VIP: up to 2 months/year;
       Concierge: up to 3 months/year). Paused months do not count
       against your membership term and extend the renewal date by an
       equal duration.
   3.5 PRORATION. The Annual Fee is not prorated upon mid-term
       cancellation; you retain access to all member benefits through
       the end of the then-current term.

4. MEMBERSHIP BENEFITS
   4.1 Tier-Specific Benefits. The booking windows, family add-on
       pricing, referral incentives, results retrieval, reschedule fee
       waivers, and other benefits applicable to your tier are
       described on the ConveLabs pricing page
       (https://www.convelabs.com/pricing) and were displayed to you
       prior to your acceptance of this Agreement.
   4.2 Modification. ConveLabs may modify or substitute benefits with
       at least thirty (30) days' prior written notice (email to the
       address on file is sufficient). No modification will materially
       reduce the value of the benefits you purchased for the
       remainder of your then-current term.
   4.3 Service Areas. Member benefits apply only within ConveLabs'
       published service areas. Travel-area surcharges are reduced (but
       not eliminated) for members; specific tier rules are on the
       pricing page.
   4.4 No Transfer. Your membership is personal to you and is not
       transferable, assignable, or saleable to any third party.
       Family add-on benefits are limited to immediate household
       members residing at the same address.

5. CANCELLATION
   5.1 How to Cancel. You may cancel at any time via your patient
       dashboard (My Recurring Plans → Cancel plan) or by calling
       (941) 527-9169 during business hours. Cancellation requests
       made through email or U.S. mail will be honored upon receipt.
   5.2 Effect of Cancellation. Upon cancellation, your membership
       remains active and benefits continue through the end of the
       then-current Initial Term or Renewal Term. We will not initiate
       further auto-renewal charges following a properly submitted
       cancellation.

6. RIGHT OF FIRST RENEWAL (FOUNDING MEMBERS)
   If you are a Founding Member (as designated by ConveLabs at the time
   of enrollment), your annual rate is locked at the rate disclosed at
   the time of your initial enrollment for the duration of your
   continuous membership, even as standard rates increase. This
   rate-lock terminates upon any lapse in membership exceeding sixty
   (60) days.

7. CONCIERGE PROMISE (Concierge Tier Only)
   If, during your Concierge membership term, any visit fails to meet
   five-star service standards as documented in writing by you, we
   will, at our sole election: (a) refund your entire then-current
   Annual Fee, and (b) provide your next three (3) lab-draw visits at
   no charge. This Promise is a binding limited service guarantee. To
   invoke it, you must submit a written complaint to
   hello@convelabs.com within fourteen (14) days of the visit at issue.

8. HIPAA, PRIVACY, AND DATA HANDLING
   8.1 PHI. ConveLabs is a HIPAA-covered entity. Your protected
       health information ("PHI") is handled in accordance with the
       Health Insurance Portability and Accountability Act of 1996, as
       amended, our Notice of Privacy Practices, and our Privacy Policy
       (https://www.convelabs.com/privacy).
   8.2 Communications. By providing your phone number and email, you
       consent to receive transactional, appointment-related, and
       member-benefit communications from ConveLabs. You may opt out
       of non-transactional messages by replying STOP to any SMS or
       using the unsubscribe link in any email.

9. NO MEDICAL ADVICE; INDEPENDENT JUDGMENT
   ConveLabs provides specimen collection, transport, and delivery
   services to qualified clinical laboratories. ConveLabs does NOT
   diagnose, treat, prescribe, or provide medical advice of any kind.
   Lab results are released by the performing laboratory and should be
   reviewed with your licensed healthcare provider. Membership does
   not establish a physician-patient relationship.

10. PHLEBOTOMY SAFETY AND COOPERATION
    You agree to disclose to your phlebotomist any condition that
    materially affects safe specimen collection, including but not
    limited to: bleeding disorders, anti-coagulant medications, latex
    allergies, syncope/fainting history, and recent vaccination. You
    further agree to provide a clean, well-lit, and unobstructed
    workspace for in-home or in-office collection. ConveLabs reserves
    the right to refuse or reschedule a visit on safety grounds.

11. LIMITATION OF LIABILITY
    11.1 To the maximum extent permitted by law, ConveLabs' aggregate
         liability arising out of or relating to this Agreement shall
         not exceed the lesser of (i) the Annual Fee paid by you in
         the twelve months preceding the event giving rise to the
         claim, or (ii) one thousand U.S. dollars ($1,000).
    11.2 IN NO EVENT SHALL CONVELABS BE LIABLE FOR ANY INDIRECT,
         INCIDENTAL, CONSEQUENTIAL, SPECIAL, EXEMPLARY, OR PUNITIVE
         DAMAGES, INCLUDING LOST PROFITS OR DATA, EVEN IF ADVISED OF
         THE POSSIBILITY OF SUCH DAMAGES.
    11.3 Nothing in this Section 11 limits ConveLabs' liability for
         (a) gross negligence or willful misconduct, (b) bodily injury
         caused by ConveLabs personnel, or (c) any liability that
         cannot be excluded as a matter of law.

12. INDEMNIFICATION
    You agree to indemnify and hold ConveLabs harmless from any
    third-party claim arising out of (a) your breach of this Agreement,
    (b) your failure to disclose a material safety condition under
    Section 10, or (c) your misuse of any ConveLabs portal,
    credential, or service.

13. DISPUTE RESOLUTION; BINDING ARBITRATION; CLASS-ACTION WAIVER
    13.1 Informal Resolution. Before initiating any formal proceeding,
         you agree to contact ConveLabs at hello@convelabs.com and
         allow thirty (30) days for good-faith resolution.
    13.2 Binding Arbitration. ANY DISPUTE NOT RESOLVED INFORMALLY
         SHALL BE FINALLY RESOLVED BY BINDING INDIVIDUAL ARBITRATION
         administered by the American Arbitration Association under
         its Consumer Arbitration Rules, in Orlando, Florida. The
         arbitrator's decision shall be final and may be entered as a
         judgment in any court of competent jurisdiction.
    13.3 Class-Action Waiver. YOU AND CONVELABS EACH WAIVE ANY RIGHT
         TO BRING OR PARTICIPATE IN A CLASS, COLLECTIVE, OR
         REPRESENTATIVE ACTION. Disputes shall be resolved
         individually.
    13.4 Opt-Out. You may opt out of Sections 13.2 and 13.3 by sending
         written notice to hello@convelabs.com within thirty (30) days
         of the Effective Date, in which case those sections shall not
         apply to you. Opting out does not affect the validity of the
         remainder of this Agreement.
    13.5 Small Claims. Either party may bring a qualifying claim in
         the small-claims court of Orange County, Florida.

14. GOVERNING LAW AND VENUE
    This Agreement is governed by the laws of the State of Florida,
    without regard to conflict-of-laws rules. Subject to Section 13,
    the exclusive venue for any non-arbitrable proceeding is Orange
    County, Florida.

15. FORCE MAJEURE
    Neither party shall be liable for any failure or delay in
    performance to the extent caused by circumstances beyond reasonable
    control, including acts of God, weather emergencies, pandemics,
    governmental orders, labor disturbances, internet or
    telecommunications failures, or supplier outages. ConveLabs will
    use commercially reasonable efforts to reschedule affected visits.

16. ELECTRONIC SIGNATURES AND CONSENT TO ELECTRONIC RECORDS
    You consent to receive this Agreement, all notices, and all other
    communications in electronic form. Your acceptance below
    constitutes a valid electronic signature under the U.S. Electronic
    Signatures in Global and National Commerce Act (E-SIGN) and the
    Florida Electronic Signature Act.

17. ASSIGNMENT
    ConveLabs may assign this Agreement to any successor entity
    (including by merger or sale of substantially all assets) without
    notice to you. You may not assign this Agreement without our prior
    written consent.

18. SEVERABILITY; ENTIRE AGREEMENT; AMENDMENT
    18.1 Severability. If any provision of this Agreement is held
         invalid or unenforceable, the remaining provisions shall
         remain in full force and effect.
    18.2 Entire Agreement. This Agreement, together with the pricing
         page, the Privacy Policy, and any tier-specific addendum,
         constitutes the entire agreement between the parties as to
         membership and supersedes any prior representations.
    18.3 Amendment. ConveLabs may amend this Agreement on at least
         thirty (30) days' prior written notice. Continued use of
         membership benefits after the effective date of an amendment
         constitutes acceptance.

19. CONTACT
    ConveLabs, LLC
    Orlando, Florida
    Email: hello@convelabs.com
    Phone: (941) 527-9169

20. TELEHEALTH LIMITATIONS; PRIMARY CARE RELATIONSHIP
    20.1 ConveLabs is not a telehealth provider, urgent-care service,
         emergency-care provider, or substitute for a licensed primary
         care physician. Membership does not include and will never
         include diagnosis, treatment, prescription, dosing guidance,
         or interpretation of lab results.
    20.2 You acknowledge and warrant that you maintain (or will
         maintain) an ongoing relationship with a licensed primary
         care physician or other treating clinician who is responsible
         for ordering your tests, reviewing results, and directing your
         medical care.
    20.3 If you experience symptoms requiring urgent or emergency
         attention, dial 911 or go to the nearest emergency room. Do
         not contact ConveLabs in lieu of emergency medical services.

21. CHAIN OF CUSTODY; LAB AS RESULT-OWNER
    21.1 ConveLabs collects, packages, and transports specimens from
         the point of collection to a clinical laboratory designated
         on the requisition (the "Performing Lab"). At the moment a
         specimen is accepted by the Performing Lab, custody and
         control of the specimen and all associated test results
         transfer to that Performing Lab.
    21.2 The Performing Lab is the data controller and result-of-record
         issuer under CLIA and applicable state law. ConveLabs does
         not generate, certify, alter, withhold, or amend any test
         result. Disputes regarding test accuracy, billing by the
         Performing Lab, or insurance reimbursement for tests
         performed by the Performing Lab must be addressed directly
         with the Performing Lab.
    21.3 Specimen-integrity events occurring during ConveLabs custody
         (e.g., temperature excursion, mislabel) will be remediated by
         a complimentary recollection at our next available slot per
         our published Recollection Guarantee.

22. CONFIDENTIALITY (CONCIERGE TIER); MUTUAL NDA OPTION
    22.1 Concierge-tier members may request a Mutual Non-Disclosure
         Addendum executed by ConveLabs that prohibits disclosure of
         (a) Member's identity as a ConveLabs patient, (b) the contents
         of any visit, and (c) any non-public personal or business
         information observed in the course of in-home service.
    22.2 The Mutual NDA Addendum, if executed, supplements but does
         not supersede ConveLabs' HIPAA obligations. ConveLabs may
         still disclose PHI as required by law, court order, valid
         subpoena, or to the Performing Lab to fulfill the test order.
    22.3 ConveLabs maintains baseline discretion for ALL members:
         we do not publicly identify any member, post photos taken
         inside any member's home, or list members on any
         testimonial / case-study page without that member's prior
         written consent (Section 26).

23. RECORDS RETENTION
    23.1 ConveLabs retains lab requisitions, appointment records,
         payment records, signed agreements, and audit trails for a
         minimum of six (6) years from the later of (a) the date the
         record was created or (b) the date of the last activity on
         your account, consistent with 45 CFR § 164.530(j)(2) (HIPAA)
         and applicable Florida medical-records statutes.
    23.2 Upon written request to hello@convelabs.com, ConveLabs will
         provide a copy of records pertaining to you within thirty
         (30) days, subject to identity verification. Reasonable
         per-page or per-record fees may apply for high-volume
         requests as permitted by law.
    23.3 Following the retention period, ConveLabs may permanently
         destroy records using HIPAA-compliant disposal methods.

24. NO INSURANCE COVERAGE BY MEMBERSHIP
    24.1 Membership is a SERVICE PLAN, not an insurance product. The
         Annual Fee is consideration for access to ConveLabs' specimen-
         collection services and member benefits described on the
         pricing page. Membership does NOT cover, reimburse, or insure
         against (a) the cost of laboratory testing performed by the
         Performing Lab, (b) clinician visits, (c) prescriptions, (d)
         hospital or urgent-care charges, or (e) any medical
         complication, injury, or illness.
    24.2 You are solely responsible for maintaining health insurance
         and for any charges billed by the Performing Lab or other
         medical providers.

25. REFERRAL CREDITS AND REWARDS
    25.1 ConveLabs may from time to time issue referral credits,
         account credits, or promotional discounts ("Credits") to
         members who refer new paying patients.
    25.2 Credits (a) are not redeemable for cash, (b) have no monetary
         value outside of ConveLabs services, (c) are not transferable
         except to immediate household members named on your
         membership, (d) expire twelve (12) months from issuance unless
         otherwise stated, and (e) may not be combined with one another
         or stacked with any other discount unless ConveLabs expressly
         permits stacking in writing.
    25.3 ConveLabs may suspend, modify, or terminate any referral
         program with thirty (30) days' notice; previously earned
         Credits remain redeemable through their original expiration
         date.
    25.4 Fraudulent referral activity (self-referrals, fabricated
         referrals, organized credit-farming) results in forfeiture
         of all unused Credits and may result in membership
         termination without refund.

26. PUBLICITY, REVIEWS, AND TESTIMONIALS
    26.1 You may freely post or share reviews of ConveLabs services on
         any third-party platform. Member status, specific lab
         results, and any other PHI must be redacted by you before
         publication.
    26.2 If you publicly publish a review, photograph, or testimonial
         that names ConveLabs, you grant ConveLabs a worldwide,
         non-exclusive, royalty-free, perpetual license to repost,
         excerpt (without distortion), and reference that review or
         testimonial in ConveLabs marketing materials, on its
         websites, and in social media. You may revoke this license
         prospectively by emailing hello@convelabs.com; revocation
         does not require ConveLabs to remove materials already
         disseminated in print or paid-media campaigns scheduled
         before revocation.
    26.3 ConveLabs will NOT identify you in marketing materials by
         name, photograph, or other identifying detail without your
         separate, specific, prior written consent (a separate
         Publicity Release).

27. INTELLECTUAL PROPERTY; ACCEPTABLE USE; DMCA
    27.1 The ConveLabs name, logos, websites, software, branded
         patient portal, and content posted by ConveLabs are owned by
         ConveLabs or its licensors. Membership does not grant you
         any license to ConveLabs intellectual property other than
         the limited right to access and use the patient portal in
         the ordinary course of receiving services.
    27.2 You will not (a) copy, modify, reverse-engineer, or scrape
         the ConveLabs websites or portal; (b) upload malicious code,
         spam, or content that infringes any third party's rights;
         (c) use the portal to harass any ConveLabs personnel or
         other patient.
    27.3 DMCA notices alleging infringement should be sent to:
         Designated Agent — DMCA, ConveLabs LLC,
         Email: dmca@convelabs.com.
         Notices must include the elements required by 17 U.S.C.
         § 512(c)(3). Counter-notices may be submitted under
         17 U.S.C. § 512(g).

28. ACCEPTANCE
    By ticking the "I agree" boxes below and proceeding to payment,
    you acknowledge that you have read, understood, and agree to be
    bound by every term of this Agreement, including:
      • the limited refund policy in Section 3 (and Section 3.2's
        no-refund-if-services-used clause)
      • the binding arbitration and class-action waiver in Section 13
      • the auto-renewal provision in Section 1
      • the limitation of liability and indemnification in Sections 11–12
      • the safety-disclosure duty in Section 10
      • the chain-of-custody handoff in Section 21
      • the no-insurance-coverage acknowledgement in Section 24
      • the publicity license terms in Section 26
    Your IP address, browser user-agent, and acceptance timestamp are
    recorded as evidence of your electronic signature.

DO NOT ACCEPT IF YOU DO NOT FULLY UNDERSTAND ANY TERM ABOVE. Call
(941) 527-9169 or email hello@convelabs.com with questions before
proceeding.
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

        {/*
          Scrollable agreement body. CRITICAL:
          - `min-h-0` must be present so this flex item can shrink BELOW its
            content height — the flex default is `min-height: auto` which
            stretches the container and swallows the overflow. Without
            min-h-0, the inner content pushes the buttons off-screen and the
            user cannot scroll past section 3c.
          - Native `overflow-y-auto` is used instead of Radix ScrollArea —
            Radix's viewport height calculation is unreliable inside nested
            flex chains and was silently clipping the content on some
            devices without showing a scrollbar.
          - `overscroll-contain` prevents mobile rubber-band from scrolling
            the page behind the modal.
        */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
          <pre className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">
            {agreementText}
          </pre>
          {/* Visual hint that there's more content — fades into the body */}
          <div className="text-center text-[10px] uppercase tracking-widest text-gray-300 mt-6">
            — End of agreement —
          </div>
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
              is <strong>non-refundable after 30 days</strong> from the date of payment, and
              that <strong>using any member benefit</strong> (a member-priced lab draw,
              member-only booking window, family add-on discount, results retrieval, referral
              credit, or any other tier-exclusive perk) <strong>during the first 30 days
              also forfeits my refund</strong>. I can pause or cancel anytime, but no refund
              will issue after either of these conditions is met.
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
