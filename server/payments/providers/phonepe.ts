// PhonePe Standard Checkout v2 provider (real REST, verified against
// developer.phonepe.com docs). Auth is OAuth client-credentials
// (O-Bearer), never salt-in-APK. All credentials are server env only.
// UPI intent + UPI QR are enabled on checkout; the pay page adapts to
// mobile (UPI apps) and desktop (dynamic QR) by itself.
import type { PaymentProvider, ProviderOrderResult, ProviderRefundResult, ProviderStatusResult, WebhookEventType } from './types.js';

function base(): string {
  const env = (process.env.PAYMENT_ENV || 'sandbox').toLowerCase();
  return env === 'production' || env === 'prod'
    ? 'https://api.phonepe.com/apis/pg'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
}

function cfg() {
  return {
    merchantId: (process.env.PAYMENT_MERCHANT_ID || '').trim(),
    clientId: (process.env.PAYMENT_CLIENT_ID || '').trim(),
    clientSecret: (process.env.PAYMENT_CLIENT_SECRET || '').trim(),
    clientVersion: (process.env.PAYMENT_CLIENT_VERSION || '1').trim(),
  };
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

export function buildAuthTokenRequest(c: { clientId: string; clientVersion: string; clientSecret: string }): { url: string; body: string } {
  return {
    url: `${base()}/v1/oauth/token`,
    body: `client_id=${encodeURIComponent(c.clientId)}&client_version=${encodeURIComponent(c.clientVersion)}&client_secret=${encodeURIComponent(c.clientSecret)}&grant_type=client_credentials`,
  };
}

export function buildPayRequest(args: {
  merchantOrderId: string; amountPaise: number; redirectUrl: string; expireAfterSec: number; message: string;
}): { url: string; body: Record<string, unknown> } {
  return {
    url: `${base()}/checkout/v2/pay`,
    body: {
      merchantOrderId: args.merchantOrderId,
      amount: args.amountPaise,
      expireAfter: args.expireAfterSec,
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: args.message,
        merchantUrls: { redirectUrl: args.redirectUrl },
        paymentModeConfig: {
          enabledPaymentModes: [{ type: 'UPI_INTENT' }, { type: 'UPI_QR' }],
        },
      },
    },
  };
}

export class PhonePeProvider implements PaymentProvider {
  name = 'phonepe';
  private token = '';
  private tokenExpiresAt = 0;

  isConfigured(): boolean {
    const c = cfg();
    return !!(c.merchantId && c.clientId && c.clientSecret);
  }

  private async bearer(): Promise<string> {
    const now = Date.now();
    if (this.token && now < this.tokenExpiresAt - 60000) return this.token;
    const c = cfg();
    if (!c.clientId || !c.clientSecret) throw new Error('PhonePe credentials not configured');
    const req = buildAuthTokenRequest(c);
    const { status, json } = await httpJson(req.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: req.body,
    });
    if (status !== 200 || !json) throw new Error(`PhonePe auth HTTP ${status}`);
    const token = String(json.access_token || json.accessToken || json.encryptedAccessToken || json.token || '');
    if (!token) throw new Error('PhonePe auth: no token in response');
    const expiresIn = Number(json.expires_in || json.expiresIn || 3600) || 3600;
    this.token = token;
    this.tokenExpiresAt = now + expiresIn * 1000;
    return token;
  }

  async createOrder(args: { internalOrderId: string; amountPaise: number; redirectUrl: string; expireAfterSec: number }): Promise<ProviderOrderResult> {
    const token = await this.bearer();
    const req = buildPayRequest({
      merchantOrderId: args.internalOrderId,
      amountPaise: args.amountPaise,
      redirectUrl: args.redirectUrl,
      expireAfterSec: args.expireAfterSec,
      message: 'FRIDAY subscription payment',
    });
    const { status, json } = await httpJson(req.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `O-Bearer ${token}` },
      body: JSON.stringify(req.body),
    });
    if ((status !== 200 && status !== 201) || !json?.redirectUrl) {
      throw new Error(`PhonePe pay HTTP ${status}: ${String(json?.message || json?.code || 'no redirect')}`.slice(0, 200));
    }
    return {
      providerOrderId: String(json.orderId || args.internalOrderId),
      checkoutUrl: String(json.redirectUrl),
      checkoutExpiresAt: Number(json.expireAt || 0) || 0,
      state: String(json.state || 'PENDING'),
    };
  }

  async getPaymentStatus(internalOrderId: string): Promise<ProviderStatusResult> {
    const token = await this.bearer();
    const { status, json } = await httpJson(
      `${base()}/checkout/v2/order/${encodeURIComponent(internalOrderId)}/status?details=true`,
      { method: 'GET', headers: { 'Content-Type': 'application/json', Authorization: `O-Bearer ${token}` } }
    );
    if (status === 404) {
      return { state: 'UNKNOWN', amountPaise: 0, providerPaymentId: '', paymentMode: '', rawCode: 'NOT_FOUND' };
    }
    if (status !== 200 || !json) {
      return { state: 'UNKNOWN', amountPaise: 0, providerPaymentId: '', paymentMode: '', rawCode: `HTTP_${status}` };
    }
    const state = String(json.state || '').toUpperCase();
    const attempts = Array.isArray(json.paymentDetails) ? json.paymentDetails : [];
    const done = attempts.find((a: any) => String(a?.state || '').toUpperCase() === 'COMPLETED') || attempts[attempts.length - 1] || {};
    const amountPaise = Number(json.amount ?? done.amount ?? 0) || 0;
    if (state === 'COMPLETED') {
      return { state: 'COMPLETED', amountPaise, providerPaymentId: String(done.transactionId || ''), paymentMode: String(done.paymentMode || ''), rawCode: 'COMPLETED' };
    }
    if (state === 'FAILED') {
      return { state: 'FAILED', amountPaise, providerPaymentId: String(done.transactionId || ''), paymentMode: String(done.paymentMode || ''), rawCode: String(json.errorCode || done.state || 'FAILED') };
    }
    return { state: 'PENDING', amountPaise, providerPaymentId: '', paymentMode: '', rawCode: state || 'PENDING' };
  }

  /**
   * Callback verification: the callback URL is protected by Basic auth
   * (PAYMENT_CALLBACK_USERNAME/PASSWORD configured in PhonePe dashboard).
   * The body is treated as a NOTIFICATION ONLY — the order status API is
   * always re-queried as the source of truth (documented mandatory practice).
   */
  async verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<{
    ok: boolean; eventType: WebhookEventType; providerOrderId: string; providerPaymentId: string; amountPaise: number;
  } | null> {
    const user = (process.env.PAYMENT_CALLBACK_USERNAME || '').trim();
    const pass = (process.env.PAYMENT_CALLBACK_PASSWORD || '').trim();
    if (!user || !pass) return null; // cannot authenticate callbacks: refuse
    const auth = String(headers.authorization || '');
    const expected = 'Basic ' + Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
    if (auth.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < auth.length; i++) diff |= auth.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
    let body: any = null;
    try { body = JSON.parse(rawBody); } catch { return null; }
    const event = String(body?.event || '').toLowerCase();
    const payload = body?.payload || {};
    const providerOrderId = String(payload.merchantOrderId || payload.merchant_order_id || '');
    const providerPaymentId = String(payload.transactionId || payload.transaction_id || '');
    const amountPaise = Number(payload.amount ?? 0) || 0;
    let eventType: WebhookEventType = 'unknown';
    if (event.includes('completed') && event.includes('refund')) eventType = 'pg.refund.completed';
    else if (event.includes('failed') && event.includes('refund')) eventType = 'pg.refund.failed';
    else if (event.includes('completed')) eventType = 'checkout.order.completed';
    else if (event.includes('failed')) eventType = 'checkout.order.failed';
    if (!providerOrderId) return null;
    return { ok: true, eventType, providerOrderId, providerPaymentId, amountPaise };
  }

  async refund(args: { internalRefundId: string; internalOrderId: string; amountPaise: number }): Promise<ProviderRefundResult> {
    const token = await this.bearer();
    const { status, json } = await httpJson(`${base()}/payments/v2/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `O-Bearer ${token}` },
      body: JSON.stringify({
        merchantRefundId: args.internalRefundId,
        originalMerchantOrderId: args.internalOrderId,
        amount: args.amountPaise,
      }),
    });
    if ((status !== 200 && status !== 201) || !json?.refundId) {
      throw new Error(`PhonePe refund HTTP ${status}: ${String(json?.message || 'failed')}`.slice(0, 200));
    }
    const st = String(json.state || 'PENDING').toUpperCase();
    return {
      providerRefundId: String(json.refundId),
      amountPaise: Number(json.amount ?? args.amountPaise) || args.amountPaise,
      state: st === 'COMPLETED' ? 'COMPLETED' : st === 'FAILED' ? 'FAILED' : 'PENDING',
    };
  }

  async getRefundStatus(internalRefundId: string): Promise<{ state: 'PENDING' | 'COMPLETED' | 'FAILED' }> {
    const token = await this.bearer();
    const { status, json } = await httpJson(`${base()}/payments/v2/refund/${encodeURIComponent(internalRefundId)}/status`, {
      method: 'GET', headers: { 'Content-Type': 'application/json', Authorization: `O-Bearer ${token}` },
    });
    if (status !== 200 || !json) return { state: 'PENDING' };
    const st = String(json.state || 'PENDING').toUpperCase();
    return { state: st === 'COMPLETED' ? 'COMPLETED' : st === 'FAILED' ? 'FAILED' : 'PENDING' };
  }
}
