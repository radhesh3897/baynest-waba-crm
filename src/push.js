// Web Push subscription helpers for the installed PWA.
// iOS note: push only works from the home-screen-installed app (iOS 16.4+),
// and Notification.requestPermission() must be triggered by a user tap.
import { supabase } from './supabaseClient';

// Public VAPID key (safe to ship in the bundle). The matching PRIVATE key is a
// Supabase Edge Function secret (VAPID_PRIVATE_KEY) used by send-push.
const VAPID_PUBLIC = 'BMR8pDFfApOrO4ln8ovUQX7zMMhb6BU2ZGX10NJkuwvfN-FCf4H4SuKhymenQRyTvkxLBpIyiVO_1-Eu36loqMU';

function urlB64ToUint8Array(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function pushStatus() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) return 'enabled';
  return Notification.permission === 'granted' ? 'granted' : 'default';
}

// Must be called from a user gesture (button tap).
export async function enablePush() {
  if (!pushSupported()) {
    throw new Error('Push notifications aren’t supported here. On iPhone, first add this app to your Home Screen, then open it and try again.');
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission was not granted.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC),
    });
  }
  const j = sub.toJSON();
  let email = null;
  try { const { data } = await supabase.auth.getUser(); email = data?.user?.email ?? null; } catch (_) { /* ignore */ }

  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_email: email },
    { onConflict: 'endpoint' }
  );
  if (error) throw new Error(error.message);
  return true;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    try { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.toJSON().endpoint); } catch (_) { /* ignore */ }
    await sub.unsubscribe();
  }
  return true;
}
