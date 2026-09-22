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
