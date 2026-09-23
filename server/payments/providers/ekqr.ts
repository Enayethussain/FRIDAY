// EkQR-compatible UPI provider (dynamic QR + UPI intent + HMAC webhooks).
//
// Integration basis (verified 2026): EkQR-compatible gateways expose
// "drop-in create_order and check_order_status" with "HMAC callbacks", Bearer
// API keys, per-order dynamic QR / UPI intent links and a hosted pay page.
// The full field reference lives inside each merchant's EKQR console, so
// every integration point here is explicit and configurable:
//
//   EKQR_BASE_URL               e.g. https://api.ekqr.example (REQUIRED)
//   EKQR_API_KEY                Bearer key from merchant console (REQUIRED)
//   EKQR_WEBHOOK_SECRET         HMAC-SHA256 hex secret (REQUIRED for webhooks)
//   EKQR_WEBHOOK_SIGNATURE_HEADER  default: x-ekqr-signature
//   EKQR_AMOUNT_UNIT            paise | inr (default: paise)
//   EKQR_CREATE_PATH            default: /api/create_order (portal.ekqr.in)
//   EKQR_STATUS_PATH            default: /check_order_status
//
// Field names accepted from EKQR are tolerant on READ (documented variants)
// but strict on VERIFY (order id echo + amount match + success state).
// Anything unconfigured or unverifiable fails CLOSED — never grants premium.
import type { PaymentProvider, ProviderOrderResult, ProviderRefundResult, ProviderStatusResult, WebhookEventType } from './types.js';

function env(name: string, fallback = ''): string {
  return (process.env[name] || '').trim() || fallback;
}

function base(): string {
  return env('EKQR_BASE_URL').replace(/\/$/, '');
}

function amountUnit(): 'paise' | 'inr' {
  return env('EKQR_AMOUNT_UNIT', 'paise').toLowerCase() === 'inr' ? 'inr' : 'paise';
}

/** Convert INR rupees to the provider's amount unit. */
export function toProviderAmount(inr: number): number {
  return amountUnit() === 'inr' ? inr : Math.round(inr * 100);
}

/** Convert a provider amount echo back to paise for comparison. */
export function toPaise(providerAmount: number): number {
  const n = Number(providerAmount) || 0;
  return amountUnit() === 'inr' ? Math.round(n * 100) : Math.round(n);
}

async function httpJson(url: string, init: RequestInit, timeoutMs = 20000): Promise<{ status: number; json: any }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

function pick<T>(obj: any, keys: string[]): T | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (v !== undefined && v !== null && v !== '') return v as T;
  }
  return undefined;
}

function normStatus(s: unknown): 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'UNKNOWN' {
  const t = String(s || '').toUpperCase();
  if (t === 'SUCCESS' || t === 'COMPLETED' || t === 'PAID') return 'COMPLETED';
  if (t === 'FAILED' || t === 'FAILURE') return 'FAILED';
  if (t === 'EXPIRED') return 'EXPIRED';
  if (t === 'CANCELLED' || t === 'CANCELED') return 'CANCELLED';
  if (t === 'PENDING' || t === 'CREATED' || t === 'INITIATED') return 'PENDING';
  return 'UNKNOWN';
}

export class EkqrProvider implements PaymentProvider {
  name = 'ekqr';

  isConfigured(): boolean {
    return !!(base() && env('EKQR_API_KEY'));
  }

  private authHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${env('EKQR_API_KEY')}` };
  }

  async createOrder(args: { internalOrderId: string; amountPaise: number; redirectUrl: string; expireAfterSec: number }): Promise<ProviderOrderResult> {
    if (!this.isConfigured()) throw new Error('EKQR not configured (EKQR_BASE_URL / EKQR_API_KEY missing)');
    const amount = amountUnit() === 'inr' ? Math.round(args.amountPaise / 100) : args.amountPaise;
    const url = `${base()}${env('EKQR_CREATE_PATH', '/api/create_order')}`;
    const { status, json } = await httpJson(url, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({
        order_id: args.internalOrderId,
        amount,
        currency: 'INR',
        redirect_url: args.redirectUrl,
        webhook_url: process.env.WEBHOOK_URL || undefined,
        expire_after: args.expireAfterSec,
      }),
    });
    if ((status !== 200 && status !== 201) || !json) {
      // URL has no secret (auth is a Bearer header) — safe to log so the
      // merchant can compare it with the EKQR console API docs on 4xx.
      try { console.error(`[EKQR] create order failed: POST ${url} -> HTTP ${status}`); } catch { /* log-only */ }
      throw new Error(`EKQR create order HTTP ${status}`.slice(0, 200));
    }
    // Echo must match our order id (binds response to request).
    const echoId = String(pick<string>(body, ['order_id', 'orderId', 'merchant_order_id']) || '');
    if (echoId && echoId !== args.internalOrderId) {
      throw new Error('EKQR order id mismatch');
    }
    // Some gateways nest the payload under `data` — unwrap one level.
    const body = (json && typeof json === 'object' && (json as any).data && typeof (json as any).data === 'object')
      ? (json as any).data as Record<string, unknown>
      : json;
    const upiIntent = String(pick<string>(body, ['upi_intent', 'upiIntent', 'upi_link', 'intent_url']) || '');
    const qrCode = String(pick<string>(body, ['qr_code', 'qrCode', 'qr', 'qr_string', 'qrString', 'qr_image', 'qrImage']) || '');
    const payUrl = String(pick<string>(body, ['pay_url', 'payUrl', 'payment_url', 'checkout_url', 'hosted_url', 'payment_link', 'short_url']) || '');
    if (!upiIntent && !qrCode && !payUrl) {
      // Log top-level keys only (no values/secrets) so the merchant can map
      // the real field names from Render logs.
      let keys = '';
      try {
        const top = json && typeof json === 'object' ? Object.keys(json).join(',') : typeof json;
        const dataKeys = body !== json && body && typeof body === 'object' ? Object.keys(body).join(',') : '';
        keys = `${top}${dataKeys ? ` data:[${dataKeys}]` : ''}`;
        console.error(`[EKQR] create order response keys: [${keys}]`);
      } catch { /* log-only */ }
      // Surface the gateway's own message (e.g. "Invalid amount") when present.
      const gwMsg = String(pick<string>(body, ['message', 'msg', 'error', 'reason', 'remark']) || pick<string>(json, ['message', 'msg', 'error']) || '').slice(0, 120);
      throw new Error(
        `EKQR response has no upi_intent / qr_code / pay_url${keys ? ` | keys:[${keys.slice(0, 120)}]` : ''}${gwMsg ? ` | ekqr:${gwMsg}` : ''}`.slice(0, 300)
      );
    }
    return {
      providerOrderId: echoId || args.internalOrderId,
      checkoutUrl: payUrl || upiIntent,
      checkoutExpiresAt: Number(pick<number>(body, ['expires_at', 'expireAt', 'expiresAt']) || 0) || 0,
      state: String(pick<string>(body, ['status', 'state']) || 'PENDING'),
      upiIntent: upiIntent || undefined,
      qrCode: qrCode || undefined,
      payUrl: payUrl || undefined,
    };
  }

  async getPaymentStatus(internalOrderId: string): Promise<ProviderStatusResult> {
    if (!this.isConfigured()) {
      return { state: 'UNKNOWN', amountPaise: 0, providerPaymentId: '', paymentMode: 'UPI', rawCode: 'NOT_CONFIGURED' };
    }
    const url = `${base()}${env('EKQR_STATUS_PATH', '/check_order_status')}?order_id=${encodeURIComponent(internalOrderId)}`;
    const { status, json } = await httpJson(url, { method: 'GET', headers: this.authHeaders() });
    if (status === 404) {
      return { state: 'UNKNOWN', amountPaise: 0, providerPaymentId: '', paymentMode: 'UPI', rawCode: 'NOT_FOUND' };
    }
    if (status !== 200 || !json) {
      return { state: 'UNKNOWN', amountPaise: 0, providerPaymentId: '', paymentMode: 'UPI', rawCode: `HTTP_${status}` };
    }
    const state = normStatus(pick<string>(json, ['status', 'state', 'payment_status']));
    const amountPaise = toPaise(Number(pick<number>(json, ['amount', 'amount_paise', 'amountPaise']) ?? 0));
    const utr = String(pick<string>(json, ['utr', 'utr_number', 'transaction_id', 'txn_id', 'upi_txn_id']) || '');
    if (state === 'COMPLETED') {
      return { state: 'COMPLETED', amountPaise, providerPaymentId: utr, paymentMode: 'UPI', rawCode: 'COMPLETED' };
    }
    if (state === 'FAILED' || state === 'EXPIRED' || state === 'CANCELLED') {
      return { state, amountPaise, providerPaymentId: utr, paymentMode: 'UPI', rawCode: state };
    }
    return { state: 'PENDING', amountPaise, providerPaymentId: '', paymentMode: 'UPI', rawCode: state };
  }

  /**
   * HMAC-SHA256 (hex) over the raw body with EKQR_WEBHOOK_SECRET, compared
   * against EKQR_WEBHOOK_SIGNATURE_HEADER (default x-ekqr-signature).
   * Body is a NOTIFICATION ONLY — the order status API is always re-queried.
   */
  async verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<{
    ok: boolean; eventType: WebhookEventType; providerOrderId: string; providerPaymentId: string; amountPaise: number;
  } | null> {
    const secret = env('EKQR_WEBHOOK_SECRET');
    if (!secret) return null; // cannot authenticate callbacks: refuse
    const headerName = env('EKQR_WEBHOOK_SIGNATURE_HEADER', 'x-ekqr-signature').toLowerCase();
    const got = String(headers[headerName] || '');
    if (!got) return null;
    let expected = '';
    try {
      const { createHmac } = await import('node:crypto');
      expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    } catch {
      return null;
    }
    if (got.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
    let body: any = null;
    try { body = JSON.parse(rawBody); } catch { return null; }
    const event = String(body?.event || body?.event_type || '').toLowerCase();
    const orderId = String(pick<string>(body, ['order_id', 'orderId', 'merchant_order_id']) || '');
    const utr = String(pick<string>(body, ['utr', 'utr_number', 'transaction_id', 'txn_id']) || '');
    const amountPaise = toPaise(Number(pick<number>(body, ['amount', 'amount_paise', 'amountPaise']) ?? 0));
    let eventType: WebhookEventType = 'unknown';
    if (event.includes('success') || event.includes('completed') || event.includes('paid')) eventType = 'checkout.order.completed';
    else if (event.includes('fail')) eventType = 'checkout.order.failed';
    else if (event.includes('refund')) eventType = 'pg.refund.completed';
    if (!orderId) return null;
    return { ok: true, eventType, providerOrderId: orderId, providerPaymentId: utr, amountPaise };
  }

  async refund(_args: { internalRefundId: string; internalOrderId: string; amountPaise: number }): Promise<ProviderRefundResult> {
    // EKQR refund API is not part of the confirmed integration surface.
    // Refuse honestly instead of faking a refund.
    throw new Error('EKQR refunds are manual via the EKQR merchant console (no refund API configured)');
  }

  async getRefundStatus(_internalRefundId: string): Promise<{ state: 'PENDING' | 'COMPLETED' | 'FAILED' }> {
    return { state: 'PENDING' };
  }
}
