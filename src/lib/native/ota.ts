import { Capacitor } from '@capacitor/core';

/**
 * OTA runtime glue for the self-hosted Capgo updater (see capacitor.config.ts
 * CapacitorUpdater block + the app-ota-check edge fn).
 *
 * The plugin (autoUpdate:true) downloads a newer bundle in the background and
 * applies it on the NEXT cold start. The ONE thing the app MUST do every launch
 * is call notifyAppReady() — the brick-protection handshake. If a freshly
 * applied bundle never signals "ready" within appReadyTimeout (10s), the plugin
 * auto-reverts to the last known-good bundle. Forgetting this call is the
 * classic way to strand users on a white screen, so we do it as early as boot
 * allows.
 *
 * No-op on web (the plugin only exists in the native shell), so the public site
 * is unaffected.
 */
export async function initOta(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    await CapacitorUpdater.notifyAppReady();
  } catch (err) {
    // Never let an OTA hiccup block app boot.
    console.warn('[ota] notifyAppReady skipped:', err);
  }
}

/** Current applied bundle version — handy for a Settings "version" line. */
export async function getOtaVersion(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    const current = await CapacitorUpdater.current();
    return (current as any)?.bundle?.version || null;
  } catch {
    return null;
  }
}
