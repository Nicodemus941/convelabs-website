/**
 * CONVELABS EMAIL TEMPLATE SYSTEM — production implementation of the approved
 * design (owner-approved 2026-07-13; spec artifact "ConveLabs Email Template
 * System", memory: project_convelabs_email_template_system).
 *
 * Table-based layout + fully inline styles → renders correctly in
 * Gmail/Outlook/Apple Mail. Compose an email from blocks, then wrap with
 * renderEmail(). One primary CTA per email:
 *   - patient emails  → the patient's PRIVATE token link
 *   - org emails      → https://www.convelabs.com/provider (org sign-in)
 *
 * Every send: subject + renderEmail(...) via Mailgun with
 * from: 'Nicodemme Jean-Baptiste <info@convelabs.com>' and
 * 'o:tracking-clicks': 'no'.
 */

export const BRAND = {
  crimson: '#B91C1C',
  deep: '#7F1D1D',
  ground: '#f6f3f2',
  surface: '#fdfbfa',
  border: '#eee2e0',
  cardBorder: '#f1e5e3',
  ink: '#111827',
  body: '#374151',
  soft: '#4b5563',
  muted: '#9ca3af',
  logoUrl: 'https://www.convelabs.com/apple-touch-icon.png',
  siteUrl: 'https://www.convelabs.com',
  providerLogin: 'https://www.convelabs.com/provider',
  phone: '(941) 527-9169',
  address: '1800 Pembrook Drive, Suite 300, Orlando, FL 32810',
  font: `-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif`,
};

// ── Blocks ────────────────────────────────────────────────────────────────

/** Key/value recap card (When / Where / Ordered by …). */
export function card(rows: Array<[string, string]>): string {
  const tr = rows.map(([k, v]) => `
    <tr>
      <td style="padding:4px 0;font-size:14px;color:${BRAND.muted};">${k}</td>
      <td style="padding:4px 0;font-size:14px;color:${BRAND.ink};font-weight:600;text-align:right;">${v}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${BRAND.cardBorder};border-radius:12px;margin:0 0 14px;"><tr><td style="padding:14px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tr}</table></td></tr></table>`;
}

/** Green reassurance block — covered costs, confirmations, guarantees. */
export function okBlock(title: string, body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;margin:0 0 14px;"><tr><td style="padding:12px 16px;color:#065f46;font-size:13.5px;line-height:1.55;"><span style="display:block;font-weight:700;font-size:14px;">${title}</span>${body}</td></tr></table>`;
}

/** Amber preparation block — fasting, deadlines, checklists. */
export function warnBlock(title: string, body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;margin:0 0 14px;"><tr><td style="padding:12px 16px;color:#78350f;font-size:13.5px;line-height:1.55;"><span style="display:block;font-weight:700;font-size:14px;">${title}</span>${body}</td></tr></table>`;
}

/** Red block — billing exceptions ONLY; always pair with an okBlock above. */
export function badBlock(body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;margin:0 0 14px;"><tr><td style="padding:12px 16px;color:#991b1b;font-size:13.5px;line-height:1.55;">${body}</td></tr></table>`;
}

/** Big centered amount (receipts / invoices). */
export function amountCard(amount: string, note: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${BRAND.cardBorder};border-radius:12px;margin:0 0 14px;"><tr><td style="padding:18px;text-align:center;"><span style="font-size:34px;font-weight:700;color:${BRAND.ink};">${amount}</span><span style="display:block;font-size:12px;color:${BRAND.muted};margin-top:2px;">${note}</span></td></tr></table>`;
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:${BRAND.body};">${html}</p>`;
}

// ── Wrapper ───────────────────────────────────────────────────────────────

export interface EmailOpts {
  eyebrow: string;                              // e.g. 'APPOINTMENT CONFIRMED'
  headline: string;
  greeting?: string;                            // 'Hi Margaret,'
  bodyHtml: string;                             // composed from blocks above
  cta?: { label: string; url: string };
  cta2?: { label: string; url: string };        // secondary outline button
  ctaNote?: string;                             // small grey line under buttons
  footerReason: string;                         // "why you're receiving this"
  signed?: boolean;                             // default true — Nico signature
}

export function renderEmail(o: EmailOpts): string {
  const ctaHtml = o.cta ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:10px 0 4px;">
      <a href="${o.cta.url}" style="display:inline-block;background:${BRAND.crimson};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:15px 42px;border-radius:10px;font-family:${BRAND.font};">${o.cta.label}</a>
      ${o.cta2 ? `&nbsp;&nbsp;<a href="${o.cta2.url}" style="display:inline-block;background:transparent;color:${BRAND.crimson};text-decoration:none;font-weight:700;font-size:14px;padding:13px 30px;border-radius:10px;border:2px solid ${BRAND.crimson};font-family:${BRAND.font};">${o.cta2.label}</a>` : ''}
      ${o.ctaNote ? `<p style="margin:9px 0 0;font-size:12px;color:${BRAND.muted};">${o.ctaNote}</p>` : ''}
    </td></tr></table>` : '';

  const sig = o.signed === false ? '' :
    `<p style="margin:16px 0 22px;font-size:13px;color:${BRAND.body};">— Nicodemme &ldquo;Nico&rdquo; Jean-Baptiste<br><span style="color:${BRAND.muted};">Founder, ConveLabs</span></p>`;

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:${BRAND.ground};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.ground};padding:28px 12px;font-family:${BRAND.font};">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:linear-gradient(135deg,${BRAND.crimson} 0%,${BRAND.deep} 100%);background-color:${BRAND.crimson};border-radius:16px 16px 0 0;padding:26px 32px 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:44px;height:44px;background:#ffffff;border-radius:50%;text-align:center;vertical-align:middle;"><img src="${BRAND.logoUrl}" width="30" height="30" alt="ConveLabs" style="display:inline-block;vertical-align:middle;border-radius:6px;"></td>
      <td style="padding-left:12px;color:#ffffff;line-height:1.15;"><span style="font-size:18px;font-weight:700;">ConveLabs</span><br><span style="font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#fecaca;">Concierge Lab Services</span></td>
    </tr></table>
    <p style="margin:18px 0 8px;font-size:11px;letter-spacing:.2em;font-weight:700;color:#fecaca;text-transform:uppercase;">${o.eyebrow}</p>
    <h1 style="margin:0;font-size:23px;line-height:1.3;font-weight:800;color:#ffffff;">${o.headline}</h1>
  </td></tr>
  <tr><td style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-top:0;padding:28px 32px 6px;">
    ${o.greeting ? `<p style="margin:0 0 6px;font-size:15px;color:${BRAND.ink};">${o.greeting}</p>` : ''}
    ${o.bodyHtml}
    ${ctaHtml}
    ${sig}
  </td></tr>
  <tr><td style="background:#f9f5f4;border:1px solid ${BRAND.border};border-top:1px solid ${BRAND.border};border-radius:0 0 16px 16px;padding:15px 32px;text-align:center;font-size:11px;color:${BRAND.muted};line-height:1.7;">
    ConveLabs · ${BRAND.address} · ${BRAND.phone} · info@convelabs.com<br>${o.footerReason}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
