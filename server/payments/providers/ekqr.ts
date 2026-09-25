// EkQR-compatible UPI provider (portal.ekqr.in API Documentation).
//
//   EKQR_BASE_URL               e.g. https://api.ekqr.in (REQUIRED)
//   EKQR_API_KEY                sent as `key` in every JSON body (REQUIRED)
//   EKQR_WEBHOOK_SECRET         HMAC-SHA256 hex secret (REQUIRED for webhooks)
//   EKQR_WEBHOOK_SIGNATURE_HEADER  default: x-ekqr-signature
//   EKQR_AMOUNT_UNIT            inr (default, per docs "100" = Rs 100) | paise
//   EKQR_CREATE_PATH            default: /api/create_order
//   EKQR_STATUS_PATH            default: /api/check_order_status
//
// Docs: POST {key, client_txn_id, amount, p_info, customer_*, redirect_url}
// -> {status:true, msg, data:{order_id, payment_url, upi_intent, bhim_link}}.
// Amount is RUPEES (string) per docs example.
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
  return env('EKQR_AMOUNT_UNIT', 'inr').toLowerCase() === 'paise' ? 'paise' : 'inr';
}

/** Docs amount is RUPEES (string "100"). paise mode kept for override only. */
function docsAmount(amountPaise: number): string | number {
  if (amountUnit() === 'inr') return String(Math.round(amountPaise / 100));
  return Math.round(amountPaise);
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

/**
 * Docs show upi_intent as an OBJECT (per-app deep links) and bhim_link as a
 * plain upi:// string. Accept a string directly; otherwise scan the object
 * for the first upi:// (or http) string value.
 */
function firstIntentString(body: any): string {
  const direct = pick<string>(body, ['upi_intent', 'upiIntent', 'upi_link', 'intent_url', 'bhim_link', 'bhimLink']);
  if (typeof direct === 'string' && direct) return direct;
  const containers = [direct, pick<unknown>(body, ['upi_intent', 'upiIntent'])];
  for (const c of containers) {
    if (c && typeof c === 'object') {
      for (const v of Object.values(c as Record<string, unknown>)) {
        if (typeof v === 'string' && /^(upi:\/\/|https?:\/\/)/i.test(v)) return v;
      }
    }
  }
  return '';
}

export class EkqrProvider implements PaymentProvider {
  name = 'ekqr';

  isConfigured(): boolean {
    return !!(base() && env('EKQR_API_KEY'));
  }

  private authHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${env('EKQR_API_KEY')}` };
  }

  async createOrder(args: { internalOrderId: string; amountPaise: number; redirectUrl: string; expireAfterSec: number; planLabel?: string; customer?: { name: string; mobile: string; email?: string }; udf1?: string }): Promise<ProviderOrderResult> {
    if (!this.isConfigured()) throw new Error('EKQR not configured (EKQR_BASE_URL / EKQR_API_KEY missing)');
    const url = `${base()}${env('EKQR_CREATE_PATH', '/api/create_order')}`;
    // Per portal.ekqr.in docs: auth `key` lives IN the JSON body.
    // (Bearer header kept harmlessly; the gateway reads `key`.)
    const { status, json } = await httpJson(url, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({
        key: env('EKQR_API_KEY'),
        client_txn_id: args.internalOrderId,
        amount: docsAmount(args.amountPaise),
        p_info: (args.planLabel || 'FRIDAY plan').slice(0, 60),
        customer_name: args.customer?.name || undefined,
        customer_mobile: args.customer?.mobile || undefined,
        customer_email: args.customer?.email || undefined,
        redirect_url: args.redirectUrl,
        // Gateway passthrough: Telegram chatId returns verbatim in webhook.
        udf1: args.udf1 ? String(args.udf1).slice(0, 25) : undefined,
      }),
    });
    if ((status !== 200 && status !== 201) || !json) {
      // URL has no secret (key is in body, not URL) — safe to log so the
      // merchant can compare it with the EKQR console API docs on 4xx.
      try { console.error(`[EKQR] create order failed: POST ${url} -> HTTP ${status}`); } catch { /* log-only */ }
      throw new Error(`EKQR create order HTTP ${status}`.slice(0, 200));
    }
    // Docs envelope: {status:true, msg, data:{...}}. Unwrap one level.
    const body = (json && typeof json === 'object' && (json as any).data && typeof (json as any).data === 'object')
      ? (json as any).data as Record<string, unknown>
      : json;
    // Gateway-level refusal (HTTP 200 + status:false) — surface its message.
    const okFlag = (json as any)?.status;
    if (okFlag === false) {
      const gwMsg = String((json as any)?.msg || (json as any)?.message || 'order rejected').slice(0, 160);
      throw new Error(`EKQR order rejected: ${gwMsg}`.slice(0, 200));
    }
    // Echo: docs return EkQR's numeric order_id AND our client_txn_id.
    // Only the client_txn_id echo binds the response to our request.
    const echoTxn = String(pick<string>(body, ['client_txn_id', 'clientTxnId']) || pick<string>(json, ['client_txn_id']) || '');
    if (echoTxn && echoTxn !== args.internalOrderId) {
      throw new Error('EKQR order id mismatch');
    }
    const upiIntent = firstIntentString(body);
    const qrCode = String(pick<string>(body, ['qr_code', 'qrCode', 'qr', 'qr_string', 'qrString', 'qr_image', 'qrImage']) || '');
    const payUrl = String(pick<string>(body, ['payment_url', 'pay_url', 'payUrl', 'checkout_url', 'hosted_url', 'payment_link', 'short_url']) || '');
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
    // Docs: data.order_id is EkQR's numeric id; client_txn_id echo is ours.
    const providerOrderId = String(pick<string>(body, ['order_id', 'orderId']) || '') || echoTxn || args.internalOrderId;
    return {
      providerOrderId,
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
    // Per portal.ekqr.in docs: POST {key, client_txn_id, txn_date DD-MM-YYYY}.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const txnDate = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
    const url = `${base()}${env('EKQR_STATUS_PATH', '/api/check_order_status')}`;
    const { status, json } = await httpJson(url, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ key: env('EKQR_API_KEY'), client_txn_id: internalOrderId, txn_date: txnDate }),
    });
    if (status === 404) {
      return { state: 'UNKNOWN', amountPaise: 0, providerPaymentId: '', paymentMode: 'UPI', rawCode: 'NOT_FOUND' };
    }
    if (status !== 200 || !json) {
      return { state: 'UNKNOWN', amountPaise: 0, providerPaymentId: '', paymentMode: 'UPI', rawCode: `HTTP_${status}` };
    }
    const body = (json && typeof json === 'object' && (json as any).data && typeof (json as any).data === 'object')
      ? (json as any).data as Record<string, unknown>
      : json;
    const state = normStatus(
      pick<string>(body, ['status', 'state', 'payment_status', 'txn_status', 'order_status'])
      ?? ((json as any)?.status === true ? 'PENDING' : undefined)
    );
    const amountPaise = toPaise(Number(pick<number>(body, ['amount', 'amount_paise', 'amountPaise']) ?? 0));
    const utr = String(pick<string>(body, ['utr', 'utr_number', 'transaction_id', 'txn_id', 'upi_txn_id', 'rrn', 'upi_ref']) || '');
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
