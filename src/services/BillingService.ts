// BillingService — Google Play Billing front-end + backend verification.
// The client ONLY collects purchase tokens and displays prices. Entitlement
// is granted exclusively by the backend after Play Developer API verification
// (POST /api/v1/billing/verify). Nothing here can unlock premium by itself.
//
// Price display: Google Play's localized price is authoritative at checkout.
// The backend catalog's intended INR price is the fallback until Play
// responds (or on web, where Play is unavailable).
import { Capacitor, registerPlugin } from '@capacitor/core';
import { apiUrl } from '../lib/serverUrl';
import { FridayLogger } from './FridayLogger';

const TAG = 'Billing';

export interface PlayPricingPhase {
  formattedPrice: string;
  billingPeriod: string; // ISO-8601: P1M, P3M, P1Y, P7D ...
  priceCurrencyCode: string;
  priceAmountMicros: number;
  recurrenceMode: number; // 1=infinite, 2=finite, 3=one-time
}

export interface PlayOffer {
  offerId: string;
  basePlanId: string;
  offerToken: string;
  offerTags: string[];
  pricingPhases: PlayPricingPhase[];
}

export interface PlayProductPrice {
  productId: string;
  title: string;
  playPrice: string; // localized, authoritative (first offer, first phase)
  offerToken: string;
  offers: PlayOffer[];
}

export interface ProductItem {
  key: string;
  productId: string;
  plan: 'PRO' | 'PLUS';
  period: string;
  displayName: string;
  intendedPriceINR: number;
  price: string; // intended display (fallback)
  currency: string;
  badge: string;
  configured: boolean;
  /** Play localized price when available (authoritative). */
  playPrice?: string;
  offerToken?: string;
  /** All offers Play returned (empty until Play responds). */
  playOffers?: PlayOffer[];
}

export interface ProductsResult {
  billingAvailable: boolean;
  playAvailable: boolean;
  paymentsConfigured: boolean;
  message: string;
  items: ProductItem[];
}

interface FridayBillingPlugin {
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  queryProducts(): Promise<{ products: PlayProductPrice[] }>;
  purchase(options: { productId: string; offerToken?: string; oldPurchaseToken?: string }): Promise<{ launched: boolean; code?: string }>;
  queryPurchases(): Promise<{ purchases: { productId: string; purchaseToken: string; state: string; acknowledged: boolean }[] }>;
  acknowledge(options: { purchaseToken: string }): Promise<{ acknowledged: boolean }>;
  addListener(event: 'purchaseUpdate', fn: (e: { responseCode: number; purchases: { productId: string; purchaseToken: string; state: string; acknowledged: boolean }[] }) => void): Promise<{ remove: () => void }>;
}

let plugin: FridayBillingPlugin | null = null;
try {
  if (Capacitor.isNativePlatform()) {
    plugin = registerPlugin<FridayBillingPlugin>('FridayBilling');
  }
} catch { plugin = null; }

function deviceId(): string {
  try { return localStorage.getItem('friday_device_id') || ''; } catch { return ''; }
}

/** Backend catalog (single source for IDs/plans/periods/intended prices). */
async function fetchCatalog(): Promise<{ items: ProductItem[]; message: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(apiUrl('/api/v1/billing/products'), { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json().catch(() => null);
    return { items: Array.isArray(j?.items) ? j.items : [], message: String(j?.message || '') };
  } catch {
    return { items: [], message: 'Subscriptions are not available yet.' };
  }
}

export async function getProducts(): Promise<ProductsResult> {
  const { items, message } = await fetchCatalog();
  let playAvailable = false;
  let playPrices: Record<string, PlayProductPrice> = {};
  if (plugin) {
    try {
      const avail = await plugin.isAvailable();
      playAvailable = !!avail?.available;
      if (playAvailable) {
        const q = await plugin.queryProducts();
        for (const p of q?.products || []) {
          if (p?.productId) playPrices[p.productId] = p;
        }
      }
    } catch (e) {
      FridayLogger.error(TAG, `play query failed: ${(e as Error)?.message || e}`);
    }
  }
  const merged: ProductItem[] = items.map((i) => {
    const play = playPrices[i.productId];
    return {
      ...i,
      playPrice: play?.playPrice || undefined,
      offerToken: play?.offerToken || undefined,
      playOffers: play?.offers || [],
    };
  });
  const paymentsConfigured = merged.some((i) => i.configured) || Object.keys(playPrices).length > 0;
  return {
    billingAvailable: playAvailable,
    playAvailable,
    paymentsConfigured,
    message: paymentsConfigured ? message || 'Google Play price at checkout is final.' : 'Google Play subscriptions are not configured yet.',
    items: merged,
  };
}

/** Sends a Play purchase token to the backend for verification (the ONLY grant path). */
async function verifyWithBackend(
  productId: string,
  purchaseToken: string,
  meta?: { basePlanId?: string; offerId?: string; billingPeriod?: string }
): Promise<{ granted: boolean; message: string; uiState?: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(apiUrl('/api/v1/billing/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId(),
        product_id: productId,
        purchase_token: purchaseToken,
        package_name: 'com.friday.ai',
        base_plan_id: meta?.basePlanId || '',
        offer_id: meta?.offerId || '',
        billing_period: meta?.billingPeriod || '',
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const j = await res.json().catch(() => null);
    if (j && j.success) {
      const { refreshEntitlements } = await import('./EntitlementService');
      await refreshEntitlements();
      return { granted: true, message: 'Sir, subscription active ho gaya. Welcome to premium!', uiState: String(j.ui_state || 'ACTIVE') };
    }
    return { granted: false, message: String(j?.error || 'Sir, purchase verify nahi ho payi.'), uiState: String(j?.ui_state || '') };
  } catch {
    return { granted: false, message: 'Server reachable nahi hai. Purchase verify ke liye internet chahiye.' };
  }
}

/**
 * Purchase: Play sheet (exact offer token) -> token -> backend verify ->
 * acknowledge ONLY on grant. Never reports success before backend confirms.
 * oldPurchaseToken performs a Play-managed plan change (upgrade/downgrade).
 */
export async function purchaseProduct(
  productId: string,
  opts?: { offer?: PlayOffer; oldPurchaseToken?: string }
): Promise<{ ok: boolean; message: string }> {
  if (!plugin) {
    return { ok: false, message: 'Google Play subscriptions are not configured yet.' };
  }
  try {
    const avail = await plugin.isAvailable();
    if (!avail?.available) {
      return { ok: false, message: 'Google Play billing available nahi hai is device par.' };
    }
    const q = await plugin.queryProducts();
    const match = (q?.products || []).find((p) => p.productId === productId);
    if (!match) {
      return { ok: false, message: 'Subscriptions are not available yet. Ye product Play par configured nahi hai.' };
    }
    // Only a valid offer returned by Play (default: first offer, usually the
    // base plan). Tokens are never constructed manually.
    const selectedOffer: PlayOffer | undefined =
      (opts?.offer && match.offers?.some((o) => o.offerToken === opts.offer!.offerToken) ? opts.offer : undefined)
      || match.offers?.[0];
    const offerToken = selectedOffer?.offerToken || match.offerToken;
    if (!offerToken) {
      return { ok: false, message: 'Subscriptions are not available yet. Play ne koi valid offer nahi diya.' };
    }
    const launched = await plugin.purchase({ productId, offerToken, oldPurchaseToken: opts?.oldPurchaseToken });
    if (!launched?.launched) {
      return { ok: false, message: 'Purchase shuru nahi ho payi. Dobara try karo.' };
    }
    // Result arrives via purchaseUpdate listener (wired once per call).
    return await new Promise((resolve) => {
      let done = false;
      const finish = (r: { ok: boolean; message: string }) => {
        if (!done) { done = true; resolve(r); }
      };
      const timeout = setTimeout(() => finish({ ok: false, message: 'Purchase ka jawab nahi aaya. Play Store me status check karo.' }), 120000);
      void plugin!.addListener('purchaseUpdate', (e) => {
        void (async () => {
          const p = (e?.purchases || []).find((x) => x.productId === productId);
          if (!p) {
            clearTimeout(timeout);
            finish({ ok: false, message: 'Purchase cancel ho gayi.' });
            return;
          }
          if (p.state !== 'PURCHASED') {
            clearTimeout(timeout);
            finish({ ok: false, message: 'Purchase pending hai. Play Store me complete hone ke baad try karo.' });
            return;
          }
          const v = await verifyWithBackend(p.productId, p.purchaseToken, {
            basePlanId: selectedOffer?.basePlanId,
            offerId: selectedOffer?.offerId,
            billingPeriod: selectedOffer?.pricingPhases?.[selectedOffer.pricingPhases.length - 1]?.billingPeriod,
          });
          clearTimeout(timeout);
          if (v.granted && !p.acknowledged) {
            try { await plugin!.acknowledge({ purchaseToken: p.purchaseToken }); } catch { /* ack best-effort */ }
          }
          finish({ ok: v.granted, message: v.message });
        })();
      });
    });
  } catch (e) {
    return { ok: false, message: `Purchase fail ho gayi: ${(e as Error)?.message || 'unknown error'}` };
  }
}

function humanPeriod(iso: string): string {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const parts: string[] = [];
  if (m[1]) parts.push(`${m[1]}-year`);
  if (m[2]) parts.push(`${m[2]}-month`);
  if (m[3]) parts.push(`${m[3]}-week`);
  if (m[4]) parts.push(`${m[4]}-day`);
  return parts.join(' ') || String(iso);
}

/**
 * Factual offer description built ONLY from Play pricing phases.
 * Never invents "50% OFF" / trial claims — text mirrors the phases.
 * Returns null when there is nothing beyond the regular price.
 */
export function describeOffer(offer: PlayOffer | undefined, regularPrice: string): string[] | null {
  if (!offer || !Array.isArray(offer.pricingPhases) || offer.pricingPhases.length < 2) return null;
  const lines: string[] = [];
  const first = offer.pricingPhases[0];
  const last = offer.pricingPhases[offer.pricingPhases.length - 1];
  const isFree = Number(first.priceAmountMicros || 0) === 0;
  if (isFree && first.recurrenceMode !== 1) {
    lines.push(`${humanPeriod(first.billingPeriod)} free trial`);
  } else if (first.formattedPrice && first.formattedPrice !== last.formattedPrice) {
    lines.push(`${first.formattedPrice} for first ${humanPeriod(first.billingPeriod)}`);
  } else {
    return null;
  }
  lines.push(`Then ${last.formattedPrice || regularPrice}/${humanPeriod(last.billingPeriod)}`);
  return lines;
}

/** Fixed UI vocabulary for subscription lifecycle (§23). No success inflation. */
export function lifecycleMessage(uiState: string, planName: string, dateStr: string): string {
  const plan = planName || 'Pro';
  switch (uiState) {
    case 'ACTIVE': return `FRIDAY ${plan} is active.`;
    case 'CANCELLED': return dateStr
      ? `Your ${plan} subscription is cancelled. Access continues until ${dateStr}.`
      : `Your ${plan} subscription is cancelled.`;
    case 'PENDING': return 'Your payment is pending.';
    case 'GRACE_PERIOD': return 'Payment issue. Your subscription is currently in grace period.';
    case 'ACCOUNT_HOLD': return 'Your subscription requires attention.';
    case 'PAUSED': return 'Your subscription is paused.';
    case 'EXPIRED': return `Your ${plan} subscription has expired.`;
    case 'REFUNDED': return 'Your subscription was refunded.';
    case 'REVOKED': return 'Your subscription was revoked.';
    case 'VERIFICATION_PENDING': return 'Verifying your subscription...';
    case 'VERIFICATION_FAILED': return 'Subscription verification failed. Please try again.';
    default: return 'Subscription status unavailable.';
  }
}

/** Current PURCHASED subscription token (for Play-managed plan change). */
export async function currentSubscriptionToken(): Promise<{ productId: string; purchaseToken: string } | null> {
  if (!plugin) return null;
  try {
    const avail = await plugin.isAvailable();
    if (!avail?.available) return null;
    const q = await plugin.queryPurchases();
    const p = (q?.purchases || []).find((x) => x.state === 'PURCHASED' && x.purchaseToken);
    return p ? { productId: p.productId, purchaseToken: p.purchaseToken } : null;
  } catch {
    return null;
  }
}
/** Restore: Play purchases -> backend verify each -> refresh entitlements. */
export async function restorePurchases(): Promise<{ ok: boolean; message: string; plan: string }> {
  if (!plugin) {
    // Web/non-native: fall back to server-state restore (never invents premium).
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(apiUrl('/api/v1/billing/restore'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId() }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const j = await res.json().catch(() => null);
      if (j && j.success) {
        const { refreshEntitlements } = await import('./EntitlementService');
        await refreshEntitlements();
        return { ok: true, message: String(j.message || 'Restore checked.'), plan: String(j.user?.plan || 'FREE') };
      }
      return { ok: false, message: 'Restore failed. Dobara try karo.' };
    } catch {
      return { ok: false, message: 'Server reachable nahi hai. Restore ke liye internet chahiye.' };
    }
  }
  try {
    const avail = await plugin.isAvailable();
    if (!avail?.available) {
      return { ok: false, message: 'Google Play billing available nahi hai is device par.' };
    }
    const q = await plugin.queryPurchases();
    const list = q?.purchases || [];
    if (!list.length) {
      return { ok: false, message: 'Koi Play purchase nahi mili. Is account me subscription nahi hai.' };
    }
    let grantedPlan = 'FREE';
    for (const p of list) {
      if (p.state !== 'PURCHASED' || !p.purchaseToken) continue;
      const v = await verifyWithBackend(p.productId, p.purchaseToken);
      if (v.granted) {
        grantedPlan = 'PREMIUM';
        if (!p.acknowledged) {
          try { await plugin.acknowledge({ purchaseToken: p.purchaseToken }); } catch { /* best-effort */ }
        }
      }
    }
    const { refreshEntitlements, getEntitlements } = await import('./EntitlementService');
    const snap = await refreshEntitlements();
    if (grantedPlan === 'PREMIUM' || snap.plan === 'PRO' || snap.plan === 'PLUS') {
      return { ok: true, message: 'Purchases restore ho gayi.', plan: snap.plan };
    }
    return { ok: false, message: 'Koi active subscription verify nahi hui. FREE plan active hai.' };
  } catch {
    return { ok: false, message: 'Restore fail ho gaya. Dobara try karo.' };
  }
}
