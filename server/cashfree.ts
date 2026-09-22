// Cashfree preparation (server-side ONLY — never in browser code).
// Flow: FRIDAY Web -> FRIDAY Backend -> Cashfree -> payment ->
// Cashfree webhook -> backend verification -> entitlement update.
// Nothing is granted until the webhook signature verifies AND the payment is
// confirmed PAID via Cashfree order status. Without CASHFREE_* env config,
// every endpoint honestly reports unavailability (no fake payments).
import express from 'express';
import { createHash, createHmac } from 'node:crypto';

const CASHFREE_BASE = (process.env.CASHFREE_BASE_URL || 'https://sandbox.cashfree.com/pg').replace(/\/$/, '');

function cashfreeConfigured(): boolean {
  return !!(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);
}

async function cfFetch(path: string, method: string, body: unknown, timeoutMs = 15000): Promise<{ status: number; json: any }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${CASHFREE_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': process.env.CASHFREE_APP_ID || '',
        'x-client-secret': process.env.CASHFREE_SECRET_KEY || '',
        'x-api-version': '2023-08-01',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

/** Verify Cashfree webhook signature (HMAC-SHA256 of raw body). */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.CASHFREE_WEBHOOK_SECRET || '';
  if (!secret || !signature) return false;
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
    return expected.length === signature.length &&
      Buffer.from(expected).equals(Buffer.from(signature));
  } catch {
    return false;
  }
}

export function createCashfreeRouter(deps: {
  productById: (productId: string) => { productId: string; plan: string; status: string; period: string; intendedPriceINR: number } | null;
  applyVerifiedOrder: (args: {
    deviceKey: string; productId: string; status: string; expiryAt: number;
    orderId: string; verificationSource: string;
  }) => { plan: string };
  log: (msg: string) => void;
  logError: (msg: string) => void;
}): express.Router {
  const { productById, applyVerifiedOrder, log, logError } = deps;
  const r = express.Router();

  // POST /api/v1/billing/cashfree/order { device_id, product_id }
  // Creates a Cashfree order and returns the payment session id for checkout.
  r.post('/cashfree/order', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      if (!cashfreeConfigured()) {
        res.status(501).json({ success: false, code: 'CASHFREE_NOT_CONFIGURED', error: 'Web payments are not active yet.' });
        return;
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const productId = String(body.product_id ?? body.productId ?? '').trim();
      const deviceId = String(body.device_id ?? body.deviceId ?? '').slice(0, 128);
      const catalog = productById(productId);
      if (!catalog || !deviceId) {
        res.status(400).json({ success: false, code: 'INVALID_PRODUCT', error: 'Ye product available nahi hai.' });
        return;
      }
      const orderId = `friday_${Date.now()}_${createHash('sha256').update(deviceId + productId).digest('hex').slice(0, 12)}`;
      const { status, json } = await cfFetch('/orders', 'POST', {
        order_id: orderId,
        order_amount: catalog.intendedPriceINR,
        order_currency: 'INR',
        customer_details: { customer_id: deviceId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'friday-web' },
        order_meta: { product_id: productId },
      });
      if (status !== 200 && status !== 201) {
        logError(`cashfree order failed HTTP ${status}`);
        res.status(502).json({ success: false, code: 'ORDER_FAILED', error: 'Payment order create nahi ho paya. Dobara try karo.' });
        return;
      }
      log(`cashfree order created ${orderId}`);
      res.json({ success: true, order_id: orderId, payment_session_id: json?.payment_session_id || '' });
    } catch (e: any) {
      logError(`cashfree order exception: ${String(e?.message || e).slice(0, 200)}`);
      res.status(500).json({ success: false, code: 'SERVER_ERROR', error: 'Payment order create nahi ho paya.' });
    }
  });

  // POST /api/v1/billing/cashfree/webhook (raw body for signature check)
  r.post('/cashfree/webhook', express.raw({ type: '*/*', limit: '64kb' }), async (req, res) => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
      const sig = String(req.headers['x-webhook-signature'] || req.headers['x-cf-signature'] || '');
      if (!verifyWebhookSignature(raw, sig)) {
        logError('cashfree webhook: bad signature');
        res.status(401).json({ success: false, code: 'BAD_SIGNATURE' });
        return;
      }
      const evt = JSON.parse(raw) as Record<string, any>;
      const data = evt?.data || {};
      const order = data?.order || {};
      const payment = data?.payment || {};
      const orderId = String(order?.order_id || '');
      const productId = String(order?.order_meta?.product_id || data?.order_meta?.product_id || '');
      const paid = String(payment?.payment_status || '').toUpperCase() === 'SUCCESS';
      const catalog = productById(productId);
      if (!orderId || !catalog) {
        res.status(400).json({ success: false, code: 'INVALID_ORDER' });
        return;
      }
      // Confirm PAID status directly with Cashfree (never trust the event alone).
      const { status, json } = await cfFetch(`/orders/${encodeURIComponent(orderId)}/payments`, 'GET', undefined);
      const confirmed = status === 200 && Array.isArray(json) &&
        json.some((p: any) => String(p?.payment_status || '').toUpperCase() === 'SUCCESS');
      if (!paid || !confirmed) {
        res.json({ success: true, verified: false, message: 'Payment not confirmed.' });
        return;
      }
      // Derive device key from the order's customer id when possible.
      const customerId = String(order?.customer_details?.customer_id || '');
      const deviceKey = customerId.startsWith('device:') ? customerId : `web:${customerId || orderId}`;
      // Term of sale (not a renewal): the purchased period defines access.
      const termDays = catalog.period === 'YEARLY' ? 365 : catalog.period === '3_MONTH' ? 90 : 30;
      const { plan } = applyVerifiedOrder({
        deviceKey,
        productId: catalog.productId,
        status: catalog.status,
        expiryAt: Date.now() + termDays * 86400000,
        orderId,
        verificationSource: 'cashfree-webhook',
      });
      log(`cashfree webhook verified ${orderId} plan=${plan}`);
      res.json({ success: true, verified: true, plan });
    } catch (e: any) {
      logError(`cashfree webhook exception: ${String(e?.message || e).slice(0, 200)}`);
      res.status(500).json({ success: false, code: 'SERVER_ERROR' });
    }
  });

  return r;
}
