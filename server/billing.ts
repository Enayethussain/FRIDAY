// FRIDAY billing core: plans, subscription states, feature catalog, products.
// Server-side only — never ships to the APK. Google Play Billing is NOT yet
// integrated: purchases cannot complete, and every purchase/restore path says
// so honestly. Real billing can be connected later by verifying purchases
// server-side and writing UserRecord.subscription (never by client flags).
import type { PlanId } from './store.js';

// Central feature catalog. Add future premium features here and assign them
// to plans below — no other file needs rewriting.
export const FEATURES = [
  'AI_BASIC', 'AI_ADVANCED',
  'VOICE_BASIC', 'VOICE_ADVANCED', 'JARVIS_VOICE',
  'PHONE_BASIC', 'PHONE_ADVANCED',
  'FRIDAY_SHARE_BASIC', 'FRIDAY_SHARE_ADVANCED',
  'GESTURES_BASIC', 'GESTURES_ADVANCED',
  'SCREEN_AWARENESS',
  'HOLOGRAM', 'HOLOGRAM_LIBRARY', 'MODEL_UPLOAD',
  'APP_BUILDER',
  'MEMORY_BASIC', 'MEMORY_ADVANCED',
  'AUTOMATION', 'MULTI_DEVICE',
  'ADS_REMOVAL', 'EARLY_ACCESS',
] as const;
export type FeatureId = (typeof FEATURES)[number];

export type SubscriptionStatus =
  | 'FREE' | 'PRO_MONTHLY' | 'PRO_3_MONTH' | 'PRO_YEARLY'
  | 'PLUS_MONTHLY' | 'PLUS_3_MONTH' | 'PLUS_YEARLY'
  | 'EXPIRED' | 'CANCELLED' | 'PENDING' | 'REFUNDED'
  | 'ACCOUNT_HOLD' | 'PAUSED' | 'REVOKED';

export interface SubscriptionRecord {
  status: SubscriptionStatus;
  productId: string; // Play product id when billing lands; '' until then
  basePlanId: string; // Play base plan id (reported, informational)
  offerId: string; // Play offer id used (reported, informational)
  expiryAt: number; // ms epoch; 0 = none set (never invent renewal dates)
  autoRenew: boolean;
  autoRenewing: boolean; // current Play auto-renew flag
  updatedAt: number;
}

export function blankSubscription(): SubscriptionRecord {
  return { status: 'FREE', productId: '', basePlanId: '', offerId: '', expiryAt: 0, autoRenew: false, autoRenewing: false, updatedAt: Date.now() };
}

const PRO_ENTITLEMENTS: FeatureId[] = [
  'AI_BASIC', 'AI_ADVANCED', 'VOICE_BASIC', 'VOICE_ADVANCED', 'JARVIS_VOICE',
  'PHONE_BASIC', 'PHONE_ADVANCED', 'FRIDAY_SHARE_BASIC', 'FRIDAY_SHARE_ADVANCED',
  'GESTURES_BASIC', 'GESTURES_ADVANCED', 'SCREEN_AWARENESS',
  'HOLOGRAM', 'HOLOGRAM_LIBRARY', 'APP_BUILDER',
  'MEMORY_BASIC', 'MEMORY_ADVANCED', 'AUTOMATION', 'MULTI_DEVICE', 'ADS_REMOVAL',
];
const PLUS_EXTRA: FeatureId[] = ['MODEL_UPLOAD', 'EARLY_ACCESS'];
const FREE_ENTITLEMENTS: FeatureId[] = [
  'AI_BASIC', 'VOICE_BASIC', 'PHONE_BASIC', 'FRIDAY_SHARE_BASIC',
  'GESTURES_BASIC', 'MEMORY_BASIC',
];

/** Plan -> entitlement set. Single source of truth (backend + mirrored read-only on client). */
export function entitlementsForPlan(plan: 'FREE' | 'PRO' | 'PLUS'): Record<FeatureId, boolean> {
  const out = {} as Record<FeatureId, boolean>;
  for (const f of FEATURES) out[f] = false;
  const granted = plan === 'PLUS' ? [...PRO_ENTITLEMENTS, ...PLUS_EXTRA]
    : plan === 'PRO' ? PRO_ENTITLEMENTS : FREE_ENTITLEMENTS;
  for (const f of granted) out[f] = true;
  return out;
}

/**
 * Effective plan from base/admin plan + subscription. Expiry/cancel semantics:
 * - active subscription (expiry in future or no expiry set by billing yet):
 *   plan from status prefix (PRO_* -> PRO, PLUS_* -> PLUS).
 * - CANCELLED with future expiry: stays entitled until expiryAt (autoRenew off).
 * - past expiry (any status): EXPIRED behavior -> FREE entitlements.
 * - PENDING/REFUNDED: FREE entitlements (never premium without payment).
 * - No subscription (FREE): base/admin plan.
 * User data is never touched by any of these transitions.
 */
export function effectivePlan(
  basePlan: PlanId,
  sub: SubscriptionRecord,
  now = Date.now()
): 'FREE' | 'PRO' | 'PLUS' {
  const expired = sub.expiryAt > 0 && sub.expiryAt <= now;
  if (sub.status === 'PENDING' || sub.status === 'REFUNDED' || sub.status === 'REVOKED') return 'FREE';
  if (sub.status === 'EXPIRED' || expired) return 'FREE';
  // Account hold suspends access (Play grants no entitlement while on hold).
  if (sub.status === 'ACCOUNT_HOLD') return 'FREE';
  if (sub.status === 'PAUSED') {
    // Paused: retain only while a verified future expiry exists (plan from
    // the server catalog mapping, never a client claim).
    if (sub.expiryAt > now) {
      const mapped = productById(sub.productId || '');
      if (mapped) return mapped.plan;
    }
    return 'FREE';
  }
  if (sub.status.startsWith('PRO_')) return 'PRO';
  if (sub.status.startsWith('PLUS_')) return 'PLUS';
  if (sub.status === 'CANCELLED') {
    // Cancelled but paid through expiry: keep entitlement until the verified
    // end date (plan derived from the server catalog mapping, never a client
    // claim). Unknown/past end date or no product -> FREE. User data is never
    // deleted either way.
    if (sub.expiryAt > now) {
      const mapped = productById(sub.productId || '');
      if (mapped) return mapped.plan;
    }
    return 'FREE';
  }
  if (sub.status === 'FREE') {
    if (basePlan === 'PRO' || basePlan === 'PLUS') return basePlan; // admin grant
    return 'FREE';
  }
  return 'FREE';
}

export function subscriptionStateLabel(sub: SubscriptionRecord, now = Date.now()): string {
  if (sub.status === 'FREE' && !sub.productId) return 'FREE';
  if (sub.expiryAt > 0 && sub.expiryAt <= now) return 'EXPIRED';
  return sub.status;
}

// ---- Admin plan grants (server env only, never the APK) ----
// PLAN_GRANTS="device:<id>:PRO,device:<id2>:PLUS" — operator-assigned plans
// (testing, support). DEVELOPMENT ONLY: disabled in production builds, where
// only verified Play purchases grant premium. No user is hard-coded in code.
export function adminGrants(): Record<string, 'PRO' | 'PLUS'> {
  const out: Record<string, 'PRO' | 'PLUS'> = {};
  try {
    if ((process.env.NODE_ENV || 'development') === 'production') return out;
    for (const part of String(process.env.PLAN_GRANTS || '').split(',')) {
      const [user, plan] = part.trim().split(':').map((s) => (s || '').trim());
      // user ids look like "device:xyz" (contain a colon) — split carefully.
      const m = part.trim().match(/^(device:[^:]+|[^:]+):(PRO|PLUS)$/i);
      if (m) out[m[1]] = m[2].toUpperCase() as 'PRO' | 'PLUS';
      void user; void plan;
    }
  } catch { /* env-only */ }
  return out;
}

// ---- Products / pricing — ONE centralized catalog (single source of truth) ----
// Intended FRIDAY launch prices (INR). Google Play's localized price at
// checkout is authoritative; the client displays Play prices when available
// and these intended prices otherwise. Product IDs are fixed here (never from
// env) so they always match Play Console. BILLING_PRODUCTS_JSON may only
// override the intended DISPLAY price strings (validated), never IDs/plans.
export interface CatalogProduct {
  key: string; // PRO_MONTHLY ...
  productId: string; // exact Play product id
  plan: 'PRO' | 'PLUS';
  status: SubscriptionStatus; // status granted on verified purchase
  period: 'MONTHLY' | '3_MONTH' | 'YEARLY';
  displayName: string;
  intendedPriceINR: number;
  intendedDisplay: string; // "₹99/month"
  currency: string;
  badge: string; // '' or factual UI label, e.g. lowest effective monthly rate
}

export const PRODUCT_CATALOG: CatalogProduct[] = [
  { key: 'PRO_MONTHLY', productId: 'friday_pro_monthly', plan: 'PRO', status: 'PRO_MONTHLY', period: 'MONTHLY', displayName: 'FRIDAY Pro Monthly', intendedPriceINR: 99, intendedDisplay: '₹99/month', currency: 'INR', badge: '' },
  { key: 'PRO_3_MONTH', productId: 'friday_pro_3_month', plan: 'PRO', status: 'PRO_3_MONTH', period: '3_MONTH', displayName: 'FRIDAY Pro 3 Months', intendedPriceINR: 249, intendedDisplay: '₹249/3 months', currency: 'INR', badge: '' },
  { key: 'PRO_YEARLY', productId: 'friday_pro_yearly', plan: 'PRO', status: 'PRO_YEARLY', period: 'YEARLY', displayName: 'FRIDAY Pro Yearly', intendedPriceINR: 799, intendedDisplay: '₹799/year', currency: 'INR', badge: 'BEST VALUE' },
  { key: 'PLUS_MONTHLY', productId: 'friday_plus_monthly', plan: 'PLUS', status: 'PLUS_MONTHLY', period: 'MONTHLY', displayName: 'FRIDAY Plus Monthly', intendedPriceINR: 199, intendedDisplay: '₹199/month', currency: 'INR', badge: '' },
  { key: 'PLUS_3_MONTH', productId: 'friday_plus_3_month', plan: 'PLUS', status: 'PLUS_3_MONTH', period: '3_MONTH', displayName: 'FRIDAY Plus 3 Months', intendedPriceINR: 499, intendedDisplay: '₹499/3 months', currency: 'INR', badge: '' },
  { key: 'PLUS_YEARLY', productId: 'friday_plus_yearly', plan: 'PLUS', status: 'PLUS_YEARLY', period: 'YEARLY', displayName: 'FRIDAY Plus Yearly', intendedPriceINR: 1499, intendedDisplay: '₹1,499/year', currency: 'INR', badge: 'BEST VALUE' },
];

/** Server-side productId -> catalog mapping. Client plan claims are ignored. */
export function productById(productId: string): CatalogProduct | null {
  const id = String(productId || '').trim();
  if (!id) return null;
  return PRODUCT_CATALOG.find((p) => p.productId === id) || null;
}

export interface ProductInfo {
  key: string;
  productId: string;
  plan: 'PRO' | 'PLUS';
  period: string;
  displayName: string;
  intendedPriceINR: number;
  price: string; // intended display (admin-overridable), Play price wins at checkout
  currency: string;
  badge: string;
  configured: boolean; // a display price is available (intended or override)
}

/**
 * BILLING_PRODUCTS_JSON may override intended DISPLAY strings only, keyed by
 * catalog key: {"PRO_MONTHLY":{"price":"₹99/month","currency":"INR"}}.
 * Invalid entries are ignored (catalog stands). Missing/invalid config never
 * grants premium — it only affects displayed text.
 */
export function products(): { configured: boolean; billingAvailable: boolean; playConsoleConfigured: boolean; items: ProductInfo[] } {
  let cfg: Record<string, { price?: string; currency?: string }> = {};
  try {
    const parsed = JSON.parse(process.env.BILLING_PRODUCTS_JSON || '{}');
    if (parsed && typeof parsed === 'object') cfg = parsed;
  } catch { cfg = {}; }
  const items: ProductInfo[] = PRODUCT_CATALOG.map((p) => {
    const override = cfg[p.key] || {};
    const price = String(override.price || '').trim() || p.intendedDisplay;
    const currency = String(override.currency || '').trim() || p.currency;
    return {
      key: p.key, productId: p.productId, plan: p.plan, period: p.period,
      displayName: p.displayName, intendedPriceINR: p.intendedPriceINR,
      price, currency, badge: p.badge, configured: price.length > 0,
    };
  });
  return {
    configured: items.some((i) => i.configured),
    // Server-side Play Developer API verification is available only when the
    // admin configures PLAY_SERVICE_ACCOUNT_JSON (never in the APK).
    billingAvailable: playVerificationConfigured(),
    playConsoleConfigured: false, // true only after products are verified live in Play Console
    items,
  };
}

/** True only when Play Developer API service-account creds are configured. */
export function playVerificationConfigured(): boolean {
  try {
    const raw = (process.env.PLAY_SERVICE_ACCOUNT_JSON || '').trim();
    if (!raw) return false;
    const j = JSON.parse(raw);
    return !!(j && j.client_email && j.private_key);
  } catch {
    return false;
  }
}

export function deviceLimitFor(plan: 'FREE' | 'PRO' | 'PLUS', free: number, pro: number, plus: number): number {
  if (plan === 'PLUS') return plus;
  if (plan === 'PRO') return pro;
  return free;
}
