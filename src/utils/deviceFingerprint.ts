// Device fingerprint — ONE persistent ID per phone/browser instance.
// Single source of truth for every service (chat, payments, entitlements,
// device link, license). Stored under the long-standing `friday_device_id`
// key so existing installs keep their identity (no behavior change).
const DEVICE_ID_KEY = 'friday_device_id';

function randomId(prefix: string): string {
  try {
    const c = (globalThis as any)?.crypto;
    if (c?.randomUUID) return `${prefix}-${c.randomUUID().slice(0, 12)}`;
  } catch { /* fall through */ }
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36).slice(-4)}`;
}

/** Stable per-device ID: stored once, reused forever. Never null. */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY) || '';
    if (existing) return existing;
    const fresh = randomId('web');
    try { localStorage.setItem(DEVICE_ID_KEY, fresh); } catch { /* private mode */ }
    return fresh;
  } catch {
    return randomId('web-unknown');
  }
}

/** Non-identifying device hints for support diagnostics (never leaves device unless logged). */
export function getDeviceInfo(): { platform: string; mobile: boolean } {
  try {
    const ua = navigator.userAgent || '';
    return {
      platform: (/android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'web'),
      mobile: /android|iphone|ipad|ipod|mobile/i.test(ua),
    };
  } catch {
    return { platform: 'unknown', mobile: false };
  }
}
