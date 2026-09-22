// PaymentService — UPI web checkout front-end. Collects nothing secret:
// plan IDs and order IDs only. Amounts, verification and activation are all
// backend jobs. Success is NEVER decided here — only backend order status.
import { apiUrl } from '../lib/serverUrl';

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

export async function createOrder(planId: 'plus' | 'pro'): Promise<CreatedOrder> {
  const { status, json } = await postJson(
    apiUrl('/api/payment/create-order'),
    { planId, device_id: deviceId() },
    25000
  );
  if (status === 501 || json?.code === 'PAYMENTS_NOT_CONFIGURED') {
    throw new Error('Web payments are not active yet.');
  }
  if (!json?.success || !json?.checkoutUrl || !json?.orderId) {
    throw new Error(String(json?.error || 'Payment order create nahi ho paya. Dobara try karo.'));
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
