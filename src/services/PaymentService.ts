// PaymentService — UPI web checkout front-end. Collects nothing secret:
// plan IDs and order IDs only. Amounts, verification and activation are all
// backend jobs. Success is NEVER decided here — only backend order status.
import { apiUrl } from '../lib/serverUrl';

export interface PayerCustomer {
  name: string;
  mobile: string;
  email?: string;
}

/** Saved UPI payer details (name/mobile reused across checkouts). */
export function loadPayer(): PayerCustomer {
  try {
    return {
      name: localStorage.getItem('friday_payer_name') || '',
      mobile: localStorage.getItem('friday_payer_mobile') || '',
      email: localStorage.getItem('friday_payer_email') || '',
    };
  } catch {
    return { name: '', mobile: '', email: '' };
  }
}

export function savePayer(p: PayerCustomer): void {
  try {
    localStorage.setItem('friday_payer_name', p.name);
    localStorage.setItem('friday_payer_mobile', p.mobile);
    localStorage.setItem('friday_payer_email', p.email || '');
  } catch { /* best-effort */ }
}

/** Name required, 10-digit mobile required (EkQR mandates both). */
export function validatePayer(p: PayerCustomer): string | null {
  if (!p.name.trim()) return 'Apna naam likho (EkQR customer name required).';
  const digits = p.mobile.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(digits)) return 'Sahi 10-digit mobile number dalo (UPI receipt ke liye).';
  if (p.email && p.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) {
    return 'Email sahi likho ya khaali chhodo.';
  }
  return null;
}

export function normMobile(mobile: string): string {
  return mobile.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
}

export interface PayPlan {
  planId: 'plus' | 'pro';
  name: string;
  amount: number;
  currency: string;
  duration_days: number;
}

export interface CreatedOrder {
  orderId: string;
  checkoutUrl: string;
  amount: number;
  currency: string;
  planId: string;
  expiresAt: number;
}

export type OrderQueryStatus = 'created' | 'pending' | 'success' | 'failed' | 'cancelled' | 'expired';

export interface OrderHistoryItem {
  orderId: string;
  planId: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: number;
  expiresAt: number;
}

function deviceId(): string {
  try {
    let id = localStorage.getItem('friday_device_id') || '';
    if (!id) {
      id = `web-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem('friday_device_id', id);
    }
    return id;
  } catch {
    return 'web-unknown';
  }
}

async function postJson(url: string, body: unknown, timeoutMs: number): Promise<{ status: number; json: any }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

export async function getPaymentPlans(): Promise<{ configured: boolean; provider: string; plans: PayPlan[] }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(apiUrl('/api/payment/plans'), { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json().catch(() => null);
    return {
      configured: !!j?.configured,
      provider: String(j?.provider || ''),
      plans: Array.isArray(j?.plans) ? j.plans : [],
    };
  } catch {
    return { configured: false, provider: '', plans: [] };
  }
}

export async function createOrder(planId: 'plus' | 'pro', customer?: PayerCustomer): Promise<CreatedOrder> {
  const { status, json } = await postJson(
    apiUrl('/api/payment/create-order'),
    {
      planId,
      device_id: deviceId(),
      customer_name: customer?.name || undefined,
      customer_mobile: customer ? normMobile(customer.mobile) : undefined,
      customer_email: customer?.email?.trim() || undefined,
    },
    25000
  );
  if (status === 501 || json?.code === 'PAYMENTS_NOT_CONFIGURED') {
    throw new Error('Secure UPI payment via EKQR (GPay, PhonePe, Paytm) abhi active nahi hai. Dobara try karo ya support se sampark karo.');
  }
  if (!json?.success || !json?.checkoutUrl || !json?.orderId) {
    throw new Error(String(json?.error || 'Payment order create nahi ho paya.'));
  }
  return {
    orderId: String(json.orderId),
    checkoutUrl: String(json.checkoutUrl),
    amount: Number(json.amount) || 0,
    currency: String(json.currency || 'INR'),
    planId: String(json.planId || planId),
    expiresAt: Number(json.expiresAt || 0) || 0,
  };
}

export async function getOrderStatus(orderId: string): Promise<{ status: OrderQueryStatus; planId: string; amount: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(
      apiUrl(`/api/payment/status?orderId=${encodeURIComponent(orderId)}&device_id=${encodeURIComponent(deviceId())}`),
      { signal: ctrl.signal }
    );
    const j = await res.json().catch(() => null);
    if (!j?.success) throw new Error(String(j?.error || 'Status check nahi ho paya.'));
    return { status: j.status as OrderQueryStatus, planId: String(j.planId || ''), amount: Number(j.amount || 0) || 0 };
  } finally {
    clearTimeout(t);
  }
}

const TERMINAL: OrderQueryStatus[] = ['success', 'failed', 'cancelled', 'expired'];

/** Polls until a terminal state or timeout. Never invents success. */
export async function pollOrderStatus(
  orderId: string,
  opts?: { timeoutMs?: number; intervalMs?: number; onTick?: (s: OrderQueryStatus) => void; signal?: AbortSignal }
): Promise<OrderQueryStatus> {
  const timeoutMs = opts?.timeoutMs ?? 180000;
  const intervalMs = opts?.intervalMs ?? 3000;
  const started = Date.now();
  let last: OrderQueryStatus = 'pending';
  while (Date.now() - started < timeoutMs) {
    if (opts?.signal?.aborted) return last;
    try {
      const r = await getOrderStatus(orderId);
      last = r.status;
      opts?.onTick?.(last);
      if (TERMINAL.includes(last)) return last;
    } catch {
      // Transient: keep polling until timeout, then report honestly.
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    if (opts?.signal?.aborted) return last;
  }
  return last;
}

export async function getMyOrders(): Promise<OrderHistoryItem[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(apiUrl(`/api/payment/orders?device_id=${encodeURIComponent(deviceId())}`), { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return [];
    const j = await res.json().catch(() => null);
    return Array.isArray(j?.orders) ? j.orders : [];
  } catch {
    return [];
  }
}

export function formatINR(amount: number): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `₹${amount}`;
  }
}

export type BillingPeriod = 'monthly' | '3_month' | 'yearly';

export interface PayPlanPrice {
  planId: 'plus' | 'pro';
  period: BillingPeriod;
  amount: number;
  days: number;
}

export interface PayPlansResult {
  configured: boolean;
  provider: string;
  periods: { period: BillingPeriod; days: number }[];
  prices: Record<'plus' | 'pro', Record<BillingPeriod, number>>;
}

/** Server period table (single source for checkout pricing). */
export async function getPayPlans(): Promise<PayPlansResult | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(apiUrl('/api/payment/plans'), { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    if (!j || !j.success || !j.prices) return null;
    return {
      configured: !!j.configured,
      provider: String(j.provider || ''),
      periods: Array.isArray(j.periods) ? j.periods : [],
      prices: j.prices,
    };
  } catch {
    return null;
  }
}

export interface EkqrOrder {
  orderId: string;
  checkoutUrl: string;
  upiIntent?: string;
  qrCode?: string;
  payUrl?: string;
  amount: number;
  currency: string;
  planId: string;
  period: string;
  expiresAt: number;
}

/** Creates an EKQR order server-side. Amount comes from the server table. */
export async function createEkqrOrder(planId: 'plus' | 'pro', period: BillingPeriod, customer?: PayerCustomer): Promise<EkqrOrder> {
  const { status, json } = await postJson(
    apiUrl('/api/payment/create-order'),
    {
      planId,
      period,
      device_id: deviceId(),
      customer_name: customer?.name || undefined,
      customer_mobile: customer ? normMobile(customer.mobile) : undefined,
      customer_email: customer?.email?.trim() || undefined,
    },
    25000
  );
  if (status === 501 || json?.code === 'PAYMENTS_NOT_CONFIGURED') {
    throw new Error('Secure UPI payment via EKQR (GPay, PhonePe, Paytm) abhi active nahi hai. Dobara try karo ya support se sampark karo.');
  }
  if (!json?.success || !json?.orderId) {
    throw new Error(String(json?.error || 'Payment order create nahi ho paya.'));
  }
  const checkoutUrl = String(json.checkoutUrl || json.pay_url || json.upi_intent || '');
  if (!checkoutUrl) throw new Error('Payment link nahi mila. Dobara try karo.');
  return {
    orderId: String(json.orderId),
    checkoutUrl,
    upiIntent: json.upi_intent ? String(json.upi_intent) : undefined,
    qrCode: json.qr_code ? String(json.qr_code) : undefined,
    payUrl: json.pay_url ? String(json.pay_url) : undefined,
    amount: Number(json.amount) || 0,
    currency: String(json.currency || 'INR'),
    planId: String(json.planId || planId),
    period: String((json as any).period || period),
    expiresAt: Number(json.expiresAt || 0) || 0,
  };
}

/**
 * Opens the EKQR payment URL the right way: upi:// deep-links must use
 * location navigation (window.open drops custom schemes); https pay pages
 * open in a new tab on desktop.
 */
export function openCheckoutUrl(url: string): void {
  if (/^upi:\/\//i.test(url)) {
    window.location.href = url;
  } else {
    window.open(url, '_blank', 'noopener');
  }
}
