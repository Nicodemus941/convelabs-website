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
