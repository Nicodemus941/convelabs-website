/**
 * Meta Conversions API — server-side purchase reporting.
 *
 * The browser pixel is the only thing telling Meta whether an ad produced a
 * booking, and it loses 30-50% of events to iOS, ad blockers and people who
 * close the tab before the success page paints. Optimisation quality is a
 * direct function of how many conversions the algorithm actually sees, so the
 * missing half is not a reporting inconvenience — it is the difference between
 * Meta finding buyers and Meta finding clickers.
 *
 * This reports the same purchase from the server, where the payment is a fact
 * rather than a page load. Both events carry the SAME event_id, which is how
 * Meta deduplicates them: whichever arrives first wins, the other is discarded.
 * Without matching ids you double-count every browser-side conversion and
 * teach the optimiser a lie.
 *
 * Identity is hashed before it leaves this process. Meta matches on SHA-256 of
 * a normalised email/phone; the raw values never go over the wire. Nothing here
 * sends a name, an address, or anything about the visit itself.
 *
 * No-ops when META_PIXEL_ID / META_CAPI_TOKEN are unset, so this is safe to
 * deploy before the credentials exist.
 */

const GRAPH_VERSION = 'v21.0';

/** SHA-256 hex, which is the only format Meta accepts for matchable fields. */
async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Meta's normalisation: trim + lowercase, or it will not match anything. */
async function hashEmail(email: string | null | undefined): Promise<string | null> {
  const v = (email || '').trim().toLowerCase();
  if (!v || !v.includes('@')) return null;
  return await sha256(v);
}

/**
 * Phones must be digits only, country code included and no leading '+'.
 * A US 10-digit number gets a 1 prefix; anything already 11 digits starting
 * with 1 is left alone. Everything else is passed through as digits and may
 * simply fail to match, which is better than guessing a country.
 */
async function hashPhone(phone: string | null | undefined): Promise<string | null> {
  let digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) digits = `1${digits}`;
  return await sha256(digits);
}

export interface MetaPurchaseInput {
  /** Must match the browser pixel's eventID exactly, or Meta double-counts. */
  eventId: string;
  /** Purchase value in CENTS, as Stripe reports it. */
  amountCents: number;
  email?: string | null;
  phone?: string | null;
  /** Where the conversion happened, for Meta's attribution window. */
  eventSourceUrl?: string | null;
  /** fbp/fbc browser cookies when available — they raise match quality a lot. */
  fbp?: string | null;
  fbc?: string | null;
  contentName?: string | null;
}

/**
 * Fire-and-forget. Never throws: a marketing pixel must not be able to fail a
 * payment webhook. Returns true only when Meta acknowledged the event.
 */
export async function sendMetaPurchase(input: MetaPurchaseInput): Promise<boolean> {
  const pixelId = Deno.env.get('META_PIXEL_ID') || '';
  const token = Deno.env.get('META_CAPI_TOKEN') || '';
  if (!pixelId || !token) return false;

  try {
    const [em, ph] = await Promise.all([hashEmail(input.email), hashPhone(input.phone)]);

    // No hashed identifier and no browser cookie means Meta cannot attribute
    // this to a person, so the event would be noise in the optimiser.
    if (!em && !ph && !input.fbp && !input.fbc) return false;

    const user_data: Record<string, unknown> = {};
    if (em) user_data.em = [em];
    if (ph) user_data.ph = [ph];
    if (input.fbp) user_data.fbp = input.fbp;
    if (input.fbc) user_data.fbc = input.fbc;

    const body = {
      data: [
        {
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
          event_id: input.eventId,
          action_source: 'website',
          event_source_url: input.eventSourceUrl || 'https://www.convelabs.com/welcome',
          user_data,
          custom_data: {
            currency: 'USD',
            value: Number((input.amountCents / 100).toFixed(2)),
            content_name: input.contentName || 'Appointment',
          },
        },
      ],
    };

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      // Meta returns a descriptive body on rejection; log it rather than a
      // bare status, because "bad token" and "bad payload" look identical
      // otherwise and one of them is a silent zero-conversion outage.
      const text = await res.text().catch(() => '');
      console.warn(`[meta-capi] rejected (${res.status}): ${text.slice(0, 400)}`);
      return false;
    }

    console.log(`[meta-capi] Purchase sent — event_id=${input.eventId} value=$${(input.amountCents / 100).toFixed(2)}`);
    return true;
  } catch (err) {
    console.warn('[meta-capi] send failed (non-fatal):', err);
    return false;
  }
}
