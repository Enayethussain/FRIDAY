import { Capacitor } from '@capacitor/core';

/**
 * Central backend resolver — PC uses relative URLs,
 * Android APK uses a configurable server URL stored in localStorage.
 * Set it in the app UI (DeviceLink / Settings) or via:
 *   localStorage.setItem('FRIDAY_SERVER_URL', 'https://your-server.com')
 */
export function getServerBase(): string {
  try {
    const stored =
      localStorage.getItem('FRIDAY_SERVER_URL') ||
      (import.meta as any).env?.VITE_FRIDAY_SERVER_URL ||
      '';
    if (stored) return stored.replace(/\/$/, '');
  } catch {}
  // On native Android, window.location.host is localhost (WebView) — not usable.
  // Return empty so callers can warn; user must set FRIDAY_SERVER_URL.
  if (Capacitor.isNativePlatform()) return '';
  return '';
}

export function apiUrl(path: string): string {
  const base = getServerBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

export function wsUrl(path: string): string {
  const base = getServerBase();
  const q = path.includes('?') ? path : path;
  if (base) {
    const proto = base.startsWith('https') ? 'wss:' : 'ws:';
    const host = base.replace(/^https?:\/\//, '');
    return `${proto}//${host}${q.startsWith('/') ? q : `/${q}`}`;
  }
  // Web fallback: same-origin
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${q.startsWith('/') ? q : `/${q}`}`;
}

export function isNativeApp(): boolean {
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {}
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

export function isScreenShareSupported(): boolean {
  return !!(
    navigator.mediaDevices &&
    (navigator.mediaDevices as any).getDisplayMedia
  );
}
