// LicenseService — anti-piracy device-binding check (one device per license).
// Sends { email, deviceId } to POST /api/license/check. The backend verdict
// is authoritative; this module only caches the last verdict for the HUD.
// Identity = checkout payer email (owns the grant) else Firebase email.
// No email -> no license to bind -> authorized (FREE path, never locks).
import { useSyncExternalStore } from 'react';
import { apiUrl } from '../lib/serverUrl';
import { getDeviceId } from '../utils/deviceFingerprint';

export interface LicenseStatus {
  /** Backend verdict: false ONLY on active-license + other-device. */
  isAuthorized: boolean;
  licensed: boolean;
  plan: string;
  bound: boolean;
  reason: string;
  message: string;
  /** Last check outcome: ok | degraded (server unreachable) | unchecked. */
  state: 'unchecked' | 'ok' | 'degraded';
  checkedAt: number;
}

const FREE_PASS: LicenseStatus = {
  isAuthorized: true, licensed: false, plan: 'FREE', bound: false,
  reason: '', message: '', state: 'unchecked', checkedAt: 0,
};

let current: LicenseStatus = { ...FREE_PASS };
const listeners = new Set<(s: LicenseStatus) => void>();

function emit(): void {
  listeners.forEach((fn) => {
    try { fn({ ...current }); } catch { /* UI-only */ }
  });
}

export function subscribeLicense(fn: (s: LicenseStatus) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getLicenseStatus(): LicenseStatus {
  return { ...current };
}

/** React hook for the license verdict (lock overlay reads this). */
export function useLicense(): LicenseStatus {
  return useSyncExternalStore(subscribeLicense, getLicenseStatus, getLicenseStatus);
}

/** License identity: checkout payer email first (grant owner), then Firebase. */
export function getLicenseEmail(): string {
  try {
    const payer = (localStorage.getItem('friday_payer_email') || '').trim().toLowerCase();
    if (payer && payer.includes('@')) return payer;
  } catch { /* storage unavailable */ }
  return '';
}

export async function checkLicense(): Promise<LicenseStatus> {
  let email = getLicenseEmail();
  if (!email) {
    try {
      const { auth } = await import('../lib/firebase');
      email = (auth.currentUser?.email || '').trim().toLowerCase();
    } catch { /* firebase unavailable */ }
  }
  if (!email) {
    current = { ...FREE_PASS, state: 'ok', checkedAt: Date.now() };
    emit();
    return getLicenseStatus();
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(apiUrl('/api/license/check'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, deviceId: getDeviceId() }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const j = await res.json().catch(() => null);
    if (!j || j.success !== true) throw new Error('bad reply');
    current = {
      isAuthorized: j.isAuthorized !== false,
      licensed: !!j.licensed,
      plan: String(j.plan || 'FREE'),
      bound: !!j.bound,
      reason: String(j.reason || ''),
      message: String(j.message || ''),
      state: 'ok',
      checkedAt: Date.now(),
    };
  } catch {
    // Server unreachable: fail OPEN (never lock on network error).
    current = { ...current, isAuthorized: true, state: 'degraded', checkedAt: Date.now() };
  }
  emit();
  return getLicenseStatus();
}
