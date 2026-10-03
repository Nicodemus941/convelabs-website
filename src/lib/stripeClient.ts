import { loadStripe, type Stripe } from '@stripe/stripe-js';

// Public Stripe key — safe to embed. Prefer env; fall back to the live key
// (same as AppointmentPayPage) so the build works without the Vercel var.
const STRIPE_PK = (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY ||
  'pk_live_51TLWYvAPnMg8iHarlnWKX7obn6WvawSBRFhLUs793yCO55JjSMn2y6zyldU2wJiOxVabqS8iOP3jpRmWD4QrJw2H00HQgI7pTr';

let stripePromise: Promise<Stripe | null> | null = null;

/** Lazily loads Stripe.js once. Resolves null when it can't load (ad/content
 *  blockers, offline) — callers fall back to hosted Checkout. */
export function getStripe(timeoutMs = 6000): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PK).catch(() => null);
  }
  return Promise.race([
    stripePromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}
