import { Capacitor } from '@capacitor/core';

/**
 * Native-only bootstrap. This is a no-op on the website build, so the public
 * site at convelabs.com is completely unaffected — every native concern is
 * gated behind Capacitor.isNativePlatform() and the plugins are dynamically
 * imported so they never enter the web bundle's critical path.
 */
export async function initNativeApp(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const [{ SplashScreen }, { StatusBar, Style }, { App }, { Keyboard }] = await Promise.all([
      import('@capacitor/splash-screen'),
      import('@capacitor/status-bar'),
      import('@capacitor/app'),
      import('@capacitor/keyboard'),
    ]);

    // Light status bar = dark icons on our white app chrome.
    try {
      await StatusBar.setStyle({ style: Style.Light });
    } catch {
      /* StatusBar not available on every platform/skin */
    }

    // Android hardware back button: go back in history, or exit at the root.
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });

    // Deep links (convelabs:// or Universal/App Links) route into the SPA so
    // SMS/email links like /pay/:token or /appt/:token/track open in-app.
    App.addListener('appUrlOpen', ({ url }) => {
      try {
        const u = new URL(url);
        const path = `${u.pathname}${u.search}${u.hash}`;
        if (path && path !== '/') window.location.assign(path);
      } catch {
        /* ignore malformed deep-link urls */
      }
    });

    // Avoid the webview resizing oddly when the keyboard opens.
    try {
      await Keyboard.setResizeMode({ mode: 'native' as never });
    } catch {
      /* Keyboard plugin optional */
    }

    // React has mounted by the time this runs (called after createRoot.render),
    // so hide the native splash now — no white flash before the dashboard.
    await SplashScreen.hide();
  } catch (err) {
    console.warn('[native] initNativeApp skipped:', err);
  }
}
