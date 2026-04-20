/**
 * HIPAA notice + CAN-SPAM footer. Import + append to every outbound email/SMS.
 *
 * Why this exists: previously our templates had inconsistent footers or none.
 * HIPAA requires a Notice of Privacy reference on any communication containing
 * PHI. CAN-SPAM requires an unsubscribe. One shared module = one source of
 * truth = compliance drift prevention.
 */

export const HIPAA_EMAIL_FOOTER_HTML = `<div style="background:#f9fafb;padding:14px 22px;font-size:10px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;line-height:1.5;">
  <p style="margin:0 0 6px;"><strong style="color:#6b7280;">HIPAA Notice:</strong> This message may contain Protected Health Information (PHI) intended only for the named recipient. If you are not the intended recipient, any review, use, distribution, or copying is prohibited. Please notify us immediately and delete this message.</p>
  <p style="margin:0 0 4px;">ConveLabs, Inc. &middot; 1800 Pembrook Dr, Suite 300, Orlando, FL 32810 &middot; (941) 527-9169</p>
  <p style="margin:0;">Questions about your privacy? See <a href="https://www.convelabs.com/privacy" style="color:#9ca3af;">our Notice of Privacy Practices</a> &middot; <a href="{{UNSUB_LINK}}" style="color:#9ca3af;">Unsubscribe</a></p>
</div>`;

/**
 * Build the footer with an optional per-recipient unsubscribe link.
 * If unsubscribe_token provided, Unsubscribe link goes to our handler.
 * Otherwise defaults to info@convelabs.com mailto.
 */
export function hipaaEmailFooter(unsubscribeToken?: string, unsubscribeBase?: string): string {
  const base = unsubscribeBase || 'https://www.convelabs.com';
  const unsubLink = unsubscribeToken
    ? `${base}/unsubscribe?t=${unsubscribeToken}`
    : `mailto:info@convelabs.com?subject=Unsubscribe`;
  return HIPAA_EMAIL_FOOTER_HTML.replace('{{UNSUB_LINK}}', unsubLink);
}

/**
 * SMS HIPAA + opt-out suffix. Append to every outbound SMS that may contain PHI.
 * Keep under 50 chars so it fits in a single segment with the main message.
 */
export const HIPAA_SMS_SUFFIX = ' Reply STOP to opt out. convelabs.com/privacy';
