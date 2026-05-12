/**
 * lazyWithRetry — React.lazy wrapper that survives stale-bundle deploys.
 *
 * The bug it fixes (Naquala 2026-05-12: clicked Lab Orders, page stuck;
 * console showed "Failed to fetch dynamically imported module:
 * /assets/LabOrdersTab-DCdZ9xfX.js" + "MIME type 'text/html'"):
 *
 *   1. Admin loads /dashboard at 9 AM. Vercel serves index.html that
 *      references LabOrdersTab-DCdZ9xfX.js — the current build hash.
 *   2. We push a fix at 10 AM. Vercel publishes a new build with a
 *      different chunk hash, say LabOrdersTab-aB12cd3X.js. The old
 *      file is GONE from the CDN.
 *   3. Admin clicks "Lab Orders" at 11 AM without refreshing. React
 *      calls import('/assets/LabOrdersTab-DCdZ9xfX.js'). Vercel can't
 *      find it; the SPA fallback returns index.html (text/html). The
 *      browser refuses to parse HTML as JS → TypeError, tab stays blank.
 *
 * Two-step recovery (never blocks the admin):
 *
 *   a. CATCH the chunk-load TypeError once. If we haven't reloaded for
 *      this session, set a one-time `sessionStorage` flag and call
 *      window.location.reload() — this re-fetches index.html with the
 *      current chunk hashes, then the user clicks the tab again and it
 *      works. The sessionStorage flag prevents an infinite reload loop
 *      if the chunk is genuinely broken (not just stale).
 *
 *   b. If we already tried the reload this session, rethrow so React's
 *      ErrorBoundary catches it and shows a recoverable error UI
 *      instead of a blank page.
 *
 * Apply to every React.lazy() call in the dashboard surfaces — that's
 * the place admins click while staying on the same SPA session.
 */

import { lazy, type ComponentType } from 'react';

const RETRY_KEY_PREFIX = 'cl_lazy_retry_';

function isChunkLoadError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || err);
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes("Loading chunk") ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes("Failed to load module script") ||
    msg.includes("Expected a JavaScript-or-Wasm module script")
  );
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  /**
   * Stable identifier for this lazy component, used as the sessionStorage
   * key so each lazy import can attempt one reload independently.
   */
  componentKey: string,
): ReturnType<typeof lazy<T>> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err: any) {
      if (!isChunkLoadError(err)) throw err;

      // Have we already reloaded for THIS component in this session?
      const storageKey = RETRY_KEY_PREFIX + componentKey;
      const alreadyTried = (typeof sessionStorage !== 'undefined') && sessionStorage.getItem(storageKey);

      if (!alreadyTried) {
        try { sessionStorage.setItem(storageKey, '1'); } catch { /* private mode */ }
        // Hard reload — re-fetches index.html with the CURRENT chunk
        // hashes. The user's click is lost, but the next click works.
        // Console message helps support debug "why did my page just reload?"
        console.warn(
          `[lazyWithRetry] chunk load failed for "${componentKey}" — stale bundle. ` +
          `Triggering one-time reload to pick up the latest index.html.`
        );
        window.location.reload();
        // Return a never-resolving promise — the reload is happening.
        // React will unmount this Suspense boundary; we don't want to
        // resolve with a broken module that will throw on render.
        return new Promise<{ default: T }>(() => {});
      }

      // Second failure in the same session — the chunk is genuinely
      // unreachable (Vercel down, network, etc.). Rethrow so the nearest
      // ErrorBoundary renders an actionable "Couldn't load · try again" UI.
      console.error(
        `[lazyWithRetry] chunk load STILL failing after reload for "${componentKey}" — ` +
        `not stale, surfaces to ErrorBoundary.`
      );
      throw err;
    }
  });
}
