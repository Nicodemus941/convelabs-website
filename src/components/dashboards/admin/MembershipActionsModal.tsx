import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mail, DollarSign, Sparkles, Send, Loader2, CheckCircle2, Crown, Heart, User, ExternalLink, Users, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Admin MembershipActionsModal — two flows in one surface:
 *
 *   Tab 1 "Send offer"  → fires Hormozi-stacked offer email → patient clicks CTA
 *                         → self-serve Stripe checkout for the tier. Soft path.
 *
 *   Tab 2 "Register now"→ creates Stripe INVOICE (not checkout). Patient gets
 *                         an invoice email from Stripe, pays on their time,
 *                         webhook flips membership to active, welcome fires.
 *
 * Both flows:
 *   - Default tier = VIP (Hormozi's anchor)
 *   - Show Founding-50 seats remaining when relevant
 *   - Preview the email before sending
 *   - Optional personal note (signed: "— Nico")
 */

interface Props {
  open: boolean;
  onClose: () => void;
  patientEmail: string;
  patientName: string;
  onSuccess?: () => void;
}

type Tab = 'offer' | 'register';
type Tier = 'member' | 'vip' | 'concierge';

const TIER_META: Record<Tier, { label: string; price: number; value: number; color: string; icon: any; oneliner: string }> = {
  member:     { label: 'Member',       price: 99,  value: 204, color: '#0F766E', icon: Heart,     oneliner: '$10 off every visit + priority booking' },
  vip:        { label: 'VIP Founding', price: 199, value: 474, color: '#B91C1C', icon: Sparkles,  oneliner: 'Founding rate-lock + family add-on + priority (50 seats ever)' },
  concierge:  { label: 'Concierge',    price: 399, value: 939, color: '#7C3AED', icon: Crown,     oneliner: 'Unlimited reschedules + dedicated coordinator' },
};

const MembershipActionsModal: React.FC<Props> = ({ open, onClose, patientEmail, patientName, onSuccess }) => {
  const [tab, setTab] = useState<Tab>('offer');
  const [tier, setTier] = useState<Tier>('vip');
  const [personalNote, setPersonalNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Proxy / delegate — so admin can register a patient whose boss/assistant pays
  const [delegateExpanded, setDelegateExpanded] = useState(false);
  const [delegateName, setDelegateName] = useState('');
  const [delegateEmail, setDelegateEmail] = useState('');
  const [delegatePhone, setDelegatePhone] = useState('');
  const [delegateRel, setDelegateRel] = useState<'executive_assistant' | 'spouse' | 'adult_child' | 'parent' | 'caregiver' | 'guardian' | 'other'>('executive_assistant');
  const [delegateCCConfirms, setDelegateCCConfirms] = useState(true);
  const [delegatePayCard, setDelegatePayCard] = useState(true);
  const [success, setSuccess] = useState<{ kind: 'offer' | 'invoice'; invoice_url?: string; seats_remaining?: number | null } | null>(null);
  const [seatsRemaining, setSeatsRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setTab('offer'); setTier('vip'); setPersonalNote(''); setSuccess(null);
    } else {
      // Fetch Founding-50 seats for scarcity context
      (async () => {
        try {
          const { data } = await supabase.rpc('get_founding_seats_status' as any, { tier: 'vip' });
          if (data?.remaining != null) setSeatsRemaining(data.remaining);
        } catch { /* non-blocking */ }
      })();
    }
  }, [open]);

  const sendOffer = async () => {
    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/send-membership-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          patient_email: patientEmail,
          patient_name: patientName,
          tier,
          personal_note: personalNote.trim() || null,
        }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || 'Send failed');
      // Audit row
      await supabase.from('membership_offers_sent').insert({
        patient_email: patientEmail.toLowerCase(),
        patient_name: patientName,
        tier, personal_note: personalNote.trim() || null,
      });
      setSuccess({ kind: 'offer', seats_remaining: j.seats_remaining });
      toast.success(`Offer sent to ${patientName.split(' ')[0]} 🎯`);
      onSuccess?.();
    } catch (e: any) {
      toast.error(e?.message || 'Send failed');
    } finally {
      setSubmitting(false);
    }
  };

  const registerWithInvoice = async () => {
    // If delegate expanded + filled, send invoice to DELEGATE, not patient —
    // this is the "Suzanne pays for AJ" pattern. Delegate email receives the
    // Stripe invoice and the card of record. Patient stays clinical-comms only.
    const useDelegateBilling = delegateExpanded && delegateName.trim() && delegateEmail.trim();
    const invoiceEmail = useDelegateBilling ? delegateEmail.trim() : patientEmail;
    const invoiceName = useDelegateBilling ? delegateName.trim() : patientName;

    if (!confirm(
      useDelegateBilling
        ? `Send ${delegateName.split(' ')[0]} a Stripe invoice for ${patientName}'s ${TIER_META[tier].label} ($${TIER_META[tier].price})?\n\nInvoice goes to: ${delegateEmail}\nMembership activates on: ${patientEmail}`
        : `Send ${patientName} a Stripe invoice for ${TIER_META[tier].label} ($${TIER_META[tier].price})?`
    )) return;

    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const resp = await fetch('https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/register-patient-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          patient_email: patientEmail,      // clinical comms email (always patient's)
          patient_name: patientName,
          tier,
          billing_email: useDelegateBilling ? delegateEmail : null,
          billing_name: useDelegateBilling ? delegateName : null,
        }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || 'Registration failed');

      // If delegate info present, create the patient_delegates authorization row
      if (useDelegateBilling) {
        const user = (await supabase.auth.getUser()).data.user;
        const consent_text = `On ${new Date().toISOString()}, ConveLabs admin (${user?.email}) registered ${patientName} for a ${TIER_META[tier].label} membership, with ${delegateName} (${delegateEmail}) designated as the billing contact and authorized delegate. The patient will receive clinical notifications at ${patientEmail}; the delegate will receive receipts and invoices.`;
        await supabase.from('patient_delegates').insert({
          delegate_email: delegateEmail.toLowerCase(),
          delegate_name: delegateName,
          delegate_phone: delegatePhone || null,
          relationship: delegateRel,
          patient_email: patientEmail.toLowerCase(),
          patient_name: patientName,
          can_book: true,
          can_pay: delegatePayCard,
          can_view_results: false,
          cc_on_confirmations: delegateCCConfirms,
          consent_signed_at: new Date().toISOString(),
          consent_typed_name: `Admin: ${user?.email}`,
          consent_text,
        });
      }

      setSuccess({ kind: 'invoice', invoice_url: j.invoice_url });
      toast.success(useDelegateBilling
        ? `Invoice sent to ${delegateName.split(' ')[0]} · membership activates on ${patientName}'s chart when paid`
        : 'Invoice sent — patient will pay via Stripe');
      onSuccess?.();
    } catch (e: any) {
      toast.error(e?.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const TierIcon = TIER_META[tier].icon;
  const firstName = patientName.split(' ')[0];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#B91C1C]" /> Membership for {firstName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {patientEmail}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {success.kind === 'offer' ? 'Offer sent' : 'Invoice sent'}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {success.kind === 'offer'
                  ? `${firstName} just got a Hormozi-stacked email with a one-click upgrade CTA.`
                  : `${firstName} received a Stripe invoice for $${TIER_META[tier].price}. When they pay, their chart auto-updates and a welcome email fires.`}
              </p>
              {success.invoice_url && (
                <a href={success.invoice_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2">
                  <ExternalLink className="h-3 w-3" /> View Stripe invoice
                </a>
              )}
            </div>
            <Button onClick={onClose} className="bg-[#B91C1C] hover:bg-[#991B1B] mt-2">Done</Button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 border-b">
              <button
                onClick={() => setTab('offer')}
                className={`py-2 px-3 text-sm border-b-2 transition ${tab === 'offer' ? 'border-[#B91C1C] text-[#B91C1C] font-semibold' : 'border-transparent text-gray-500'}`}
              >
                <Mail className="inline h-3.5 w-3.5 mr-1" /> Send offer email
              </button>
              <button
                onClick={() => setTab('register')}
                className={`py-2 px-3 text-sm border-b-2 transition ${tab === 'register' ? 'border-[#B91C1C] text-[#B91C1C] font-semibold' : 'border-transparent text-gray-500'}`}
              >
                <DollarSign className="inline h-3.5 w-3.5 mr-1" /> Register (send invoice)
              </button>
            </div>

            {/* Tier selector */}
            <div>
              <Label className="text-xs">Tier</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['member','vip','concierge'] as Tier[]).map(t => {
                  const m = TIER_META[t];
                  const Icon = m.icon;
                  return (
                    <button
                      key={t}
                      onClick={() => setTier(t)}
                      className={`p-2.5 rounded-lg border-2 text-left transition ${tier === t ? 'border-[#B91C1C] bg-red-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5" style={{ color: m.color }} />
                        <span className="text-xs font-bold text-gray-900">{m.label}</span>
                        {t === 'vip' && (
                          <Badge variant="outline" className="text-[9px] border-red-300 text-red-700 ml-auto">Anchor</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5">${m.price}/yr</p>
                      <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                        Stacked ${m.value}
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">
                <TierIcon className="inline h-3 w-3 mr-0.5" style={{ color: TIER_META[tier].color }} />
                {TIER_META[tier].oneliner}
              </p>
              {tier === 'vip' && seatsRemaining !== null && (
                <p className="text-[11px] text-red-700 font-semibold mt-1">
                  ⏱ {seatsRemaining} of 50 Founding VIP seats remaining
                </p>
              )}
            </div>

            {/* Personal note (offer tab only) */}
            {tab === 'offer' && (
              <div>
                <Label className="text-xs">Personal note <span className="text-gray-400">(optional — appears as a signed quote from Nico)</span></Label>
                <Textarea
                  value={personalNote}
                  onChange={(e) => setPersonalNote(e.target.value)}
                  placeholder="e.g. &quot;Saw you're due for labs again next month — thought this would save you the trip.&quot;"
                  rows={3}
                  maxLength={200}
                />
                <p className="text-[10px] text-gray-400 mt-0.5">{personalNote.length}/200 · makes the email 2-3× more likely to convert</p>
              </div>
            )}

            {tab === 'register' && (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                  <p className="font-semibold text-amber-900 mb-1">How this works:</p>
                  <ol className="list-decimal pl-4 space-y-1 text-amber-800">
                    <li>We create a Stripe invoice for ${TIER_META[tier].price} and email it to {delegateExpanded && delegateEmail ? delegateName.split(' ')[0] || 'the billing contact' : firstName}</li>
                    <li>They pay on their own time via Stripe</li>
                    <li>When paid: chart auto-updates to {TIER_META[tier].label}, welcome email + SMS fire{delegateExpanded ? ` to ${firstName}` : ''}, discounts apply on next booking</li>
                  </ol>
                </div>

                {/* Delegate / "someone else is paying" section — the Suzanne/AJ pattern fix */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDelegateExpanded(!delegateExpanded)}
                    className="w-full flex items-center justify-between p-2.5 bg-gray-50 hover:bg-gray-100 transition text-left"
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold text-gray-800">
                      <Users className="h-3.5 w-3.5 text-[#B91C1C]" />
                      Someone else is paying for this patient? <span className="text-[10px] text-gray-500">(assistant / spouse / family)</span>
                    </span>
                    {delegateExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {delegateExpanded && (
                    <div className="p-3 space-y-2 bg-white border-t border-gray-200">
                      <p className="text-[11px] text-gray-600">
                        Invoice + receipts go to <strong>the person paying</strong>. Clinical notifications (appointments, reminders, results) go to <strong>{firstName}</strong>. No more wrong-person emails.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Billing contact name *</Label>
                          <Input value={delegateName} onChange={e => setDelegateName(e.target.value)} placeholder="e.g. Suzanne Wells" />
                        </div>
                        <div>
                          <Label className="text-xs">Billing email *</Label>
                          <Input type="email" value={delegateEmail} onChange={e => setDelegateEmail(e.target.value)} placeholder="assistant@company.com" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Relationship</Label>
                          <select value={delegateRel} onChange={e => setDelegateRel(e.target.value as any)} className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs bg-white">
                            <option value="executive_assistant">Executive assistant / office mgr</option>
                            <option value="spouse">Spouse / partner</option>
                            <option value="adult_child">Adult child</option>
                            <option value="parent">Parent / guardian</option>
                            <option value="caregiver">Professional caregiver</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">Their phone <span className="text-gray-400">(optional)</span></Label>
                          <Input value={delegatePhone} onChange={e => setDelegatePhone(e.target.value)} placeholder="(407) 555-1234" />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer pt-1">
                        <input type="checkbox" checked={delegateCCConfirms} onChange={e => setDelegateCCConfirms(e.target.checked)} />
                        CC them on every confirmation / receipt
                      </label>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="flex items-center justify-between pt-2 border-t">
              <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
              {tab === 'offer' ? (
                <Button onClick={sendOffer} disabled={submitting} className="bg-[#B91C1C] hover:bg-[#991B1B] gap-1.5">
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send {firstName}'s offer</>}
                </Button>
              ) : (
                <Button onClick={registerWithInvoice} disabled={submitting} className="bg-[#B91C1C] hover:bg-[#991B1B] gap-1.5">
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : <><DollarSign className="h-4 w-4" /> Send Stripe invoice</>}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MembershipActionsModal;
