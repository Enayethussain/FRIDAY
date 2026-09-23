// Payment plans — central server-side config (single source of truth).
// Prices/durations come from env so admin can change them without touching
// frontend files. The frontend NEVER sends the amount; create-order reads it
// from here. Amounts are in INR (converted to paise for the provider).
export interface PaymentPlan {
  planId: 'plus' | 'pro';
  name: string;
  amountINR: number;
  currency: 'INR';
  durationDays: number;
  subscriptionStatus: 'PLUS_MONTHLY' | 'PRO_MONTHLY';
}

function num(name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function paymentPlans(): Record<'plus' | 'pro', PaymentPlan> {
  return {
    plus: {
      planId: 'plus',
      name: process.env.PLUS_PLAN_NAME || 'FRIDAY Plus',
      amountINR: num('PLUS_PRICE_INR', 199),
      currency: 'INR',
      durationDays: Math.floor(num('PLUS_DURATION_DAYS', 30)),
      subscriptionStatus: 'PLUS_MONTHLY',
    },
    pro: {
      planId: 'pro',
      name: process.env.PRO_PLAN_NAME || 'FRIDAY Pro',
      amountINR: num('PRO_PRICE_INR', 99),
      currency: 'INR',
      durationDays: Math.floor(num('PRO_DURATION_DAYS', 30)),
      subscriptionStatus: 'PRO_MONTHLY',
    },
  };
}

/** Public plan listing (no secrets). */
export function publicPlans() {
  const p = paymentPlans();
  return (Object.values(p) as PaymentPlan[]).map((x) => ({
    planId: x.planId,
    name: x.name,
    amount: x.amountINR,
    currency: x.currency,
    duration_days: x.durationDays,
  }));
}

export type BillingPeriod = 'monthly' | '3_month' | 'yearly';

export const PERIOD_DAYS: Record<BillingPeriod, number> = {
  monthly: 30,
  '3_month': 90,
  yearly: 365,
};

const DEFAULT_PERIOD_PRICES: Record<'plus' | 'pro', Record<BillingPeriod, number>> = {
  pro: { monthly: 99, '3_month': 249, yearly: 799 },
  plus: { monthly: 199, '3_month': 499, yearly: 1499 },
};

/**
 * Per-period amounts (INR) — single source for checkout pricing.
 * Env override EKQR_PERIOD_PRICES_JSON is validated entry-by-entry against
 * positive finite numbers; invalid entries fall back to defaults.
 */
export function periodPrices(): Record<'plus' | 'pro', Record<BillingPeriod, number>> {
  const out = JSON.parse(JSON.stringify(DEFAULT_PERIOD_PRICES)) as Record<'plus' | 'pro', Record<BillingPeriod, number>>;
  try {
    const raw = JSON.parse(process.env.EKQR_PERIOD_PRICES_JSON || '{}');
    for (const plan of ['plus', 'pro'] as const) {
      const row = (raw as any)?.[plan];
      if (!row || typeof row !== 'object') continue;
      for (const per of ['monthly', '3_month', 'yearly'] as const) {
        const n = Number(row[per]);
        if (Number.isFinite(n) && n > 0) out[plan][per] = Math.round(n);
      }
    }
  } catch { /* env-only; defaults stand */ }
  return out;
}

export function parsePeriod(v: unknown): BillingPeriod | null {
  const t = String(v || '').toLowerCase();
  if (t === 'monthly' || t === '3_month' || t === 'yearly') return t as BillingPeriod;
  return null;
}
