// Payment API: POST /api/payment/create-order, GET /api/payment/status,
// POST /api/payment/webhook, GET /api/payment/orders, GET /api/payment/plans,
// POST /api/payment/refund (admin), GET /api/payment/admin/orders (admin).
// Server-side only. Plan/amount always come from server plans; the frontend
// amount is never trusted. Plans activate ONLY from verified provider state.
import express from 'express';
import { paymentPlans, publicPlans, periodPrices, parsePeriod, PERIOD_DAYS, type BillingPeriod } from './plans.js';
import type { FridayStore } from '../store.js';
import type { PaymentOrder, PaymentProvider } from './types.js';

const ORDER_TTL_MS = 20 * 60 * 1000;
const RECONCILE_MIN_MS = 30 * 1000;

function clientIp(req: express.Request): string {
  const fwd = String(req.headers['x-forwarded-for'] || '');
  return (fwd.split(',')[0] || '').trim() || req.ip || 'unknown';
}

function userKey(req: express.Request, deviceId: unknown): string {
  const q = req.query as Record<string, unknown>;
  const raw = String(deviceId ?? q.device_id ?? q.deviceId ?? '').slice(0, 128);
  if (raw) return `device:${raw}`;
  return `anon:${clientIp(req)}`;
}

function cleanStr(v: unknown, max: number): string {
  return String(v ?? '').slice(0, max);
}

function publicOrder(o: PaymentOrder) {
  return {
    orderId: o.orderId, planId: o.planId, amount: o.amount, currency: o.currency,
    status: o.status, createdAt: o.createdAt, expiresAt: o.expiresAt,
  };
}

function newOrderId(): string {
  return `frd_ord_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function newRefundId(): string {
  return `frd_rfd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export interface WebhookDeps {
  store: FridayStore;
  provider: PaymentProvider;
  redact: (s: string) => string;
  log: (msg: string) => void;
  logError: (msg: string) => void;
}

/**
 * Shared webhook handler (single implementation for /api/payment/webhook,
 * /api/payment-webhook and /api/ekqr-webhook). Raw body, provider
 * authentication, idempotent event keys, re-query before touching
 * entitlements, user data never deleted.
 */
export function createWebhookHandler(deps: WebhookDeps) {
  const { store, provider, redact, logError } = deps;
  // Per-IP rate limit buckets local to webhook traffic.
  const buckets = new Map<string, { count: number; windowStart: number }>();
  return async (req: express.Request, res: express.Response) => {
    try {
      const ip = clientIp(req);
      const k = `webhook:${ip}`;
      const now = Date.now();
      const e = buckets.get(k);
      if (!e || now - e.windowStart > 60000) {
        buckets.set(k, { count: 1, windowStart: now });
      } else {
        e.count += 1;
        if (e.count > 120) {
          res.status(429).json({ success: false, code: 'RATE_LIMITED' });
          return;
        }
      }
      const raw = typeof (req as any).rawBody === 'string' && (req as any).rawBody
        ? String((req as any).rawBody)
        : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
      const headers: Record<string, string | undefined> = {};
      for (const [hk, v] of Object.entries(req.headers)) {
        headers[hk.toLowerCase()] = Array.isArray(v) ? v[0] : String(v ?? '');
      }
      const verified = await provider.verifyWebhook(raw, headers);
      if (!verified) {
        logError('payment webhook rejected (bad auth)');
        res.status(401).json({ success: false, code: 'BAD_SIGNATURE' });
        return;
      }
      const eventKey = `${provider.name}:${verified.eventType}:${verified.providerOrderId}:${verified.providerPaymentId || 'none'}`;
      if (store.hasWebhookEvent(eventKey)) {
        res.json({ success: true, duplicate: true });
        return;
      }
      // Source of truth: re-query provider before touching entitlements.
      const order = store.findPaymentOrderByProvider(provider.name, verified.providerOrderId)
        || store.getPaymentOrder(verified.providerOrderId);
      let note = `event=${verified.eventType}`;
      if (order) {
        const st = await provider.getPaymentStatus(order.providerOrderId || order.orderId).catch(() => null);
        if (st && st.state === 'COMPLETED') {
          if (st.amountPaise === order.amount * 100) {
            order.status = 'success';
            order.providerPaymentId = st.providerPaymentId || verified.providerPaymentId;
            order.updatedAt = Date.now();
            store.savePaymentOrder(order);
            note += fulfill(order, order.providerPaymentId, 'webhook') ? ' fulfilled' : ' already-fulfilled';
          } else {
            order.status = 'failed';
            order.failureCode = 'AMOUNT_MISMATCH';
            order.updatedAt = Date.now();
            store.savePaymentOrder(order);
            note += ' amount-mismatch';
          }
        } else if (st && st.state === 'FAILED') {
          const fresh = store.getPaymentOrder(order.orderId) || order;
          if (fresh.status !== 'fulfilled' && fresh.status !== 'refunded') {
            fresh.status = 'failed';
            fresh.failureCode = st.rawCode || 'FAILED';
            fresh.updatedAt = Date.now();
            store.savePaymentOrder(fresh);
          }
          note += ' marked-failed';
        } else {
          note += ' pending-confirmed';
        }
        // Refund completion revokes premium per policy (data never deleted).
        if (verified.eventType === 'pg.refund.completed') {
          const fresh = store.getPaymentOrder(order.orderId) || order;
          fresh.status = 'refunded';
          fresh.updatedAt = Date.now();
          store.savePaymentOrder(fresh);
          store.setSubscription(fresh.userKey, {
            status: 'REFUNDED', productId: '', basePlanId: '', offerId: '',
            purchaseTokenHash: '', plan: '', billingPeriod: '', startTime: 0,
            expiryAt: 0, autoRenew: false, autoRenewing: false, cancelReason: 'refunded',
            acknowledgementState: '', verificationSource: 'payment-webhook', linkedAccountId: fresh.userKey,
          } as never);
          note += ' refund-applied';
        }
      } else {
        note += ' unknown-order';
      }
      store.saveWebhookEvent({
        eventKey, provider: provider.name, providerOrderId: verified.providerOrderId,
        providerPaymentId: verified.providerPaymentId, orderId: order ? order.orderId : '',
        eventType: verified.eventType, verified: true, processedAt: Date.now(), receivedAt: Date.now(), note,
      });
      res.json({ success: true });
    } catch (err: any) {
      logError(`payment webhook exception: ${redact(String(err?.message || err)).slice(0, 160)}`);
      res.status(500).json({ success: false, code: 'SERVER_ERROR' });
    }
  };
}

export function createPaymentRouter(deps: {
  store: FridayStore;
  provider: PaymentProvider;
  appUrl: string;
  redact: (s: string) => string;
  log: (msg: string) => void;
  logError: (msg: string) => void;
}): express.Router {
  const { store, provider, appUrl, redact, log, logError } = deps;
  const r = express.Router();

  // Per-IP rate limits (payment endpoints are abuse-sensitive).
  const buckets = new Map<string, { count: number; windowStart: number }>();
  function limited(ip: string, key: string, max: number, windowMs: number): boolean {
    const k = `${key}:${ip}`;
    const now = Date.now();
    const e = buckets.get(k);
    if (!e || now - e.windowStart > windowMs) {
      buckets.set(k, { count: 1, windowStart: now });
      return false;
    }
    e.count += 1;
    return e.count > max;
  }

  function markExpired(o: PaymentOrder): boolean {
    if ((o.status === 'created' || o.status === 'pending') && Date.now() > o.expiresAt) {
      o.status = 'expired';
      o.updatedAt = Date.now();
      store.savePaymentOrder(o);
      return true;
    }
    return false;
  }

  /** Fulfill once: verified COMPLETED + amount match + not already fulfilled. */
  function fulfill(o: PaymentOrder, providerPaymentId: string, source: string): boolean {
    const fresh = store.getPaymentOrder(o.orderId);
    if (!fresh || fresh.status === 'fulfilled' || fresh.status === 'refunded') return false;
    // Amount must match the SERVER period table for (plan, period) — the
    // frontend amount is never trusted at any step.
    const table = periodPrices();
    const row = (table as any)?.[fresh.planId];
    const expected = row?.[fresh.period as BillingPeriod];
    if (!expected || fresh.amount !== expected) {
      logError(`payment fulfill refused (amount/plan mismatch) order=${redact(fresh.orderId)}`);
      return false;
    }
    fresh.status = 'fulfilled';
    fresh.providerPaymentId = providerPaymentId;
    fresh.fulfilledAt = Date.now();
    fresh.updatedAt = Date.now();
    store.savePaymentOrder(fresh);
    const now = Date.now();
    const termDays = Number(fresh.durationDays) > 0 ? Number(fresh.durationDays) : 30;
    store.setSubscription(fresh.userKey, {
      status: plan.subscriptionStatus as never,
      productId: '',
      basePlanId: '',
      offerId: '',
      purchaseTokenHash: '',
      plan: fresh.planId === 'pro' ? 'PRO' : 'PLUS',
      billingPeriod: 'MONTHLY',
      startTime: now,
      expiryAt: now + termDays * 86400000,
      autoRenew: false,
      autoRenewing: false,
      cancelReason: '',
      acknowledgementState: '',
      verificationSource: `payment-${source}`,
      linkedAccountId: fresh.userKey,
    } as never);
    log(`payment fulfilled order=${redact(fresh.orderId)} plan=${fresh.planId} via=${source}`);
    return true;
  }

  /** Reconcile with provider (source of truth). Returns fresh order. */
  async function reconcile(o: PaymentOrder): Promise<PaymentOrder> {
    let fresh = store.getPaymentOrder(o.orderId) || o;
    if (markExpired(fresh)) return fresh;
    if (fresh.status === 'fulfilled' || fresh.status === 'refunded' || fresh.status === 'failed' || fresh.status === 'cancelled') {
      return fresh;
    }
    const sinceCheck = Date.now() - (fresh.updatedAt || 0);
    if (sinceCheck < RECONCILE_MIN_MS) return fresh;
    try {
      const st = await provider.getPaymentStatus(fresh.providerOrderId || fresh.orderId);
      fresh = store.getPaymentOrder(fresh.orderId) || fresh;
      if (st.state === 'COMPLETED') {
        if (st.amountPaise !== fresh.amount * 100) {
          logError(`payment amount mismatch order=${redact(fresh.orderId)} expected=${fresh.amount * 100} got=${st.amountPaise}`);
          fresh.status = 'failed';
          fresh.failureCode = 'AMOUNT_MISMATCH';
          fresh.updatedAt = Date.now();
          store.savePaymentOrder(fresh);
          return fresh;
        }
        fresh.status = 'success';
        fresh.providerPaymentId = st.providerPaymentId;
        fresh.updatedAt = Date.now();
        store.savePaymentOrder(fresh);
        fulfill(fresh, st.providerPaymentId, 'reconcile');
        return store.getPaymentOrder(fresh.orderId) || fresh;
      }
      if (st.state === 'FAILED') {
        fresh.status = 'failed';
        fresh.failureCode = st.rawCode || 'FAILED';
        fresh.updatedAt = Date.now();
        store.savePaymentOrder(fresh);
        return fresh;
      }
      fresh.status = 'pending';
      fresh.updatedAt = Date.now();
      store.savePaymentOrder(fresh);
      return fresh;
    } catch (e: any) {
      logError(`payment reconcile failed order=${redact(fresh.orderId)}: ${redact(String(e?.message || e)).slice(0, 160)}`);
      return fresh;
    }
  }

  // GET /api/payment/plans — public catalog with per-period pricing (no secrets).
  r.get('/plans', (_req, res) => {
    const table = periodPrices();
    const periods = (['monthly', '3_month', 'yearly'] as BillingPeriod[]).map((p) => ({
      period: p,
      days: PERIOD_DAYS[p],
    }));
    res.json({
      success: true, provider: provider.name, configured: provider.isConfigured(),
      plans: publicPlans(), periods, prices: table,
    });
  });

  // POST /api/payment/create-order { planId, period, device_id }
  // planId: plus|pro. period: monthly|3_month|yearly. Amount + term come from
  // the server period table — never from the request body.
  r.post('/create-order', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      const ip = clientIp(req);
      if (limited(ip, 'create', 10, 60000)) {
        res.status(429).json({ success: false, code: 'RATE_LIMITED', error: 'Bahut jaldi-jaldi. Thoda ruk kar try karo.' });
        return;
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const planId = cleanStr(body.planId ?? body.plan_id, 16).toLowerCase();
      if (planId !== 'plus' && planId !== 'pro') {
        res.status(400).json({ success: false, code: 'INVALID_PLAN', error: 'Ye plan available nahi hai.' });
        return;
      }
      const period = parsePeriod(body.period ?? body.billing_period ?? 'monthly');
      if (!period) {
        res.status(400).json({ success: false, code: 'INVALID_PERIOD', error: 'Ye billing period available nahi hai.' });
        return;
      }
      if (!provider.isConfigured()) {
        res.status(501).json({ success: false, code: 'PAYMENTS_NOT_CONFIGURED', error: 'Web payments are not active yet.' });
        return;
      }
      const key = userKey(req, body.device_id ?? body.deviceId);
      const amount = periodPrices()[planId][period];
      const orderId = newOrderId();
      const now = Date.now();
      const redirectUrl = `${appUrl.replace(/\/$/, '')}/payment/success?orderId=${encodeURIComponent(orderId)}`;
      const order: PaymentOrder = {
        orderId, userKey: key, planId, period, durationDays: PERIOD_DAYS[period],
        amount, amountPaise: amount * 100,
        currency: 'INR', provider: provider.name, providerOrderId: '', checkoutUrl: '',
        checkoutExpiresAt: 0, status: 'created', providerPaymentId: '', failureCode: '',
        expiresAt: now + ORDER_TTL_MS, fulfilledAt: 0, createdAt: now, updatedAt: now,
      };
      store.savePaymentOrder(order);
      try {
        const created = await provider.createOrder({
          internalOrderId: orderId,
          amountPaise: order.amountPaise,
          redirectUrl,
          expireAfterSec: 1200,
          planLabel: `FRIDAY ${planId === 'pro' ? 'Pro' : 'Plus'} ${period}`,
        });
        order.providerOrderId = created.providerOrderId;
        order.checkoutUrl = created.checkoutUrl;
        order.checkoutExpiresAt = created.checkoutExpiresAt;
        order.status = 'pending';
        order.updatedAt = Date.now();
        store.savePaymentOrder(order);
      } catch (e: any) {
        order.status = 'failed';
        order.failureCode = String(e?.message || 'PROVIDER_ERROR').slice(0, 120);
        order.updatedAt = Date.now();
        store.savePaymentOrder(order);
        const reason = redact(String(e?.message || e)).slice(0, 200);
        logError(`payment create failed plan=${planId} period=${period}: ${reason.slice(0, 160)}`);
        // Pass the short provider reason through so the dashboard notice
        // itself shows the real cause (merchant is the operator here).
        res.status(502).json({ success: false, code: 'ORDER_FAILED', error: `Payment order create nahi ho paya. Dobara try karo.${reason ? ` (${reason})` : ''}` });
        return;
      }
      res.json({
        success: true, orderId: order.orderId, checkoutUrl: order.checkoutUrl,
        upi_intent: (created as any)?.upiIntent || undefined,
        qr_code: (created as any)?.qrCode || undefined,
        pay_url: (created as any)?.payUrl || undefined,
        amount: order.amount, currency: order.currency, planId: order.planId,
        period, expiresAt: order.expiresAt,
      });
    } catch (e: any) {
      logError(`payment create exception: ${redact(String(e?.message || e)).slice(0, 160)}`);
      res.status(500).json({ success: false, code: 'SERVER_ERROR', error: 'Payment order create nahi ho paya.' });
    }
  });

  // GET /api/payment/status?orderId=&device_id= — owner-only, reconciles.
  r.get('/status', async (req, res) => {
    try {
      const ip = clientIp(req);
      if (limited(ip, 'status', 60, 60000)) {
        res.status(429).json({ success: false, code: 'RATE_LIMITED', error: 'Bahut jaldi-jaldi. Thoda ruk kar try karo.' });
        return;
      }
      const q = req.query as Record<string, unknown>;
      const orderId = cleanStr(q.orderId ?? q.order_id, 128);
      const key = userKey(req, undefined);
      const o = orderId ? store.getPaymentOrder(orderId) : null;
      if (!o || o.userKey !== key) {
        res.status(404).json({ success: false, code: 'ORDER_NOT_FOUND', error: 'Order nahi mila.' });
        return;
      }
      const fresh = await reconcile(o);
      res.json({
        success: true,
        orderId: fresh.orderId,
        status: fresh.status === 'fulfilled' ? 'success' : fresh.status,
        planId: fresh.planId,
        amount: fresh.amount,
      });
    } catch (e: any) {
      logError(`payment status exception: ${redact(String(e?.message || e)).slice(0, 160)}`);
      res.status(500).json({ success: false, code: 'SERVER_ERROR', error: 'Status check nahi ho paya.' });
    }
  });

  // POST /api/payment/webhook — raw body, provider-authenticated, idempotent.
  // (Same shared handler is also mounted at /api/payment-webhook and
  // /api/ekqr-webhook in server.ts.)
  r.post('/webhook', express.raw({ type: '*/*', limit: '64kb' }), createWebhookHandler({ store, provider, redact, log, logError }));

  // GET /api/payment/orders?device_id= — own order history (public fields).
  r.get('/orders', (req, res) => {
    try {
      const key = userKey(req, undefined);
      const list = store.listPaymentOrders(key, 50).map(publicOrder);
      res.json({ success: true, orders: list });
    } catch (e: any) {
      logError(`payment orders exception: ${redact(String(e?.message || e)).slice(0, 160)}`);
      res.status(500).json({ success: false, code: 'SERVER_ERROR' });
    }
  });

  // POST /api/payment/refund { orderId } — admin only (ADMIN_API_KEY).
  r.post('/refund', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      const adminKey = (process.env.ADMIN_API_KEY || '').trim();
      const got = String(req.headers['x-admin-key'] || '');
      if (!adminKey || got !== adminKey) {
        res.status(403).json({ success: false, code: 'FORBIDDEN' });
        return;
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const orderId = cleanStr(body.orderId ?? body.order_id, 128);
      const o = orderId ? store.getPaymentOrder(orderId) : null;
      if (!o || (o.status !== 'fulfilled' && o.status !== 'success')) {
        res.status(404).json({ success: false, code: 'ORDER_NOT_FOUND', error: 'Refundable order nahi mila.' });
        return;
      }
      if (!provider.isConfigured()) {
        res.status(501).json({ success: false, code: 'PAYMENTS_NOT_CONFIGURED', error: 'Refunds available nahi hain.' });
        return;
      }
      const refundId = newRefundId();
      const result = await provider.refund({
        internalRefundId: refundId, internalOrderId: o.providerOrderId || o.orderId, amountPaise: o.amount * 100,
      });
      store.saveRefund({
        refundId, providerRefundId: result.providerRefundId, orderId: o.orderId,
        userKey: o.userKey, amount: o.amount, currency: 'INR',
        state: result.state, createdAt: Date.now(), updatedAt: Date.now(),
      });
      if (result.state === 'COMPLETED') {
        o.status = 'refunded';
        o.updatedAt = Date.now();
        store.savePaymentOrder(o);
        store.setSubscription(o.userKey, {
          status: 'REFUNDED', productId: '', basePlanId: '', offerId: '',
          purchaseTokenHash: '', plan: '', billingPeriod: '', startTime: 0,
          expiryAt: 0, autoRenew: false, autoRenewing: false, cancelReason: 'refunded',
          acknowledgementState: '', verificationSource: 'payment-refund', linkedAccountId: o.userKey,
        } as never);
      }
      res.json({ success: true, refundId, state: result.state });
    } catch (e: any) {
      logError(`payment refund exception: ${redact(String(e?.message || e)).slice(0, 160)}`);
      res.status(500).json({ success: false, code: 'SERVER_ERROR' });
    }
  });

  // GET /api/payment/admin/orders?status=&limit= — admin only, filtered view.
  r.get('/admin/orders', (req, res) => {
    try {
      const adminKey = (process.env.ADMIN_API_KEY || '').trim();
      const got = String(req.headers['x-admin-key'] || '');
      if (!adminKey || got !== adminKey) {
        res.status(403).json({ success: false, code: 'FORBIDDEN' });
        return;
      }
      const q = req.query as Record<string, unknown>;
      const list = store.listAllPaymentOrders(cleanStr(q.status, 16), Number(q.limit) || 100);
      res.json({
        success: true,
        orders: list.map((o) => ({
          ...publicOrder(o),
          user: o.userKey,
          provider: o.provider,
          providerPaymentId: o.providerPaymentId,
          providerOrderId: o.providerOrderId,
          failureCode: o.failureCode,
          fulfilledAt: o.fulfilledAt,
          updatedAt: o.updatedAt,
        })),
      });
    } catch (e: any) {
      logError(`payment admin exception: ${redact(String(e?.message || e)).slice(0, 160)}`);
      res.status(500).json({ success: false, code: 'SERVER_ERROR' });
    }
  });

  return r;
}
