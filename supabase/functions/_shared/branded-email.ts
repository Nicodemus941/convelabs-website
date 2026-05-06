/**
 * Branded Email Wrapper — every customer-facing email goes through this.
 *
 * Source of truth: ConveLabs business card + rack card design system.
 * If the rack card felt premium when you saw it, every email should feel
 * the same way. (Hormozi: every customer touchpoint is a brand impression.)
 *
 * Usage:
 *   import { brandedEmailWrapper } from '../_shared/branded-email.ts';
 *   const html = brandedEmailWrapper({
 *     headline: 'Your appointment is confirmed',
 *     accent: 'where you are.',          // optional gold italic
 *     greeting: `Hi ${patientName},`,
 *     bodyHtml: '<p>...</p>',
 *     ctaLabel: 'View Details',
 *     ctaHref: 'https://...',
 *     trustCloser: 'Pays for itself in 1 visit',  // optional
 *   });
 *
 * Tokens lifted directly from src/styles/brand-tokens.css:
 *   burgundy #7F1D1D / deep #5C1414
 *   gold #C9A961
 *   cream #F8F4ED
 *   charcoal #0F0F10
 *   gray-warm #6B5E54
 */

export interface BrandedEmailOptions {
  /** H1-equivalent — serif, charcoal */
  headline: string;
  /** optional gold italic accent rendered after `headline` */
  accent?: string;
  /** "Hi {Name}," greeting */
  greeting?: string;
  /** body HTML (paragraphs, lists — already inline-styled) */
  bodyHtml: string;
  /** primary CTA label, e.g. "Pay Now — $150" */
  ctaLabel?: string;
  /** primary CTA href */
  ctaHref?: string;
  /** sub-CTA reassurance, e.g. "Pays for itself in 1 visit" */
  trustCloser?: string;
  /** Footer note (defaults to phone + address line) */
  footerNote?: string;
  /** Show the "Labs At YOUR Convenience®" lockup at the bottom (default true) */
  showLockup?: boolean;
}

const PLAYFAIR =
  '"Playfair Display", Georgia, serif';
const INTER =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export function brandedEmailWrapper(opts: BrandedEmailOptions): string {
  const {
    headline,
    accent,
    greeting,
    bodyHtml,
    ctaLabel,
    ctaHref,
    trustCloser,
    footerNote = 'Questions? Call (941) 527-9169 or reply to this email.',
    showLockup = true,
  } = opts;

  const accentSpan = accent
    ? ` <span style="font-family:${PLAYFAIR};font-style:italic;color:#C9A961;font-weight:500;">${escapeHtml(accent)}</span>`
    : '';

  const ctaBlock = ctaLabel && ctaHref
    ? `<div style="text-align:center;margin:28px 0;">
         <a href="${escapeAttr(ctaHref)}"
            style="display:inline-block;background:linear-gradient(135deg,#7F1D1D 0%,#5C1414 100%);color:#fff;padding:14px 40px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;font-family:${INTER};box-shadow:0 8px 24px rgba(127,29,29,0.25);">
           ${escapeHtml(ctaLabel)}
         </a>
       </div>`
    : '';

  const trustCloserBlock = trustCloser
    ? `<p style="text-align:center;margin:0 0 24px;font-size:13px;color:#7F1D1D;font-weight:600;letter-spacing:0.02em;font-family:${INTER};">✓ ${escapeHtml(trustCloser)}</p>`
    : '';

  const lockupBlock = showLockup
    ? `<div style="text-align:center;margin-top:32px;">
         <p style="font-family:${PLAYFAIR};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#7F1D1D;margin:0;">
           Labs At <span style="font-style:italic;color:#C9A961;text-transform:none;letter-spacing:0;text-decoration:underline;text-underline-offset:3px;">YOUR</span> Convenience<sup style="font-size:0.6em;">®</sup>
         </p>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;padding:0;background:#F8F4ED;font-family:${INTER};color:#0F0F10;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F8F4ED;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#FBF8F2;border:1px solid rgba(127,29,29,0.08);border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(15,15,16,0.06);">

        <!-- Burgundy header bar -->
        <tr><td style="background:linear-gradient(135deg,#7F1D1D 0%,#5C1414 100%);padding:24px 32px;text-align:center;">
          <p style="font-family:${PLAYFAIR};font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#DDC586;margin:0 0 6px;font-weight:600;">ConveLabs</p>
          <p style="font-family:${INTER};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.85);margin:0;">Concierge Lab Services</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <h1 style="font-family:${PLAYFAIR};font-size:26px;line-height:1.2;color:#0F0F10;margin:0 0 8px;font-weight:700;letter-spacing:-0.01em;">
            ${escapeHtml(headline)}${accentSpan}
          </h1>

          <!-- Gold divider with diamond -->
          <div style="text-align:center;margin:18px auto 22px;width:200px;position:relative;">
            <div style="height:1px;background:linear-gradient(to right,transparent 0%,#C9A961 30%,#C9A961 70%,transparent 100%);"></div>
          </div>

          ${greeting ? `<p style="font-size:15px;color:#0F0F10;margin:0 0 14px;">${escapeHtml(greeting)}</p>` : ''}

          <div style="font-size:15px;line-height:1.7;color:#1F1410;">
            ${bodyHtml}
          </div>

          ${ctaBlock}
          ${trustCloserBlock}

          <p style="font-size:12px;color:#6B5E54;text-align:center;margin:20px 0 0;line-height:1.5;">
            ${escapeHtml(footerNote)}
          </p>
        </td></tr>

        <!-- Lockup footer -->
        <tr><td style="background:#F0EAE0;padding:20px 32px;border-top:1px solid rgba(127,29,29,0.08);">
          ${lockupBlock}
          <p style="font-size:10px;color:#6B5E54;text-align:center;margin:10px 0 0;">
            ConveLabs Concierge Lab Services · 1800 Pembrook Drive, Suite 300, Orlando, FL 32810
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
