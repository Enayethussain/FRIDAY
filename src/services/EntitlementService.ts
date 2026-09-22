// EntitlementService — centralized client-side entitlement cache.
// Server (/api/v1/account) is AUTHORITATIVE. This module only caches:
//
//   confirmed   — fresh server response (premium claims trusted)
//   cached      — server unreachable, last confirmed state reused (timestamped)
//   unavailable — no server data and no cache (FREE behavior, never premium)
//
// "PRO ACTIVE" is shown only for confirmed/cached premium. Production never
// trusts local plan strings. A dev-only override exists for development
// builds and is compiled out of production (import.meta.env.DEV gate).
import { apiUrl } from '../lib/serverUrl';
import { FridayLogger } from './FridayLogger';

const TAG = 'Entitlement';

export type PlanId = 'FREE' | 'PRO' | 'PLUS';
export type EntitlementState = 'confirmed' | 'cached' | 'unavailable';

export interface SubscriptionInfo {
  status: string;
  productId: string;
  basePlanId: string;
  offerId: string;
  expiryAt: number;
  autoRenew: boolean;
  autoRenewing: boolean;
  uiState: string;
}

export interface EntitlementSnapshot {
  plan: PlanId;
  subscriptionStatus: string;
  subscription: SubscriptionInfo;
  entitlements: Record<string, boolean>;
  devicesUsed: number;
  maxDevices: number;
  state: EntitlementState;
  fetchedAt: number;
}

const CACHE_KEY = 'friday_entitlement_cache';
const DEV_OVERRIDE_KEY = 'friday_dev_entitlement';

const FREE_SNAPSHOT: EntitlementSnapshot = {
  plan: 'FREE',
  subscriptionStatus: 'FREE',
  subscription: { status: 'FREE', productId: '', basePlanId: '', offerId: '', expiryAt: 0, autoRenew: false, autoRenewing: false, uiState: 'NOT_PURCHASED' },
  entitlements: {},
  devicesUsed: 0,
  maxDevices: 2,
  state: 'unavailable',
  fetchedAt: 0,
};

let current: EntitlementSnapshot = { ...FREE_SNAPSHOT };
const listeners = new Set<(s: EntitlementSnapshot) => void>();

function deviceId(): string {
  try {
    return localStorage.getItem('friday_device_id') || '';
  } catch {
    return '';
  }
}

function emit(): void {
  listeners.forEach((fn) => {
    try { fn({ ...current }); } catch { /* UI-only */ }
  });
}

export function subscribeEntitlements(fn: (s: EntitlementSnapshot) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getEntitlements(): EntitlementSnapshot {
  return { ...current };
}

/** Central gate — use this instead of scattering plan checks. */
export function hasEntitlement(feature: string): boolean {
  // Dev-only override: development builds can simulate a plan for UI testing.
  // Production builds ignore it entirely (cannot ship as an unlock).
  try {
    if (import.meta.env.DEV) {
      const dev = (localStorage.getItem(DEV_OVERRIDE_KEY) || '').toUpperCase();
      if (dev === 'PRO' || dev === 'PLUS' || dev === 'FREE') {
        if (dev === 'FREE') return basicFeatures(feature);
        if (dev === 'PRO') return proFeatures(feature);
        return true;
      }
    }
  } catch { /* storage unavailable */ }
  if (current.state === 'unavailable') return basicFeatures(feature); // safest: FREE set
  return current.entitlements[feature] === true;
}

function basicFeatures(feature: string): boolean {
  return ['AI_BASIC', 'VOICE_BASIC', 'PHONE_BASIC', 'FRIDAY_SHARE_BASIC', 'GESTURES_BASIC', 'MEMORY_BASIC'].includes(feature);
}

function proFeatures(feature: string): boolean {
  if (feature === 'MODEL_UPLOAD' || feature === 'EARLY_ACCESS') return false;
  return true;
}

/** Refresh from the verified backend. Keeps last-confirmed cache on failure. */
export async function refreshEntitlements(): Promise<EntitlementSnapshot> {
  // Load disk cache first (survives app restart).
  if (current.state === 'unavailable') {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && (cached.plan === 'PRO' || cached.plan === 'PLUS' || cached.plan === 'FREE')) {
          current = { ...cached, state: 'cached' as EntitlementState };
        }
      }
    } catch { /* cache unreadable */ }
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(apiUrl(`/api/v1/account?device_id=${encodeURIComponent(deviceId())}`), { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json().catch(() => null);
    const planRaw = String(j?.plan || j?.user?.plan || 'FREE').toUpperCase();
    const plan: PlanId = planRaw === 'PRO' || planRaw === 'PLUS' ? planRaw : 'FREE';
    const full = (j?.entitlements_full && typeof j.entitlements_full === 'object') ? j.entitlements_full : {};
    const sub = j?.subscription || {};
    current = {
      plan,
      subscriptionStatus: String(j?.subscription_status || sub.status || 'FREE'),
      subscription: {
        status: String(sub.status || 'FREE'),
        productId: String(sub.product_id || sub.productId || ''),
        basePlanId: String(sub.base_plan_id || sub.basePlanId || ''),
        offerId: String(sub.offer_id || sub.offerId || ''),
        expiryAt: Number(sub.expiry_at ?? sub.expires_at ?? sub.expiryAt ?? 0) || 0,
        autoRenew: !!(sub.auto_renew ?? sub.autoRenew),
        autoRenewing: !!(sub.auto_renewing ?? sub.autoRenewing),
        uiState: String((sub as Record<string, unknown>).ui_state || (sub as Record<string, unknown>).uiState || ''),
      },
      entitlements: full,
      devicesUsed: Number(j?.devices_used ?? 0) || 0,
      maxDevices: Number(j?.max_devices ?? 0) || 0,
      state: 'confirmed',
      fetchedAt: Date.now(),
    };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(current));
    } catch { /* cache best-effort */ }
    FridayLogger.info(TAG, `confirmed plan=${plan} sub=${current.subscriptionStatus}`);
  } catch (e) {
    // Server unreachable: keep safely-cached state, else FREE behavior.
    if (current.state === 'confirmed' || current.state === 'cached') {
      current = { ...current, state: 'cached' as EntitlementState };
      FridayLogger.info(TAG, `backend unreachable — using cached plan=${current.plan}`);
    } else {
      current = { ...FREE_SNAPSHOT };
      FridayLogger.info(TAG, 'backend unreachable, no cache — FREE behavior');
    }
    void e;
  }
  emit();
  return getEntitlements();
}

/** Dev builds only: simulate a plan for UI testing (never production). */
export function setDevEntitlement(plan: '' | 'FREE' | 'PRO' | 'PLUS'): void {
  try {
    if (plan) localStorage.setItem(DEV_OVERRIDE_KEY, plan);
    else localStorage.removeItem(DEV_OVERRIDE_KEY);
  } catch { /* noop */ }
  emit();
}
