import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Two native apps are produced from this one web codebase. Choose which one
 * you're syncing/building by setting CAP_TARGET in the environment:
 *
 *   CAP_TARGET=patient npx cap sync   ->  ConveLabs        (com.convelabs.patient)
 *   CAP_TARGET=phleb   npx cap sync   ->  ConveLabs Pro    (com.convelabs.phleb)
 *
 * Defaults to the patient app. The matching web build must set the same target
 * via VITE_APP_TARGET so the in-app landing route lines up (see npm scripts).
 */
const target = process.env.CAP_TARGET === 'phleb' ? 'phleb' : 'patient';

const apps = {
  patient: { appId: 'com.convelabs.patient', appName: 'ConveLabs' },
  phleb: { appId: 'com.convelabs.phleb', appName: 'ConveLabs Pro' },
} as const;

const config: CapacitorConfig = {
  appId: apps[target].appId,
  appName: apps[target].appName,
  webDir: 'dist',
  backgroundColor: '#ffffff',
  plugins: {
    // ── Over-the-air updates (self-hosted Capgo on Supabase) ──────────────
    // Ships web/UI fixes to installed apps without a store submission. The
    // bundle is the same client JS already inside the store binary, so this is
    // not a "core purpose"/IAP/permission change (never OTA those — App Store
    // 3.3.1 requires a native review for that).
    //   updateUrl  -> app-ota-check edge fn (returns newest compatible bundle)
    //   statsUrl:'' -> no Capgo cloud; we self-host entirely
    //   autoUpdate  -> check on launch/foreground automatically
    //   directUpdate:false -> apply on NEXT cold start, never mid-session
    //   appReadyTimeout -> if a new bundle never calls notifyAppReady() within
    //                      10s it is auto-rolled-back to the last good bundle
    CapacitorUpdater: {
      updateUrl: 'https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1/app-ota-check',
      statsUrl: '',
      autoUpdate: true,
      directUpdate: false,
      appReadyTimeout: 10000,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
    },
    SplashScreen: {
      // We hide the splash manually from initNativeApp() once React has booted,
      // so the user never sees a white flash between splash and the dashboard.
      launchAutoHide: false,
      backgroundColor: '#ffffff',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'large',
      spinnerColor: '#7F1D1D',
    },
  },
};

export default config;
