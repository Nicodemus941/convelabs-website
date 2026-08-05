import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

/**
 * Native push notifications (ConveLabs Pro phleb app).
 *
 * Uses @capacitor-firebase/messaging — FCM on Android, APNs-via-FCM on iOS —
 * so ONE server credential (the Firebase service account in the
 * notify-phleb-push edge fn) delivers to both platforms.
 *
 * Flow:
 *   initPush(userId)  — after login on native. Requests permission (the caller
 *                       should show a priming screen first — iOS only lets us
 *                       ask ONCE), registers, and upserts the token into
 *                       public.push_tokens. Also wires:
 *                         - tokenReceived: token rotation → re-upsert
 *                         - notificationActionPerformed (tap on the OS banner)
 *                           → deep-link to the appointment card via
 *                           /phleb-app?appt=<id>
 *                         - notificationReceived (app in FOREGROUND — the OS
 *                           suppresses the banner) → the callback shows an
 *                           in-app toast instead.
 *   teardownPush()    — on logout: delete this device's token row so a phleb
 *                       who signs out stops receiving that account's pushes.
 *
 * Every payload's `data` carries { type, appointmentId } — the notification
 * routing contract shared with the notify-phleb-push edge fn.
 *
 * No-op on web. All imports are dynamic so none of this enters the web bundle.
 */

export interface PushForegroundMessage {
  title: string;
  body: string;
  type: string | null;
  appointmentId: string | null;
}

let currentToken: string | null = null;
let listenersWired = false;

function goToAppointment(appointmentId: string | null) {
  const target = appointmentId
    ? `/phleb-app?appt=${encodeURIComponent(appointmentId)}`
    : '/phleb-app';
  // Full navigation (not SPA push) — the tap may be cold-launching the app,
  // and initNativeApp's appUrlOpen handler uses the same pattern.
  window.location.assign(target);
}

export async function initPush(
  userId: string,
  onForegroundMessage?: (msg: PushForegroundMessage) => void,
  opts: { silent?: boolean } = {},
): Promise<{ granted: boolean; prompted: boolean }> {
  if (!Capacitor.isNativePlatform()) return { granted: false, prompted: false };
  let prompted = false;
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

    // 1. Permission. In silent mode we NEVER trigger the OS dialog — the
    //    caller shows a priming UI first and re-invokes without silent.
    //    (iOS only lets us ask once; a cold un-primed prompt wastes it.)
    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive !== 'granted') {
      if (opts.silent) return { granted: false, prompted: false };
      prompted = true;
      perm = await FirebaseMessaging.requestPermissions();
    }
    if (perm.receive !== 'granted') return { granted: false, prompted };

    // 2. Listeners — wire once per app session.
    if (!listenersWired) {
      listenersWired = true;

      // Token rotation (FCM refreshes tokens periodically).
      await FirebaseMessaging.addListener('tokenReceived', async ({ token }) => {
        currentToken = token;
        await saveToken(userId, token);
      });

      // Tap on the OS banner → open the appointment card.
      await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
        const data = (event.notification?.data || {}) as Record<string, string>;
        goToAppointment(data.appointmentId || data.appointment_id || null);
      });

      // App in foreground — OS shows no banner; surface in-app instead.
      await FirebaseMessaging.addListener('notificationReceived', (event) => {
        const n = event.notification;
        const data = (n?.data || {}) as Record<string, string>;
        onForegroundMessage?.({
          title: n?.title || 'ConveLabs Pro',
          body: n?.body || '',
          type: data.type || null,
          appointmentId: data.appointmentId || data.appointment_id || null,
        });
      });
    }

    // 3. Register + persist the token.
    const { token } = await FirebaseMessaging.getToken();
    if (token) {
      currentToken = token;
      await saveToken(userId, token);
    }
    return { granted: true, prompted };
  } catch (err) {
    console.warn('[push] initPush skipped:', err);
    return { granted: false, prompted };
  }
}

async function saveToken(userId: string, token: string): Promise<void> {
  try {
    const platform = Capacitor.getPlatform(); // 'ios' | 'android'
    await supabase.from('push_tokens' as any).upsert(
      {
        user_id: userId,
        token,
        platform: platform === 'ios' || platform === 'android' ? platform : 'web',
        app_target: 'phleb',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' },
    );
  } catch (e) {
    console.warn('[push] token save failed (non-blocking):', e);
  }
}

/** On logout: remove this device's token so the next user on this phone
 *  doesn't receive the previous phleb's notifications. */
export async function teardownPush(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !currentToken) return;
  try {
    await supabase.from('push_tokens' as any).delete().eq('token', currentToken);
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    await FirebaseMessaging.deleteToken();
    currentToken = null;
  } catch (e) {
    console.warn('[push] teardown failed (non-blocking):', e);
  }
}
