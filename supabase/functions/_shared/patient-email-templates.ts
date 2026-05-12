/**
 * Luxury patient-facing email templates.
 *
 * All three patient emails (appointment_confirmation, appointment_reminder,
 * specimen_delivered) share the same shell so the experience feels coherent:
 *
 *  - Cream background (#faf7f2) — not flat SaaS white
 *  - Georgia serif headlines, Apple-system sans body
 *  - Red gradient hero bar with ConveLabs wordmark
 *  - Colored status card per email type (green/amber/blue)
 *  - One luxury CTA button, rounded, with subtle shadow
 *  - HIPAA-safe footer
 *
 * Usage: call one of the three render* functions. Each returns an HTML
 * string ready to pipe into Mailgun's `html` field.
 */

export interface CommonPatientParams {
  patientName: string;
  appointmentDate?: string;   // e.g. "Thursday, April 24, 2026"
  appointmentTime?: string;   // e.g. "8:00 AM"
  serviceName?: string;       // e.g. "Mobile Blood Draw"
  address?: string;           // full service address
  supportPhone?: string;      // default (941) 527-9169
}

const DEFAULT_SUPPORT_PHONE = '(941) 527-9169';

// ──────────────────────────────────────────────────────────────────
// Shared shell — wraps any body content in the luxury template
// ──────────────────────────────────────────────────────────────────
function shell(params: {
  preheader: string;
  heroTitle: string;
  heroEyebrow?: string;
  bodyHtml: string;
  /**
   * Optional Founding-50 scarcity line shown in the footer of every
   * patient email. Hormozi: scarcity doesn't sell when mentioned once;
   * it sells when it shows up everywhere the customer looks.
   * Pass an integer 1..50; rendered only when > 0 AND < cap so we don't
   * advertise scarcity that doesn't exist.
   */
  foundingSeatsRemaining?: number;
}): string {
  const seatsLine = (params.foundingSeatsRemaining && params.foundingSeatsRemaining > 0 && params.foundingSeatsRemaining < 50)
    ? `<p style="margin:0 0 6px;color:#92400E;font-size:11px;line-height:1.5;font-weight:600;">
        ✦ Only ${params.foundingSeatsRemaining} Founding VIP ${params.foundingSeatsRemaining === 1 ? 'seat' : 'seats'} left ·
        <a href="https://www.convelabs.com/pricing" style="color:#B91C1C;text-decoration:underline;">$199 locked for life →</a>
       </p>`
    : '';
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${params.heroTitle}</title>
</head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<!-- Preheader (preview text in inbox list) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${params.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7f2;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

      <!-- Hero -->
      <tr><td style="background:linear-gradient(135deg,#B91C1C 0%,#7F1D1D 100%);padding:40px 32px;text-align:center;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#fecaca;margin-bottom:8px;">ConveLabs</div>
        <h1 style="margin:0;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:normal;">${params.heroTitle}</h1>
        ${params.heroEyebrow ? `<p style="margin:10px 0 0;color:#fecaca;font-size:13px;">${params.heroEyebrow}</p>` : ''}
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:36px 32px 28px;">
        ${params.bodyHtml}
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#faf7f2;padding:20px 32px;text-align:center;border-top:1px solid #f3f4f6;">
        ${seatsLine}
        <p style="margin:0 0 6px;color:#9ca3af;font-size:11px;line-height:1.6;">
          ConveLabs, Inc. · 1800 Pembrook Dr, Suite 300, Orlando FL 32810<br>
          Licensed mobile phlebotomy · HIPAA compliant
        </p>
        <p style="margin:0;color:#9ca3af;font-size:10px;font-style:italic;">
          This message contains limited patient information per HIPAA minimum-necessary standards.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// Luxury details row
function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;width:34%;color:#6b7280;font-size:13px;font-weight:500;letter-spacing:0.3px;text-transform:uppercase;vertical-align:top;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#111827;font-size:15px;line-height:1.5;vertical-align:top;">${value}</td>
  </tr>`;
}

// ──────────────────────────────────────────────────────────────────
// 1. APPOINTMENT CONFIRMATION
// ──────────────────────────────────────────────────────────────────
export function renderAppointmentConfirmation(p: CommonPatientParams & {
  manageUrl?: string;          // link to patient dashboard / reschedule page
  fastingRequired?: boolean;
  /**
   * Member-savings line — only renders when > 0. Hormozi: every receipt
   * should remind the customer of the dollars they JUST got, not just
   * the dollars they spent. Pass the per-visit delta in cents (e.g. 3500
   * for "$35 saved at VIP rate vs $150 non-member").
   */
  savingsCents?: number;
  /** YTD savings across all visits this calendar year, in cents. */
  ytdSavingsCents?: number;
  /** Member tier label rendered on the savings chip ("VIP", "Concierge"). */
  memberTierLabel?: string;
  /** Founding seats remaining — forwarded to the global footer line. */
  foundingSeatsRemaining?: number;
}): string {
  const phone = p.supportPhone || DEFAULT_SUPPORT_PHONE;
  // Member savings chip — shown ABOVE the success card so the customer
  // sees the perk delivered before they scroll to the visit details.
  const savingsBlock = (p.savingsCents && p.savingsCents > 0) ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;margin-bottom:20px;">
      <tr><td style="padding:14px 18px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:middle;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#047857;font-weight:bold;margin-bottom:2px;">
                ${p.memberTierLabel ? `${p.memberTierLabel} Member savings` : 'Member savings'}
              </div>
              <div style="color:#065F46;font-size:18px;font-weight:bold;">You saved $${(p.savingsCents / 100).toFixed(0)} on this visit</div>
              ${p.ytdSavingsCents && p.ytdSavingsCents > 0 ? `<div style="color:#047857;font-size:12px;margin-top:2px;">$${(p.ytdSavingsCents / 100).toFixed(0)} saved year-to-date</div>` : ''}
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  ` : '';
  const body = `
    <p style="margin:0 0 16px;color:#111827;font-size:17px;line-height:1.6;">Hi ${p.patientName},</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">Your appointment with ConveLabs is <strong>confirmed</strong>. A licensed phlebotomist will come to you — no waiting room, no phone tag.</p>

    ${savingsBlock}

    <!-- Success card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:20px 22px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#166534;font-weight:bold;margin-bottom:12px;">✓ Confirmed</div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${p.appointmentDate ? detailRow('Date', p.appointmentDate) : ''}
          ${p.appointmentTime ? detailRow('Time', p.appointmentTime) : ''}
          ${p.serviceName ? detailRow('Service', p.serviceName) : ''}
          ${p.address ? detailRow('Location', p.address) : ''}
        </table>
      </td></tr>
    </table>

    <!-- Arrival window — Hormozi: set expectations BEFORE the no-show
         excuse fires. Patients who know we may swing ±15 min don't bail
         when the phleb pulls up 10 min early or runs a few minutes late. -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:18px 22px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#1d4ed8;font-weight:bold;margin-bottom:8px;">⏰ Your 30-minute arrival window</div>
        <p style="margin:0 0 8px;color:#1e3a8a;font-size:14px;line-height:1.6;">Your phlebotomist may arrive <strong>up to 15 minutes before or 15 minutes after</strong> your scheduled time.</p>
        <p style="margin:0;color:#334155;font-size:13px;line-height:1.6;">Traffic, weather, and visit length between patients can shift us either way. Please be ready 15 minutes before — and if we're running a little behind, you'll get a heads-up text the moment we know.</p>
      </td></tr>
    </table>

    <!-- How to prepare -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7f2;border-radius:12px;margin-bottom:28px;">
      <tr><td style="padding:20px 22px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#B91C1C;font-weight:bold;margin-bottom:12px;">How to prepare</div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:5px 0;color:#374151;font-size:14px;">🪪&nbsp;&nbsp;Have your <strong>photo ID</strong> and <strong>insurance card</strong> ready</td></tr>
          <tr><td style="padding:5px 0;color:#374151;font-size:14px;">📄&nbsp;&nbsp;Have your <strong>lab order</strong> ready (paper or digital)</td></tr>
          <tr><td style="padding:5px 0;color:#374151;font-size:14px;">👕&nbsp;&nbsp;Wear a <strong>short-sleeved shirt</strong> or sleeves you can roll up</td></tr>
          <tr><td style="padding:5px 0;color:#374151;font-size:14px;">💧&nbsp;&nbsp;Drink water — hydration makes the draw easier</td></tr>
          ${p.fastingRequired ? `<tr><td style="padding:5px 0;color:#B91C1C;font-size:14px;font-weight:600;">⏱️&nbsp;&nbsp;FASTING required — no food for 8-12 hours (water is fine)</td></tr>` : ''}
          <tr><td style="padding:5px 0;color:#374151;font-size:14px;">✨&nbsp;&nbsp;Clear a small <strong>sterile, well-lit area</strong> — a kitchen table works</td></tr>
        </table>
      </td></tr>
    </table>

    ${p.manageUrl ? `
    <!-- CTA -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr><td align="center">
        <a href="${p.manageUrl}" style="display:inline-block;background:#B91C1C;color:#ffffff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 12px rgba(185,28,28,0.25);">View my appointment</a>
      </td></tr>
    </table>
    ` : ''}

    <p style="margin:0 0 4px;color:#6b7280;font-size:13px;line-height:1.7;text-align:center;">Need to reschedule? Call <strong style="color:#111827;">${phone}</strong></p>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">We answer within 1 hour during business hours.</p>
  `;

  return shell({
    preheader: `Your ConveLabs appointment on ${p.appointmentDate || 'your scheduled date'} is confirmed.`,
    heroTitle: 'Your appointment is confirmed',
    heroEyebrow: 'See you soon — we come to you.',
    bodyHtml: body,
    foundingSeatsRemaining: p.foundingSeatsRemaining,
  });
}

// ──────────────────────────────────────────────────────────────────
// 2. APPOINTMENT REMINDER (24h out)
// ──────────────────────────────────────────────────────────────────
export function renderAppointmentReminder(p: CommonPatientParams & {
  manageUrl?: string;
  hasLabOrder?: boolean;
  uploadUrl?: string;    // link to upload lab order / insurance
  fastingRequired?: boolean;
}): string {
  const phone = p.supportPhone || DEFAULT_SUPPORT_PHONE;
  const body = `
    <p style="margin:0 0 16px;color:#111827;font-size:17px;line-height:1.6;">Hi ${p.patientName},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">A friendly reminder that your ConveLabs appointment is <strong>tomorrow</strong>. Your licensed phlebotomist will arrive within a 30-minute window — up to 15 minutes before or after your scheduled time, depending on traffic, weather, and visit length between patients. Please be ready 15 minutes early.</p>

    <!-- Reminder card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:20px 22px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#92400e;font-weight:bold;margin-bottom:12px;">⏰ Tomorrow</div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${p.appointmentDate ? detailRow('Date', p.appointmentDate) : ''}
          ${p.appointmentTime ? detailRow('Time', p.appointmentTime) : ''}
          ${p.serviceName ? detailRow('Service', p.serviceName) : ''}
          ${p.address ? detailRow('Location', p.address) : ''}
        </table>
      </td></tr>
    </table>

    <!-- How to prepare -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7f2;border-radius:12px;margin-bottom:28px;">
      <tr><td style="padding:20px 22px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#B91C1C;font-weight:bold;margin-bottom:12px;">Before we arrive</div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${p.hasLabOrder
            ? '<tr><td style="padding:5px 0;color:#166534;font-size:14px;">✅&nbsp;&nbsp;Your <strong>lab order is on file</strong> — we\'re all set</td></tr>'
            : `<tr><td style="padding:5px 0;color:#B91C1C;font-size:14px;">📄&nbsp;&nbsp;Have your <strong>lab order</strong> ready${p.uploadUrl ? ` (or <a href="${p.uploadUrl}" style="color:#B91C1C;">upload it now</a>)` : ''}</td></tr>`}
          <tr><td style="padding:5px 0;color:#374151;font-size:14px;">🪪&nbsp;&nbsp;Photo ID + insurance card ready</td></tr>
          <tr><td style="padding:5px 0;color:#374151;font-size:14px;">✨&nbsp;&nbsp;Clear a sterile, well-lit area</td></tr>
          <tr><td style="padding:5px 0;color:#374151;font-size:14px;">👕&nbsp;&nbsp;Wear short sleeves (or sleeves you can roll up)</td></tr>
          <tr><td style="padding:5px 0;color:#374151;font-size:14px;">💧&nbsp;&nbsp;Stay hydrated — drink water this evening</td></tr>
          ${p.fastingRequired ? `<tr><td style="padding:5px 0;color:#B91C1C;font-size:14px;font-weight:600;">⏱️&nbsp;&nbsp;FASTING required — no food 8-12 hours prior (water is OK)</td></tr>` : ''}
        </table>
      </td></tr>
    </table>

    ${p.manageUrl ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr><td align="center">
        <a href="${p.manageUrl}" style="display:inline-block;background:#B91C1C;color:#ffffff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 12px rgba(185,28,28,0.25);">View my appointment</a>
      </td></tr>
    </table>
    ` : ''}

    <p style="margin:0 0 4px;color:#6b7280;font-size:13px;line-height:1.7;text-align:center;">Need to reschedule? Call <strong style="color:#111827;">${phone}</strong></p>
  `;

  return shell({
    preheader: `Reminder: your ConveLabs appointment is tomorrow${p.appointmentTime ? ` at ${p.appointmentTime}` : ''}.`,
    heroTitle: 'See you tomorrow',
    heroEyebrow: 'A quick note before your appointment.',
    bodyHtml: body,
  });
}

// ──────────────────────────────────────────────────────────────────
// 4. MEMBERSHIP WELCOME — Hormozi: name the dream, list the promises,
//    show the math, give the next step, close with the brand promise.
// ──────────────────────────────────────────────────────────────────
export function renderMembershipWelcome(p: CommonPatientParams & {
  tier: 'member' | 'vip' | 'concierge';
  annualPriceCents: number;       // what they just paid
  nextRenewalDate?: string;       // e.g. "May 11, 2027"
  foundingMemberNumber?: number | null;  // VIP Founding 50 seat #
  dashboardUrl?: string;
}): string {
  const phone = p.supportPhone || DEFAULT_SUPPORT_PHONE;
  const tierLabel = p.tier === 'concierge' ? 'Concierge' : p.tier === 'vip' ? 'VIP' : 'Member';
  const annual = `$${(p.annualPriceCents / 100).toFixed(0)}/yr`;

  // Tier-specific perks. Mirrors src/lib/memberBenefits.ts TIER_PRICING.
  // We list ONLY what's true today — Hormozi: "make promises you can keep."
  const perksByTier: Record<string, Array<{ icon: string; title: string; detail: string }>> = {
    member: [
      { icon: '🩸', title: 'Lower price on every visit',  detail: 'Mobile draw $130 (vs $150) · In-office $49 · Specialty kit $165' },
      { icon: '💸', title: 'Cheaper family add-ons',     detail: 'Add a household member for $60 (vs $75)' },
      { icon: '📞', title: 'Priority phone support',      detail: 'Member line answered within 1 business hour' },
      { icon: '🔔', title: 'No same-day surcharge ever',  detail: 'Skip the $25 same-day fee on non-emergency requests' },
    ],
    vip: [
      { icon: '🩸', title: 'VIP pricing on every visit',  detail: 'Mobile draw $115 (vs $150) · In-office $45 · Specialty kit $150' },
      { icon: '👨‍👩‍👧', title: 'Family add-ons just $45',    detail: 'Bring a spouse, parent, or child for $45 per visit (vs $75)' },
      { icon: '⚡', title: 'Priority scheduling',         detail: 'First pick on every slot before public booking opens the next day' },
      { icon: '📞', title: 'White-glove support',          detail: '(941) 527-9169 answered within 1 hour, every business day' },
      { icon: '🔒', title: 'Annual rate-lock',            detail: 'Today\'s price is your price next year — no annual hike' },
    ],
    concierge: [
      { icon: '🩸', title: 'Concierge pricing on every visit', detail: 'Mobile draw $99 (vs $150) · In-office $39 · Specialty kit $135' },
      { icon: '👨‍👩‍👧‍👦', title: 'Family add-ons FREE for up to 2 members', detail: 'Bring 2 household members per visit at no extra cost' },
      { icon: '⚡', title: 'First-out scheduling',         detail: 'Always the first available slot — no waiting list, ever' },
      { icon: '🚗', title: 'Extended-area visits included',detail: 'No distance surcharge inside the standard ConveLabs service area' },
      { icon: '📞', title: 'Direct line to leadership',    detail: 'Concierge line — averages under 10 minutes to a real human' },
      { icon: '🔒', title: 'Annual rate-lock',            detail: 'Your price never goes up while you\'re an active Concierge member' },
    ],
  };
  const perks = perksByTier[p.tier] || perksByTier.member;
  const perkRows = perks.map(perk => `
    <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="36" style="vertical-align:top;font-size:20px;line-height:1;">${perk.icon}</td>
        <td style="vertical-align:top;">
          <div style="font-weight:700;font-size:14px;color:#111827;margin-bottom:2px;">${perk.title}</div>
          <div style="font-size:13px;color:#4b5563;line-height:1.5;">${perk.detail}</div>
        </td>
      </tr></table>
    </td></tr>`).join('');

  const heroBadge = p.foundingMemberNumber
    ? `<div style="display:inline-block;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">★ Founding Member #${p.foundingMemberNumber} of 50 · Rate locked for life</div>`
    : '';

  const body = `
    <p style="margin:0 0 16px;color:#111827;font-size:18px;line-height:1.5;">Welcome, ${p.patientName}.</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">You're now a <strong>ConveLabs ${tierLabel}</strong>. Here's exactly what that means for you — every visit from today forward.</p>

    ${heroBadge}

    <!-- The promise card — Hormozi: name the dream outcome up front -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:1px solid #fbbf24;border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:20px 22px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#92400e;font-weight:bold;margin-bottom:8px;">Your ${tierLabel} promise</div>
        <p style="margin:0;color:#78350f;font-size:15px;line-height:1.6;">
          Lab work, the way it should be: a licensed phlebotomist at your door, your time, your terms — at the lowest price we offer.
        </p>
      </td></tr>
    </table>

    <!-- Perks list — every promise the membership delivers -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:8px 22px 12px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#B91C1C;font-weight:bold;margin:14px 0 8px;">What you get</div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">${perkRows}</table>
      </td></tr>
    </table>

    <!-- How it works — answer the obvious questions before they ask -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7f2;border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:20px 22px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#B91C1C;font-weight:bold;margin-bottom:12px;">How it works</div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:5px 0;color:#374151;font-size:13px;line-height:1.6;"><strong>1.</strong>&nbsp;&nbsp;Your ${tierLabel} pricing is applied automatically every time you book — no codes to remember.</td></tr>
          <tr><td style="padding:5px 0;color:#374151;font-size:13px;line-height:1.6;"><strong>2.</strong>&nbsp;&nbsp;Membership is <strong>${annual}</strong>, charged once. Next renewal: ${p.nextRenewalDate || 'one year from today'} — we'll email you 14 days before.</td></tr>
          <tr><td style="padding:5px 0;color:#374151;font-size:13px;line-height:1.6;"><strong>3.</strong>&nbsp;&nbsp;You can pause, change tier, or cancel anytime from your patient portal — no penalty, no phone tree.</td></tr>
          <tr><td style="padding:5px 0;color:#374151;font-size:13px;line-height:1.6;"><strong>4.</strong>&nbsp;&nbsp;Questions? Just reply to this email or call <strong>${phone}</strong>. We answer within 1 business hour.</td></tr>
        </table>
      </td></tr>
    </table>

    ${p.dashboardUrl ? `
    <!-- CTA -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr><td align="center">
        <a href="${p.dashboardUrl}" style="display:inline-block;background:#B91C1C;color:#ffffff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 12px rgba(185,28,28,0.25);">Book your next visit</a>
      </td></tr>
    </table>
    ` : ''}

    <!-- The brand promise — Hormozi: close with the guarantee -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:16px;">
      <tr><td style="padding:18px 22px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#166534;font-weight:bold;margin-bottom:8px;">Our guarantee to you</div>
        <p style="margin:0 0 6px;color:#14532d;font-size:13px;line-height:1.6;">On-time arrival, licensed phlebotomist, specimen-delivery confirmation, and free re-draw if anything goes sideways. We mean it.</p>
        <p style="margin:0;color:#15803d;font-size:12px;line-height:1.6;">If we ever fall short of the promise above, we make it right — first response on us.</p>
      </td></tr>
    </table>

    <p style="margin:18px 0 4px;color:#6b7280;font-size:13px;line-height:1.7;text-align:center;">Thanks for trusting us with your health.</p>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">— Nicodemme Jean-Baptiste, Founder &amp; CEO</p>
  `;

  return shell({
    preheader: `Your ConveLabs ${tierLabel} membership is active. Here's everything you get.`,
    heroTitle: `Welcome, ${tierLabel.toLowerCase() === 'concierge' ? 'Concierge member' : tierLabel === 'VIP' ? 'VIP member' : 'Member'}`,
    heroEyebrow: 'Your benefits start the moment you book your next visit.',
    bodyHtml: body,
  });
}

// ──────────────────────────────────────────────────────────────────
// 3. SPECIMEN DELIVERED
// ──────────────────────────────────────────────────────────────────
export function renderSpecimenDelivered(p: CommonPatientParams & {
  labName: string;
  trackingId?: string;
  tubeCount?: number;
  resultsTimeline?: string;    // e.g. "48-72 hours"
}): string {
  const phone = p.supportPhone || DEFAULT_SUPPORT_PHONE;
  const timeline = p.resultsTimeline || '48-72 hours';
  const body = `
    <p style="margin:0 0 16px;color:#111827;font-size:17px;line-height:1.6;">Hi ${p.patientName},</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">Good news — your specimens have been safely delivered to <strong>${p.labName}</strong>. Your results will be processed next.</p>

    <!-- Delivered card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:20px 22px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#1e40af;font-weight:bold;margin-bottom:12px;">📦 Delivered to lab</div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${detailRow('Lab', p.labName)}
          ${p.trackingId ? `<tr>
            <td style="padding:10px 0;border-bottom:1px solid #e0e7ff;width:34%;color:#6b7280;font-size:13px;font-weight:500;letter-spacing:0.3px;text-transform:uppercase;vertical-align:top;">Tracking&nbsp;ID</td>
            <td style="padding:10px 0;border-bottom:1px solid #e0e7ff;vertical-align:top;">
              <code style="font-family:'SF Mono','Monaco','Consolas',monospace;font-size:16px;color:#1e40af;background:#ffffff;padding:4px 10px;border-radius:6px;letter-spacing:0.5px;font-weight:600;border:1px solid #dbeafe;">${p.trackingId}</code>
            </td>
          </tr>` : ''}
          ${p.tubeCount ? detailRow('Tubes', String(p.tubeCount)) : ''}
          ${detailRow('Expected results', timeline)}
        </table>
      </td></tr>
    </table>

    <!-- What happens next -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7f2;border-radius:12px;margin-bottom:28px;">
      <tr><td style="padding:20px 22px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#B91C1C;font-weight:bold;margin-bottom:12px;">What happens next</div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:5px 0;color:#374151;font-size:14px;"><strong>1.</strong>&nbsp;&nbsp;${p.labName} processes your specimens (typically ${timeline})</td></tr>
          <tr><td style="padding:5px 0;color:#374151;font-size:14px;"><strong>2.</strong>&nbsp;&nbsp;Results post to your lab's patient portal (${p.labName === 'LabCorp' ? 'labcorp.com' : p.labName === 'Quest Diagnostics' ? 'myquest.questdiagnostics.com' : 'your lab portal'})</td></tr>
          <tr><td style="padding:5px 0;color:#374151;font-size:14px;"><strong>3.</strong>&nbsp;&nbsp;Your ordering physician sees them via their normal results pipeline</td></tr>
          <tr><td style="padding:5px 0;color:#374151;font-size:14px;"><strong>4.</strong>&nbsp;&nbsp;Your physician follows up with you once reviewed</td></tr>
        </table>
      </td></tr>
    </table>

    <p style="margin:0 0 4px;color:#6b7280;font-size:13px;line-height:1.7;text-align:center;">Save your tracking ID. If results don't appear, share it with your provider — they can locate your sample instantly.</p>
    <p style="margin:12px 0 0;color:#9ca3af;font-size:12px;text-align:center;">Questions? Call <strong style="color:#111827;">${phone}</strong></p>
  `;

  return shell({
    preheader: `Your specimens have been delivered to ${p.labName}${p.trackingId ? ` (tracking: ${p.trackingId})` : ''}.`,
    heroTitle: 'Your specimens are at the lab',
    heroEyebrow: `Safely delivered to ${p.labName}.`,
    bodyHtml: body,
  });
}
