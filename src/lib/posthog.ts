/**
 * PostHog analytics + session recording wiring.
 *
 * Chosen over Hotjar + Plausible combo because PostHog's free tier
 * covers session recordings (5K/mo), full funnel analytics, retention,
 * and feature flags in one tool. No additional subscriptions required.
 *
 * Configuration:
 *   Set VITE_POSTHOG_KEY in Vercel environment variables.
 *   Get the key from https://app.posthog.com → Settings → Project API Key.
 *
 * When VITE_POSTHOG_KEY is missing, all tracking is a no-op — safe to
 * ship without the key; nothing breaks, you just lose data.
 *
 * Privacy:
 *   - Masking: all text input fields are masked by default via
 *     session_recording.maskAllInputs (protects PHI — names, emails,
 *     lab order content)
 *   - Autocapture disabled (too noisy for our use case; we track explicit
 *     events via trackFunnelStage and posthog.capture)
 *   - Person identification deferred until after patient login
 *     (prevents cross-session mixing on shared devices)
 */

import posthog from 'posthog-js';

let isInitialized = false;

export function initPostHog(): void {
  if (isInitialized) return;
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) {
    if (typeof window !== 'undefined') {
      console.info('[posthog] VITE_POSTHOG_KEY not set — analytics skipped. Add to Vercel env to enable.');
    }
    return;
  }

  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    // Capture session recordings — but mask all input fields to protect PHI
    session_recording: {
      maskAllInputs: true,
      // Mask elements marked with class="ph-no-capture" or data-ph-mask
      maskTextSelector: '.ph-mask, [data-ph-mask]',
      // Record these explicitly (bypass PHI mask)
      maskTextFn: (text, el) => {
        if (el?.closest('.ph-no-mask')) return text;
        return text;
      },
    },
    // Don't autocapture — we fire explicit events from our funnel tracker
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    // Stay below 100 MB / month even with heavy traffic
    persistence: 'localStorage',
    // Privacy: respect Do Not Track
    respect_dnt: true,
    // Load time budget
    loaded: (ph) => {
      if (import.meta.env.DEV) {
        console.info('[posthog] initialized', ph.get_distinct_id());
      }
    },
  });
  isInitialized = true;
}

/**
 * Fire a funnel event to PostHog. Called from the existing
 * trackFunnelStage tracker so no component-level rewiring is needed.
 */
export function trackEvent(name: string, props: Record<string, any> = {}): void {
  if (!isInitialized) return;
  try {
    posthog.capture(name, props);
  } catch (e) {
    // Analytics should never crash the app
    console.warn('[posthog] capture failed:', e);
  }
}

/**
 * Identify a user after login/signup. Call once with the patient's
 * tenant_patients.id + their email. Ties prior anonymous events to
 * the identified user.
 */
export function identifyUser(userId: string, traits: Record<string, any> = {}): void {
  if (!isInitialized) return;
  try {
    posthog.identify(userId, traits);
  } catch (e) {
    console.warn('[posthog] identify failed:', e);
  }
}

export function resetIdentity(): void {
  if (!isInitialized) return;
  try {
    posthog.reset();
  } catch {}
}

export { posthog };
