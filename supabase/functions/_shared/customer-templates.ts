/**
 * Customer-templates registry — the Hormozi Layer-2 prevention surface.
 *
 * Every patient-facing message (email subject/body + SMS) ConveLabs sends
 * lives in this one file. Each template is a pure function:
 *
 *     (ctx: MessageContext) → { subject, html, sms }
 *
 * Why one file:
 *   • All copy is reviewable on a single screen
 *   • The type system enforces that every template considers `billed_to`,
 *     `total_cents`, `org_name`, `fasting_required`, etc. — instead of those
 *     decisions being scattered across 6 edge functions
 *   • The nightly synthetic smoke test (`nightly-message-smoke-test`)
 *     iterates every registered template across every scenario and asserts
 *     invariants — e.g. "if billed_to='org', no '$X.XX' string appears in
 *     output." That single test catches every future variant of the
 *     Westphal "your patient sees an invoice when org is billed" bug class.
 *
 * Adding a template:
 *   1. Add a `Template_Foo` function exported from this file
 *   2. Register it in `TEMPLATES` below with a unique key
 *   3. Add at least one assertion to `INVARIANTS` if the template has
 *      conditional copy (org-billed vs patient-billed, fasting-yes vs
 *      fasting-no, etc.)
 *
 * Migration is incremental — edge functions can call into this registry
 * for templates they've migrated and continue using inline copy for the
 * rest. Over time, every patient-facing string ends up here.
 */

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export interface MessageContext {
  // Patient
  patientFirstName: string;
  patientFullName: string;
  patientEmail?: string | null;
  patientPhone?: string | null;

  // Appointment
  appointmentId?: string;
  appointmentDate: string;       // ISO or human ("Tuesday, May 5")
  appointmentTime: string;       // raw DB time ("06:00:00") or "6:00 AM"
  serviceName: string;
  address?: string;

  // Billing
  billedTo: 'patient' | 'org';
  totalCents: number;            // 0 means waived/complimentary
  isWaived?: boolean;            // explicit waive (membership perk, etc.)
  orgName?: string | null;       // required when billedTo='org'

  // Lab order context (drives prep copy)
  labOrderPanels?: string[];
  fastingRequired?: boolean;
  urineRequired?: boolean;
  gttRequired?: boolean;

  // Specialty-kit bundle context — when present, the confirmation surfaces
  // the bundle name + savings as a "second-touch reinforcement" panel.
  // Reduces buyer's remorse: the patient is reminded post-purchase that
  // they got a deal. Hormozi calls this "wrap the result around them."
  bundleLabel?: string | null;     // e.g. "Couple Wellness Stack"
  bundleSavingsCents?: number;     // e.g. 6500 → "$65 saved"
  totalKits?: number;              // total kits in this booking

  // Links / tokens
  viewToken?: string | null;
  publicSiteUrl?: string;        // defaults to https://www.convelabs.com
}

export interface RenderedMessage {
  subject: string;
  html: string;
  sms: string;
}

// ────────────────────────────────────────────────────────────────────────
// Templates
// ────────────────────────────────────────────────────────────────────────

const moneyLine = (ctx: MessageContext): string => {
  // Hormozi Layer-2 invariant: when billed_to='org', the patient NEVER
  // sees a dollar amount. They see "Covered by [Org] — no payment due."
  if (ctx.billedTo === 'org') {
    return `Covered by ${ctx.orgName || 'your provider'} — no payment due`;
  }
  if (ctx.isWaived || ctx.totalCents === 0) return 'Complimentary';
  return `$${(ctx.totalCents / 100).toFixed(2)}`;
};

const moneyHtml = (ctx: MessageContext): string => {
  const text = moneyLine(ctx);
  const color = (ctx.billedTo === 'org' || ctx.isWaived || ctx.totalCents === 0)
    ? '#059669'  // emerald — "good news, no charge"
    : '#111827'; // gray-900
  return `<span style="color:${color};font-weight:600;">${text}</span>`;
};

export function Template_AppointmentConfirmation(ctx: MessageContext): RenderedMessage {
  const site = ctx.publicSiteUrl || 'https://www.convelabs.com';
  const moneyText = moneyLine(ctx);
  const moneySpan = moneyHtml(ctx);

  // Display "Tuesday, May 5 at 6:00 AM" if we have both
  const whenLine = `${ctx.appointmentDate}${ctx.appointmentTime ? ` at ${ctx.appointmentTime}` : ''}`;

  // Subject line
  const subject = ctx.billedTo === 'org'
    ? `Your ConveLabs appointment is confirmed — covered by ${ctx.orgName || 'your provider'}`
    : `Your ConveLabs appointment is confirmed`;

  // ── Email ──────────────────────────────────────────────────────────
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#B91C1C,#7F1D1D);color:#fff;padding:22px 24px;text-align:center;border-radius:12px 12px 0 0;">
    <h2 style="margin:0;font-size:20px;font-weight:700;">Appointment confirmed</h2>
    <p style="margin:8px 0 0;font-size:13px;opacity:0.95;">${moneySpan.replace('color:#059669', 'color:#fff').replace('color:#111827', 'color:#fff')}</p>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;line-height:1.55;color:#111827;">
    <p style="margin:0 0 14px;">Hi ${ctx.patientFirstName},</p>
    <p style="margin:0 0 14px;">Your appointment with ConveLabs is <strong>confirmed</strong> · ${moneySpan}</p>

    <table role="presentation" style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px;">
      <tr><td style="padding:6px 0;color:#6b7280;">Service</td><td style="text-align:right;font-weight:600;">${ctx.serviceName}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">When</td><td style="text-align:right;font-weight:600;">${whenLine}</td></tr>
      ${ctx.address ? `<tr><td style="padding:6px 0;color:#6b7280;">Where</td><td style="text-align:right;font-weight:600;">${ctx.address}</td></tr>` : ''}
    </table>

    ${ctx.bundleLabel && ctx.bundleSavingsCents && ctx.bundleSavingsCents > 0 ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#047857;">✨ ${ctx.bundleLabel}</p>
      <p style="margin:0;font-size:13px;color:#065f46;">You saved <strong>$${(ctx.bundleSavingsCents / 100).toFixed(0)}</strong> with this bundle${ctx.totalKits ? ` (${ctx.totalKits} kits total)` : ''} — vs paying for each kit separately.</p>
    </div>` : ''}

    ${ctx.fastingRequired ? `<div style="background:#fef3c7;border-left:4px solid #d97706;padding:14px 16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#78350f;">🍽️ Please fast 8 hours before your visit</p>
      <p style="margin:0;font-size:13px;color:#78350f;">Water and black coffee (no cream, no sugar) are OK. We'll send a reminder the day before with the exact stop-eating time.</p>
    </div>` : ''}

    ${ctx.viewToken ? `<div style="text-align:center;margin:22px 0;">
      <a href="${site}/visit/${ctx.viewToken}" style="display:inline-block;background:#B91C1C;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">View / manage appointment →</a>
    </div>` : ''}

    <p style="margin:16px 0 0;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:14px;">
      Questions? Reply to this email or call (941) 527-9169.
    </p>
  </div>
</div>`;

  // ── SMS ────────────────────────────────────────────────────────────
  const sms = `ConveLabs: Your appointment is confirmed!\n\n${ctx.serviceName}\n${whenLine}\n${ctx.address && ctx.address !== 'TBD' ? `Location: ${ctx.address}\n` : ''}${moneyText}\n\nHave your lab order & insurance ready.\nQuestions? Call (941) 527-9169`;

  return { subject, html, sms };
}

// ────────────────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────────────────

export type TemplateKey = 'appointment_confirmation';

export const TEMPLATES: Record<TemplateKey, (ctx: MessageContext) => RenderedMessage> = {
  appointment_confirmation: Template_AppointmentConfirmation,
};

// ────────────────────────────────────────────────────────────────────────
// Invariants — used by nightly-message-smoke-test to assert correctness
// across every (template × scenario) combination.
// ────────────────────────────────────────────────────────────────────────

export interface Invariant {
  id: string;
  description: string;
  /** Returns null if invariant holds, or a violation message if it fails. */
  check: (ctx: MessageContext, msg: RenderedMessage) => string | null;
}

const DOLLAR_RE = /\$\d[\d,]*\.\d{2}/;

export const INVARIANTS: Invariant[] = [
  {
    id: 'org_billed_no_dollar_amount',
    description: 'When billed_to=org, the patient never sees a dollar amount in subject/html/sms (Westphal 2026-05-04)',
    check: (ctx, msg) => {
      if (ctx.billedTo !== 'org') return null;
      if (DOLLAR_RE.test(msg.subject)) return `subject contains $X.XX: "${msg.subject}"`;
      if (DOLLAR_RE.test(msg.html))    return `html contains $X.XX (org-billed)`;
      if (DOLLAR_RE.test(msg.sms))     return `sms contains $X.XX: "${msg.sms}"`;
      return null;
    },
  },
  {
    id: 'org_billed_mentions_org_name',
    description: 'When billed_to=org, the html includes the org name so the patient knows who is covering',
    check: (ctx, msg) => {
      if (ctx.billedTo !== 'org' || !ctx.orgName) return null;
      if (!msg.html.includes(ctx.orgName) && !msg.sms.includes(ctx.orgName)) {
        return `html+sms missing org name "${ctx.orgName}"`;
      }
      return null;
    },
  },
  {
    id: 'patient_billed_shows_amount_when_unpaid',
    description: 'When billed_to=patient and not waived, the dollar amount must be visible somewhere',
    check: (ctx, msg) => {
      if (ctx.billedTo !== 'patient') return null;
      if (ctx.isWaived || ctx.totalCents === 0) return null;
      const expected = `$${(ctx.totalCents / 100).toFixed(2)}`;
      if (!msg.html.includes(expected) && !msg.sms.includes(expected)) {
        return `expected "${expected}" not present in html/sms`;
      }
      return null;
    },
  },
  {
    id: 'no_unrendered_handlebars',
    description: 'No "${...}" or "{{...}}" leaks indicating an unrendered template variable',
    check: (_ctx, msg) => {
      const fields: Array<keyof RenderedMessage> = ['subject', 'html', 'sms'];
      for (const f of fields) {
        if (/\$\{|\{\{/.test(String(msg[f] || ''))) return `${f} contains unrendered template syntax`;
      }
      return null;
    },
  },
  {
    id: 'sms_under_1600_chars',
    description: 'Twilio caps SMS at 1600 chars; longer truncates silently',
    check: (_ctx, msg) => msg.sms.length > 1600 ? `sms is ${msg.sms.length} chars (max 1600)` : null,
  },
  {
    id: 'subject_under_200_chars',
    description: 'Email subjects > 200 chars get truncated by most clients',
    check: (_ctx, msg) => msg.subject.length > 200 ? `subject is ${msg.subject.length} chars` : null,
  },
  {
    id: 'bundle_savings_visible_in_html',
    description: 'When a specialty-kit bundle is set, the html surfaces the bundle label + savings (Hormozi second-touch reinforcement)',
    check: (ctx, msg) => {
      if (!ctx.bundleLabel || !ctx.bundleSavingsCents) return null;
      if (!msg.html.includes(ctx.bundleLabel)) {
        return `bundle label "${ctx.bundleLabel}" missing from confirmation html`;
      }
      const savingsStr = `$${(ctx.bundleSavingsCents / 100).toFixed(0)}`;
      if (!msg.html.includes(savingsStr)) {
        return `expected savings "${savingsStr}" missing from confirmation html`;
      }
      return null;
    },
  },
];

// ────────────────────────────────────────────────────────────────────────
// Smoke-test scenarios — used by the nightly cron to drive each template
// through every meaningful permutation of MessageContext.
// ────────────────────────────────────────────────────────────────────────

export const SCENARIOS: Array<{ id: string; ctx: MessageContext }> = [
  {
    id: 'patient_billed_basic',
    ctx: {
      patientFirstName: 'Jane',
      patientFullName: 'Jane Doe',
      patientEmail: 'jane@example.com',
      patientPhone: '+15551234567',
      appointmentDate: 'Tuesday, May 5',
      appointmentTime: '6:00 AM',
      serviceName: 'Mobile Blood Draw',
      address: '123 Main St, Orlando, FL',
      billedTo: 'patient',
      totalCents: 15000,
    },
  },
  {
    id: 'org_billed_elite_medical',
    ctx: {
      patientFirstName: 'Robert',
      patientFullName: 'Robert Westphal',
      patientEmail: 'theonebob@gmail.com',
      patientPhone: '+18132632782',
      appointmentDate: 'Tuesday, May 5',
      appointmentTime: '6:00 AM',
      serviceName: 'Elite Medical Concierge — Bloodwork',
      address: '123 Test Ln, Orlando, FL',
      billedTo: 'org',
      totalCents: 7225,
      orgName: 'Elite Medical Concierge',
      fastingRequired: true,
    },
  },
  {
    id: 'org_billed_kathleen_macisaac',
    ctx: {
      patientFirstName: 'Lynn',
      patientFullName: 'Lynn Whipple',
      patientEmail: 'lynniewhip@gmail.com',
      appointmentDate: 'Tuesday, May 5',
      appointmentTime: '6:00 AM',
      serviceName: 'IFM — Bloodwork',
      billedTo: 'org',
      totalCents: 8500,
      orgName: 'Integrative Functional Medicine',
    },
  },
  {
    id: 'waived_membership',
    ctx: {
      patientFirstName: 'Alex',
      patientFullName: 'Alex Member',
      patientEmail: 'alex@example.com',
      appointmentDate: 'Wednesday, May 6',
      appointmentTime: '8:30 AM',
      serviceName: 'VIP Member Visit',
      billedTo: 'patient',
      totalCents: 0,
      isWaived: true,
    },
  },
  {
    id: 'patient_billed_fasting_morning',
    ctx: {
      patientFirstName: 'Pat',
      patientFullName: 'Pat Faster',
      patientEmail: 'pat@example.com',
      appointmentDate: 'Thursday, May 7',
      appointmentTime: '7:00 AM',
      serviceName: 'Comprehensive Metabolic Panel',
      address: '456 Oak Ave, Winter Park, FL',
      billedTo: 'patient',
      totalCents: 15000,
      fastingRequired: true,
      labOrderPanels: ['CMP', 'Lipid Panel'],
    },
  },
  {
    // Hormozi specialty-kit bundle scenario — couple, wellness stack
    id: 'specialty_kit_couple_wellness_stack',
    ctx: {
      patientFirstName: 'Sam',
      patientFullName: 'Sam Wellness',
      patientEmail: 'sam@example.com',
      patientPhone: '+15555550100',
      appointmentDate: 'Friday, May 8',
      appointmentTime: '9:00 AM',
      serviceName: 'Specialty Collection Kit · Couple Wellness Stack (6 kits)',
      address: '789 Park Pl, Orlando, FL',
      billedTo: 'patient',
      totalCents: 37500,         // matches pricing harness Couple · 3 kits each
      labOrderPanels: ['Hormone Panel', 'Gut Health', 'Food Sensitivity'],
      bundleLabel: 'Couple Wellness Stack',
      bundleSavingsCents: 6500,
      totalKits: 6,
    },
  },
];
