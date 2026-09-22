// AdsService — centralized App Open ad decision for FRIDAY.
// FREE  -> App Open Ads enabled.
// PRO / PLUS (verified backend entitlement) -> disabled.
// Unknown/unreachable backend -> FREE behavior for ads (show), but NEVER
// premium: premium is granted only by a verified backend plan.
//
// Critical FRIDAY operations suppress ads (never interrupt voice, calls,
// transfers, vault/security, camera, gestures, permissions, phone control).
// Native (FridayAds plugin) owns SDK state/lifecycle/cooldown/expiry; the
// entitlement itself comes from EntitlementService (server-authoritative).
// No FRIDAY data is ever sent to AdMob.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { getEntitlements, refreshEntitlements } from './EntitlementService';
import { FridayLogger } from './FridayLogger';

const TAG = 'Ads';

interface FridayAdsPlugin {
  setConfig(options: { adsAllowed?: boolean; criticalBusy?: boolean }): Promise<{ state: string; isTestUnit?: boolean }>;
  preload(): Promise<{ state: string; isTestUnit?: boolean }>;
  getState(): Promise<{ state: string; isTestUnit?: boolean; lastShownAt?: number }>;
  getDiagnostics(): Promise<Record<string, unknown>>;
  addListener(event: 'adState', fn: (s: { state: string }) => void): Promise<{ remove: () => void }>;
}

let plugin: FridayAdsPlugin | null = null;
try {
  if (Capacitor.isNativePlatform()) {
    plugin = registerPlugin<FridayAdsPlugin>('FridayAds');
  }
} catch { plugin = null; }

export type AdsPlan = 'FREE' | 'PRO' | 'PLUS' | 'UNKNOWN';

let verifiedPlan: AdsPlan = 'UNKNOWN';
let criticalReasons = new Set<string>();
let lastNativeState = 'NOT_INITIALIZED';
let configured = false;

function isNative(): boolean {
  return plugin !== null;
}

/**
 * Central decision (mirrors backend entitlementsFor, client-side only for
 * ad display — premium authorization itself stays server-side).
 */
export function shouldShowAds(plan: AdsPlan = verifiedPlan): boolean {
  if (!isNative()) return false; // web/dev browser: never ads
  if (plan === 'PRO' || plan === 'PLUS') return false;
  return true; // FREE or UNKNOWN (backend unreachable): FREE behavior, never premium
}

async function pushToNative(): Promise<void> {
  if (!plugin) return;
  try {
    const r = await plugin.setConfig({
      adsAllowed: shouldShowAds(),
      criticalBusy: criticalReasons.size > 0,
    });
    if (r && typeof r.state === 'string') lastNativeState = r.state;
  } catch (e) {
    FridayLogger.error(TAG, `native setConfig failed: ${(e as Error)?.message || e}`);
  }
}

/** Fetch verified plan from backend once at startup; safe default on failure. */
export async function initAdsEntitlement(): Promise<AdsPlan> {
  if (!isNative()) {
    FridayLogger.info(TAG, 'not native — ads disabled');
    return 'UNKNOWN';
  }
  // Server-authoritative via EntitlementService (confirmed/cached/unavailable).
  const snap = await refreshEntitlements();
  verifiedPlan = snap.plan === 'PRO' || snap.plan === 'PLUS' ? snap.plan
    : snap.plan === 'FREE' ? 'FREE' : 'UNKNOWN';
  FridayLogger.info(TAG, `verified plan=${verifiedPlan} (${snap.state}) shouldShowAds=${shouldShowAds()}`);
  configured = true;
  await pushToNative();
  try {
    await plugin!.addListener('adState', (s) => {
      if (s && typeof s.state === 'string') lastNativeState = s.state;
    });
  } catch { /* listener-only */ }
  // Opportunistic preload once eligibility is known.
  try { await plugin!.preload(); } catch { /* best effort */ }
  return verifiedPlan;
}

/** Mark a critical operation running/finished. Never blocks FRIDAY on failure. */
export function setCriticalBusy(reason: string, busy: boolean): void {
  const before = criticalReasons.size;
  if (busy) criticalReasons.add(reason);
  else criticalReasons.delete(reason);
  if (criticalReasons.size !== before || !configured) {
    configured = true;
    void pushToNative();
  }
}

export function getAdsDiagnostics(): {
  native: boolean;
  plan: AdsPlan;
  shouldShowAds: boolean;
  criticalBusy: boolean;
  criticalReasons: string[];
  nativeState: string;
} {
  return {
    native: isNative(),
    plan: verifiedPlan,
    shouldShowAds: shouldShowAds(),
    criticalBusy: criticalReasons.size > 0,
    criticalReasons: [...criticalReasons],
    nativeState: lastNativeState,
  };
}

/** Full native triage snapshot (real SDK errors, entitlement, staleness). */
export async function getNativeAdDiagnostics(): Promise<Record<string, unknown> | null> {
  if (!plugin) return null;
  try {
    return await plugin.getDiagnostics();
  } catch (e) {
    FridayLogger.error(TAG, `native getDiagnostics failed: ${(e as Error)?.message || e}`);
    return null;
  }
}
