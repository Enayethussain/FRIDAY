// Versioned public API (/api/v1/...). Backward compatible: legacy /api/chat
// keeps working. All entitlement and quota decisions are server-side.
import express from 'express';
import { createHash } from 'node:crypto';
import type { FridayConfig } from './config.js';
import { getFeatureFlags } from './config.js';
import type { AIRouter } from './ai/router.js';
import { FridayStore, dailyLimitFor } from './store.js';
import {
  entitlementsForPlan, effectivePlan, subscriptionStateLabel,
  adminGrants, products, deviceLimitFor, productById,
} from './billing.js';
import type { ChatRequest } from './ai/types.js';

const CHAT_TIMEOUT_MS = 25000;
const CHAT_RATE_MAX = 30;
const CHAT_RATE_WINDOW_MS = 60000;

// Device limits per effective plan (env-overridable; existing devices kept).
function maxDevices(_cfg: FridayConfig, plan: 'FREE' | 'PRO' | 'PLUS'): number {
  const num = (v: string | undefined, fb: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fb;
  };
  return deviceLimitFor(
    plan,
    num(process.env.MAX_DEVICES_FREE, 2),
    num(process.env.MAX_DEVICES_PRO, 5),
    num(process.env.MAX_DEVICES_PLUS, 10)
  );
}

/** Server-derived UI lifecycle hint (fixed vocabulary, no Play internals). */
function uiStateFor(status: string, expiryAt: number): string {
  const now = Date.now();
  switch (status) {
    case 'PENDING': return 'PENDING';
    case 'ACCOUNT_HOLD': return 'ACCOUNT_HOLD';
    case 'PAUSED': return 'PAUSED';
    case 'CANCELLED': return expiryAt > now ? 'CANCELLED' : 'EXPIRED';
    case 'EXPIRED': return 'EXPIRED';
    case 'REFUNDED':
    case 'REVOKED': return status;
    default:
      if (status === 'FREE') return 'NOT_PURCHASED';
      if (expiryAt > 0 && expiryAt <= now) return 'EXPIRED';
      return 'ACTIVE';
  }
}

/** SHA-256 of a purchase token for reconciliation (raw tokens never stored/logged). */
function tokenHash(token: string): string {
  try {
    return createHash('sha256').update(token).digest('hex');
  } catch {
    return '';
  }
}

/** Effective plan: subscription first, then admin grant, else FREE. */
function resolvePlan(store: FridayStore, key: string): { plan: 'FREE' | 'PRO' | 'PLUS'; subStatus: string } {
  const user = store.getOrCreateUser(key);
  const now = Date.now();
  const grants = adminGrants();
  if (grants[key] && user.grantedPlan !== grants[key]) store.setGrantedPlan(key, grants[key]);
  const base: 'FREE' | 'PRO' | 'PLUS' = grants[key]
    || (user.grantedPlan === 'PRO' || user.grantedPlan === 'PLUS' ? user.grantedPlan : 'FREE');
  const sub = {
    status: (user.subscription?.status || 'FREE') as 'FREE',
    productId: user.subscription?.productId || '',
    basePlanId: user.subscription?.basePlanId || '',
    offerId: user.subscription?.offerId || '',
    expiryAt: user.subscription?.expiryAt || 0,
    autoRenew: !!user.subscription?.autoRenew,
    autoRenewing: !!user.subscription?.autoRenewing,
    updatedAt: user.subscription?.updatedAt || now,
  };
  const plan = effectivePlan(base, sub as never, now);
  return { plan, subStatus: subscriptionStateLabel(sub as never, now) };
}

function clientIp(req: express.Request): string {
  const fwd = (req.headers['x-forwarded-for'] as string) || '';
  return (fwd.split(',')[0] || '').trim() || req.ip || 'unknown';
}

function userKey(req: express.Request, bodyDeviceId: unknown): string {
  const q = req.query as Record<string, unknown>;
  const raw = String(bodyDeviceId || q.deviceId || q.device_id || '').slice(0, 128);
  if (raw) return `device:${raw}`;
  return `anon:${clientIp(req)}`;
}

function cleanStr(v: unknown, max: number): string {
  return String(v ?? '').slice(0, max);
}

export function createV1Router(deps: {
  config: FridayConfig;
  router: AIRouter;
  store: FridayStore;
  redact: (s: string) => string;
  log: (msg: string) => void;
  logError: (msg: string) => void;
}): express.Router {
  const { config, router, store, redact, log, logError } = deps;
  const r = express.Router();
  const burst = new Map<string, { count: number; windowStart: number }>();

  function burstLimited(ip: string): boolean {
    const now = Date.now();
    const e = burst.get(ip);
    if (!e || now - e.windowStart > CHAT_RATE_WINDOW_MS) {
      burst.set(ip, { count: 1, windowStart: now });
      return false;
    }
    e.count += 1;
    return e.count > CHAT_RATE_MAX;
  }

  // POST /api/v1/chat { message, conversation_id, language, device_id?, history? }
  r.post('/chat', express.json({ limit: '32kb' }), async (req, res) => {
    try {
      if (config.maintenanceMode) {
        res.status(503).json({ success: false, code: 'MAINTENANCE', error: 'Sir, server abhi maintenance me hai. Thodi der baad try kijiye.' });
        return;
      }
      const ip = clientIp(req);
      if (burstLimited(ip)) {
        res.status(429).json({ success: false, code: 'RATE_LIMITED', error: 'Sir, bahut jaldi-jaldi bhej diya. Thoda ruk kar dobara try kijiye.' });
        return;
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const message = cleanStr(body.message, 2000).trim();
      if (!message) {
        res.status(400).json({ success: false, code: 'INVALID_REQUEST', error: 'Sir, message samajh nahi aaya. Dobara bhejo.' });
        return;
      }
      const langRaw = cleanStr(body.language, 16).toLowerCase();
      const language = langRaw === 'hi' || langRaw === 'hindi' ? 'hi' : langRaw === 'hinglish' ? 'hinglish' : 'en';
      const conversationId = cleanStr(body.conversation_id || body.conversationId, 128) || 'default';
      const rawHistory = Array.isArray(body.history) ? body.history.slice(-12) : [];
      const history: ChatRequest['history'] = [];
      for (const h of rawHistory) {
        if (h && typeof h === 'object') {
          const role = (h as any).role === 'model' ? 'model' : 'user';
          const text = cleanStr((h as any).text, 2000);
          if (text) history.push({ role, text });
        }
      }
      history.push({ role: 'user', text: message });

      const key = userKey(req, body.device_id ?? body.deviceId);
      const user = store.getOrCreateUser(key);
      if (user.status !== 'active') {
        res.status(403).json({ success: false, code: 'ACCOUNT_DISABLED', error: 'Sir, ye account abhi disabled hai.' });
        return;
      }
      // Quota follows the EFFECTIVE plan (subscription/admin grant aware).
      const { plan: effPlan } = resolvePlan(store, key);
      const limit = dailyLimitFor(
        effPlan === 'FREE' ? 'FREE' : effPlan,
        config.freeDailyLimit, config.proDailyLimit, config.plusDailyLimit
      );
      const quota = store.checkAndCount(key, limit);
      if (!quota.allowed) {
        log(`v1 chat quota exhausted key=${redact(key)} used=${quota.used}/${quota.limit}`);
        res.status(429).json({
          success: false,
          code: 'QUOTA_EXHAUSTED',
          error: 'Sir, AI service ka free quota abhi temporarily exhausted hai. Thodi der baad try kijiye.',
        });
        return;
      }

      const outcome = await router.routeChat(
        { message, conversationId, language, history },
        CHAT_TIMEOUT_MS
      );
      if (outcome.ok) {
        res.json({ success: true, reply: outcome.reply, conversation_id: conversationId, provider: outcome.provider });
        return;
      }
      const http = outcome.code === 'QUOTA_EXHAUSTED' || outcome.code === 'RATE_LIMITED' ? 429
        : outcome.code === 'CONFIGURATION_ERROR' ? 503
        : outcome.code === 'PROVIDER_TIMEOUT' ? 504
        : outcome.code === 'INVALID_REQUEST' ? 400 : 502;
      logError(`v1 chat failed code=${outcome.code} state=${outcome.providerState}`);
      res.status(http).json({ success: false, code: outcome.code, error: outcome.userMessage });
    } catch (e: any) {
      logError(`v1 chat exception: ${redact(String(e?.message || e)).slice(0, 200)}`);
      res.status(500).json({ success: false, code: 'SERVER_ERROR', error: 'Sir, AI request fail ho gayi. Dobara try kijiye.' });
    }
  });

  // GET /api/v1/status — safe info only, never secrets.
  r.get('/status', (_req, res) => {
    const st = router.status();
    res.json({
      status: config.maintenanceMode ? 'maintenance' : 'ok',
      assistant: 'FRIDAY',
      version: config.version,
      api: 'v1',
      ai: st.primaryState === 'AVAILABLE' ? 'configured' : 'unavailable',
      providers: st.providers.map((p) => ({ name: p.name, state: p.state })),
      features: getFeatureFlags(),
      time: new Date().toISOString(),
    });
  });

  // GET /api/v1/account?device_id=... — server-side entitlement decision.
  // Backward compatible: legacy {user:{id,plan,status},entitlements:{3 keys}}
  // fields are preserved; full map + subscription are additive.
  r.get('/account', (req, res) => {
    const q = req.query as Record<string, unknown>;
    const key = userKey(req, q.device_id ?? q.deviceId);
    const user = store.getOrCreateUser(key);
    const { plan, subStatus } = resolvePlan(store, key);
    const full = entitlementsForPlan(plan);
    let deviceLimited = false;
    if (typeof q.device_id === 'string' && q.device_id) {
      const reg = store.registerDevice(key, q.device_id.slice(0, 128), maxDevices(config, plan));
      deviceLimited = reg.limited;
    }
    const sub = user.subscription || { status: 'FREE', productId: '', basePlanId: '', offerId: '', expiryAt: 0, autoRenew: false, autoRenewing: false };
    res.json({
      user: { id: user.id, plan, status: user.status },
      // Legacy 3-key shape (unchanged semantics for old clients).
      entitlements: { advanced_ai: full.AI_ADVANCED, advanced_gestures: full.GESTURES_ADVANCED, hologram: full.HOLOGRAM },
      // Full v1 entitlement surface.
      plan,
      subscription_status: subStatus,
      subscription: {
        status: sub.status,
        product_id: sub.productId,
        base_plan_id: (sub as Record<string, unknown>).basePlanId || '',
        offer_id: (sub as Record<string, unknown>).offerId || '',
        // Only real billing dates are exposed; 0/'' means "not supplied".
        expiry_at: sub.expiryAt,
        expires_at: sub.expiryAt,
        auto_renew: sub.autoRenew,
        auto_renewing: !!(sub as Record<string, unknown>).autoRenewing,
        // UI lifecycle hint derived server-side (never raw Play payloads).
        ui_state: uiStateFor(sub.status, sub.expiryAt),
      },
      entitlements_full: full,
      devices_used: user.devices.length,
      max_devices: maxDevices(config, plan),
      device_limited: deviceLimited,
    });
  });

  // GET /api/v1/billing/products — single pricing source (admin configured).
  r.get('/billing/products', (_req, res) => {
    const p = products();
    res.json({
      billing_available: p.billingAvailable,
      payments_configured: p.configured,
      message: p.configured
        ? 'Plans listed below. Purchases complete via Google Play when billing is integrated.'
        : 'Payments not configured yet',
      items: p.items,
    });
  });

  // POST /api/v1/billing/verify — Play purchase verification.
  // NEVER unlocks on client claims: productId is mapped server-side from the
  // catalog and the purchase token is verified with the Play Developer API.
  // Without PLAY_SERVICE_ACCOUNT_JSON configured: honest 501, nothing granted.
  r.post('/billing/verify', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const key = userKey(req, body.device_id ?? body.deviceId);
      const productId = cleanStr(body.product_id ?? body.productId, 128);
      const purchaseToken = cleanStr(body.purchase_token ?? body.purchaseToken, 4096);
      const packageName = cleanStr(body.package_name ?? body.packageName, 128);
      // Client-reported offer metadata (display only — never authoritative).
      const basePlanId = cleanStr(body.base_plan_id ?? body.basePlanId, 128);
      const offerId = cleanStr(body.offer_id ?? body.offerId, 128);
      const billingPeriod = cleanStr(body.billing_period ?? body.billingPeriod, 32);
      const catalog = productById(productId);
      if (!catalog) {
        res.status(400).json({ success: false, code: 'INVALID_PRODUCT', error: 'Sir, ye product FRIDAY me available nahi hai.' });
        return;
      }
      if (!purchaseToken) {
        res.status(400).json({ success: false, code: 'INVALID_TOKEN', error: 'Sir, purchase verify nahi ho payi. Dobara try karo.' });
        return;
      }
      const { verifyPlayPurchase } = await import('./playverify.js');
      const outcome = await verifyPlayPurchase(productId, purchaseToken, packageName || 'com.friday.ai');
      if (!outcome.ok) {
        if (outcome.code === 'NOT_CONFIGURED') {
          log('v1 billing verify: Play verification not configured');
          res.status(501).json({ success: false, code: 'BILLING_NOT_IMPLEMENTED', error: 'Payments not configured yet. Google Play Billing integration is pending.' });
          return;
        }
        if (outcome.code === 'PACKAGE_MISMATCH' || outcome.code === 'INVALID_PRODUCT') {
          logError(`v1 billing verify rejected: ${outcome.code}`);
          res.status(400).json({ success: false, code: outcome.code, error: 'Sir, purchase verify nahi ho payi.' });
          return;
        }
        if (outcome.code === 'INVALID_TOKEN') {
          // A token that Play no longer recognizes for a previously-granted
          // subscription means revocation: mark REVOKED (data untouched).
          const existing = store.getOrCreateUser(key);
          if (existing.subscription?.productId === productId && existing.subscription?.purchaseTokenHash === tokenHash(purchaseToken)) {
            store.setSubscription(key, {
              status: 'REVOKED', productId, basePlanId, offerId,
              purchaseTokenHash: existing.subscription.purchaseTokenHash,
              plan: catalog.plan, billingPeriod: billingPeriod || existing.subscription.billingPeriod,
              startTime: existing.subscription.startTime, expiryAt: existing.subscription.expiryAt,
              autoRenew: false, autoRenewing: false, cancelReason: 'revoked',
              acknowledgementState: existing.subscription.acknowledgementState,
              verificationSource: 'play-developer-api', linkedAccountId: key,
            });
            logError(`v1 billing revoked for key=${redact(key)} product=${productId}`);
          } else {
            logError('v1 billing verify: unknown/invalid token');
          }
          res.status(404).json({ success: false, code: 'INVALID_TOKEN', error: 'Sir, ye purchase Play par nahi mili.' });
          return;
        }
        logError(`v1 billing verify failed: ${outcome.code}`);
        res.status(502).json({ success: false, code: outcome.code, error: 'Sir, purchase verify nahi ho payi. Dobara try karo.' });
        return;
      }
      // Verified by Play: write subscription state (user data never deleted).
      const meta = {
        productId, basePlanId, offerId,
        purchaseTokenHash: tokenHash(purchaseToken),
        plan: catalog.plan, billingPeriod: billingPeriod || catalog.period,
        startTime: outcome.startTime, expiryAt: outcome.expiryAt,
        verificationSource: 'play-developer-api', linkedAccountId: key,
      };
      if (outcome.state === 'ACTIVE' || outcome.state === 'GRACE') {
        store.setSubscription(key, { ...meta, status: catalog.status, autoRenew: true, autoRenewing: outcome.autoRenewing, cancelReason: '' });
      } else if (outcome.state === 'CANCELED_ACTIVE') {
        store.setSubscription(key, { ...meta, status: 'CANCELLED', autoRenew: false, autoRenewing: outcome.autoRenewing, cancelReason: 'user-cancelled' });
      } else if (outcome.state === 'PENDING') {
        store.setSubscription(key, { ...meta, status: 'PENDING', autoRenew: false, autoRenewing: false, cancelReason: '' });
      } else if (outcome.state === 'ACCOUNT_HOLD') {
        store.setSubscription(key, { ...meta, status: 'ACCOUNT_HOLD', autoRenew: false, autoRenewing: outcome.autoRenewing, cancelReason: 'account-hold' });
      } else if (outcome.state === 'PAUSED') {
        store.setSubscription(key, { ...meta, status: 'PAUSED', autoRenew: false, autoRenewing: outcome.autoRenewing, cancelReason: 'paused' });
      } else {
        store.setSubscription(key, { ...meta, status: 'EXPIRED', autoRenew: false, autoRenewing: false, cancelReason: '' });
      }
      const { plan, subStatus } = resolvePlan(store, key);
      const granted = plan === 'PRO' || plan === 'PLUS';
      const storedStatus = store.getOrCreateUser(key).subscription.status;
      res.json({
        success: granted,
        code: granted ? 'VERIFIED' : outcome.state,
        error: granted ? undefined : uiMessageFor(outcome.state),
        lifecycle: outcome.state,
        ui_state: uiStateFor(storedStatus, outcome.expiryAt),
        user: { id: key, plan, status: store.getOrCreateUser(key).status },
        subscription_status: subStatus,
        entitlements_full: entitlementsForPlan(plan),
      });
    } catch (e: any) {
      logError(`v1 billing verify exception: ${redact(String(e?.message || e)).slice(0, 200)}`);
      res.status(500).json({ success: false, code: 'SERVER_ERROR', error: 'Sir, purchase verify nahi ho payi. Dobara try karo.' });
    }
  });

  // POST /api/v1/billing/restore — restores ONLY verified server state.
  r.post('/billing/restore', express.json({ limit: '16kb' }), (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const key = userKey(req, body.device_id ?? body.deviceId);
    const user = store.getOrCreateUser(key);
    const { plan, subStatus } = resolvePlan(store, key);
    // No purchase tokens can be verified yet: report the verified state as-is.
    res.json({
      success: true,
      restored: false,
      message: plan === 'FREE'
        ? 'Koi active subscription nahi mili. (Billing integration pending — purchases abhi available nahi hain.)'
        : 'Subscription state verified from server.',
      user: { id: user.id, plan, status: user.status },
      subscription_status: subStatus,
      entitlements_full: entitlementsForPlan(plan),
    });
  });

  return r;
}
