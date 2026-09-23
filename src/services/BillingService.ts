// BillingService — Telegram-distribution billing front-end (EKQR UPI).
// The client ONLY displays prices and forwards to the EKQR checkout flow
// (see PaymentService.createEkqrOrder). Entitlement is granted exclusively
// by the backend after verified UPI payment. Nothing here can unlock
// premium by itself. No store-billing dependency.
//
// Price display: the backend catalog's INR price is authoritative.
// EKQR checkout (GPay, PhonePe, Paytm) is final at checkout.
import { apiUrl } from '../lib/serverUrl';

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
}

export interface ProductsResult {
  billingAvailable: boolean;
  playAvailable: boolean;
  paymentsConfigured: boolean;
  message: string;
  items: ProductItem[];
}

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

/** Backend catalog only — never looks for Play configuration. */
export async function getProducts(): Promise<ProductsResult> {
  const { items } = await fetchCatalog();
  const paymentsConfigured = items.some((i) => i.configured);
  return {
    billingAvailable: false,
    playAvailable: false,
    paymentsConfigured,
    message: 'Secure UPI payment via EKQR (GPay, PhonePe, Paytm).',
    items,
  };
}

/** Legacy token verify path (pre-Telegram). EKQR/UPI orders verify via /api/payment/status instead. */
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
 * Purchase (Telegram distribution): store billing is NOT used.
 * Use the EKQR UPI checkout instead (PaymentService.createEkqrOrder +
 * openCheckoutUrl). This stub never falls back to store billing — it returns
 * instructions with the support contact so callers can show an alert.
 */
export async function purchaseProduct(
  productId: string,
  opts?: { oldPurchaseToken?: string }
): Promise<{ ok: boolean; message: string }> {
  void productId;
  void opts;
  return { ok: false, message: 'Secure UPI payment via EKQR (GPay, PhonePe, Paytm). Please use the Pro / Plus Pay buttons to complete payment via UPI.' };
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

/** No store-managed subscription in Telegram distribution (always null). */
export async function currentSubscriptionToken(): Promise<{ productId: string; purchaseToken: string } | null> {
  return null;
}
/** Restore: server-state restore (EKQR/UPI orders) -> refresh entitlements. No Play dependency. */
export async function restorePurchases(): Promise<{ ok: boolean; message: string; plan: string }> {
    // Server-state restore (never invents premium).
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
