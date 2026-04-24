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
}): string {
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
}): string {
  const phone = p.supportPhone || DEFAULT_SUPPORT_PHONE;
  const body = `
    <p style="margin:0 0 16px;color:#111827;font-size:17px;line-height:1.6;">Hi ${p.patientName},</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">Your appointment with ConveLabs is <strong>confirmed</strong>. A licensed phlebotomist will come to you — no waiting room, no phone tag.</p>

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
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">A friendly reminder that your ConveLabs appointment is <strong>tomorrow</strong>. Your licensed phlebotomist will arrive within the scheduled window.</p>

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
