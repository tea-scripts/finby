import { useAuth } from './store';

/** Web Push helpers. All calls run in the browser only (guard with
 *  isPushSupported() first). VAPID public key is fetched from the API,
 *  so no NEXT_PUBLIC env is needed. */

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

function authed<T>(path: string, init?: RequestInit): Promise<T> {
  return useAuth.getState().authed<T>(path, init);
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return buffer;
}

async function register(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return reg;
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub ? 'on' : 'off';
}

export async function enablePush(workspaceId: string): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await register();
  const { publicKey } = await authed<{ publicKey: string | null }>(
    `/workspaces/${workspaceId}/push/vapid-public-key`,
  );
  if (!publicKey) return 'off'; // server has no VAPID keys configured

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(publicKey),
    }));

  const json = sub.toJSON();
  await authed<void>(`/workspaces/${workspaceId}/push/subscribe`, {
    method: 'POST',
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  return 'on';
}

export async function disablePush(workspaceId: string): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    const { endpoint } = sub;
    await sub.unsubscribe().catch(() => undefined);
    await authed<void>(`/workspaces/${workspaceId}/push/unsubscribe`, {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    }).catch(() => undefined);
  }
  return 'off';
}
