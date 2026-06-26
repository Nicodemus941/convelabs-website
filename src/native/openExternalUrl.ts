import { Capacitor } from '@capacitor/core';

/**
 * Open an external URL — Stripe Checkout, payment links, lab portals, the
 * marketing site, etc. — the right way for the current platform.
 *
 * On native we use the in-app system browser (SFSafariViewController on iOS /
 * Custom Tab on Android) so the user stays inside the app and returns cleanly.
 * A raw `window.location` to an external https URL would navigate the whole
 * webview off the bundled app and not come back. On web it's a normal
 * navigation / new tab.
 *
 * For Stripe Checkout, set the session success_url/cancel_url to a deep link
 * (convelabs:// or an https App/Universal Link) so the return reopens the app.
 */
export async function openExternalUrl(
  url: string,
  opts: { newTab?: boolean } = {},
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'fullscreen' });
    return;
  }
  if (opts.newTab) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    window.location.assign(url);
  }
}
