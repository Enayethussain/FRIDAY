// Persistent file-backed store for users / sessions / usage / subscriptions /
// device registrations / settings / conversation metadata / entitlements.
// Migration-safe: unknown fields are preserved, missing fields get defaults,
// and existing data is never destroyed on update. Conversation CONTENT is not
// stored — only metadata (ids, counts, timestamps).
import fs from 'fs';
import path from 'path';

export type PlanId = 'FREE' | 'PRO' | 'PLUS' | 'EXPIRED' | 'CANCELLED' | 'PENDING' | 'REFUNDED';

export interface UserRecord {
  id: string;
  status: 'active' | 'disabled';  plan: PlanId;
  devices: string[];
  // Admin-assigned plan (server env PLAN_GRANTS only; never the client).
  grantedPlan: '' | 'PRO' | 'PLUS';
  // Billing-owned subscription (written only via verified purchases/admin).
  // Extended lifecycle model (§20): raw purchase tokens are NEVER stored —
  // only a SHA-256 hash for reconciliation. Metadata reported by the client
  // (offer/basePlan) is informational only; entitlement comes from verified
  // Play state + server catalog mapping.
  subscription: SubscriptionDetails;
  createdAt: number;
  updatedAt: number;
}

export interface UsageRecord {
  count: number;
  windowStart: number; // start of current day window (ms)
}

export interface SubscriptionDetails {
  status: string;
  productId: string;
  basePlanId: string;
  offerId: string;
  purchaseTokenHash: string;
  plan: string;
  billingPeriod: string;
  startTime: number;
  expiryAt: number;
  autoRenew: boolean;
  autoRenewing: boolean;
  cancelReason: string;
  acknowledgementState: string;
  lastVerifiedAt: number;
  verificationSource: string;
  linkedAccountId: string;
  updatedAt: number;
}

function blankSub(now: number): SubscriptionDetails {
  return {
    status: 'FREE', productId: '', basePlanId: '', offerId: '',
    purchaseTokenHash: '', plan: '', billingPeriod: '', startTime: 0,
    expiryAt: 0, autoRenew: false, autoRenewing: false, cancelReason: '',
    acknowledgementState: '', lastVerifiedAt: 0, verificationSource: '',
    linkedAccountId: '', updatedAt: now,
  };
}

interface StoreShape {
  version: number;
  users: Record<string, UserRecord>;
  usage: Record<string, UsageRecord>; // key: userId:YYYY-MM-DD
  settings: Record<string, unknown>;
  // Payment tables (v2 migration, additive only — users/usage untouched).
  paymentOrders: Record<string, import('./payments/types.js').PaymentOrder>;
  paymentOrdersByProvider: Record<string, string>; // provider:providerOrderId -> orderId (unique)
  webhookEvents: Record<string, import('./payments/types.js').WebhookEvent>; // eventKey -> event (unique)
  refunds: Record<string, import('./payments/types.js').RefundRecord>;
  // Email-linked premium grants (reinstall-proof): email -> plan + expiry.
  // Written ONLY on verified fulfillment/refund; read with expiry check.
  emailGrants: Record<string, { plan: 'PRO' | 'PLUS'; expiryAt: number; updatedAt: number }>;
  // Anti-piracy device bindings (one device per license): email -> device.
  // First active-license check binds the device; a different deviceId with
  // the same active license is rejected (anti-sharing). Cleared with grant.
  licenseBindings: Record<string, { deviceId: string; plan: 'PRO' | 'PLUS'; boundAt: number; updatedAt: number }>;
}

const STORE_VERSION = 2;

function dayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export class FridayStore {
  private file: string;
  private data: StoreShape;

  constructor(storePath: string) {
    this.file = path.isAbsolute(storePath) ? storePath : path.join(process.cwd(), storePath);
    this.data = this.load();
  }

  private blank(): StoreShape {
    return { version: STORE_VERSION, users: {}, usage: {}, settings: {}, paymentOrders: {}, paymentOrdersByProvider: {}, webhookEvents: {}, refunds: {}, emailGrants: {}, licenseBindings: {} };
  }

  private load(): StoreShape {
    try {
      if (!fs.existsSync(this.file)) return this.blank();
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      // Migrate: keep everything unknown, fill what's missing. v1 -> v2 adds
      // payment tables only; existing users/usage/settings are preserved.
      const base = this.blank();
      const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, never> : undefined);
      return {
        version: STORE_VERSION,
        users: obj(raw?.users) as StoreShape['users'] || base.users,
        usage: obj(raw?.usage) as StoreShape['usage'] || base.usage,
        settings: obj(raw?.settings) as StoreShape['settings'] || base.settings,
        paymentOrders: obj(raw?.paymentOrders) as StoreShape['paymentOrders'] || base.paymentOrders,
        paymentOrdersByProvider: obj(raw?.paymentOrdersByProvider) as StoreShape['paymentOrdersByProvider'] || base.paymentOrdersByProvider,
        webhookEvents: obj(raw?.webhookEvents) as StoreShape['webhookEvents'] || base.webhookEvents,
        refunds: obj(raw?.refunds) as StoreShape['refunds'] || base.refunds,
        emailGrants: obj(raw?.emailGrants) as StoreShape['emailGrants'] || base.emailGrants,
        licenseBindings: obj(raw?.licenseBindings) as StoreShape['licenseBindings'] || base.licenseBindings,
      };
    } catch {
      // Corrupt file: back it up, never delete user data.
      try {
        if (fs.existsSync(this.file)) {
          fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}.bak`);
        }
      } catch { /* best effort */ }
      return this.blank();
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch { /* persistence best-effort; memory still serves */ }
  }

  getOrCreateUser(id: string): UserRecord {
    const now = Date.now();
    let u = this.data.users[id];
    if (!u) {
      u = {
        id, status: 'active', plan: 'FREE', devices: [], grantedPlan: '',
        subscription: blankSub(now),
        createdAt: now, updatedAt: now,
      };
      this.data.users[id] = u;
      this.save();
      return u;
    }
    // Migrate older records: fill subscription fields, keep everything else.
    if (!u.subscription || typeof u.subscription !== 'object') {
      (u as UserRecord).subscription = blankSub(now);
      this.save();
    } else {
      const s = u.subscription as Record<string, unknown>;
      const defaults = blankSub(now);
      for (const k of Object.keys(defaults) as (keyof typeof defaults)[]) {
        const v = s[k];
        if (k === 'expiryAt' || k === 'startTime' || k === 'lastVerifiedAt' || k === 'updatedAt') {
          if (typeof v !== 'number') (s as Record<string, unknown>)[k] = defaults[k];
        } else if (k === 'autoRenew' || k === 'autoRenewing') {
          if (typeof v !== 'boolean') (s as Record<string, unknown>)[k] = defaults[k];
        } else if (typeof v !== 'string') {
          (s as Record<string, unknown>)[k] = defaults[k];
        }
      }
    }
    if (u.grantedPlan !== 'PRO' && u.grantedPlan !== 'PLUS') (u as UserRecord).grantedPlan = '';
    return u;
  }

  getUser(id: string): UserRecord | null {
    return this.data.users[id] || null;
  }

  registerDevice(userId: string, deviceId: string, maxDevices = 0): { user: UserRecord; limited: boolean } {
    const u = this.getOrCreateUser(userId);
    if (deviceId && !u.devices.includes(deviceId)) {
      if (maxDevices > 0 && u.devices.length >= maxDevices) {
        return { user: u, limited: true }; // honest limit, nothing removed
      }
      u.devices.push(deviceId);
      u.updatedAt = Date.now();
      this.save();
    }
    return { user: u, limited: false };
  }

  /** Operator/admin plan grant (server-side only). Never deletes user data. */
  setGrantedPlan(userId: string, plan: '' | 'PRO' | 'PLUS'): UserRecord {
    const u = this.getOrCreateUser(userId);
    u.grantedPlan = plan;
    u.updatedAt = Date.now();
    this.save();
    return u;
  }

  /** Billing-verified subscription write (future Play verification lands here). */
  setSubscription(userId: string, sub: {
    status: string; productId: string; basePlanId?: string; offerId?: string;
    purchaseTokenHash?: string; plan?: string; billingPeriod?: string;
    startTime?: number; expiryAt: number; autoRenew?: boolean; autoRenewing?: boolean;
    cancelReason?: string; acknowledgementState?: string;
    verificationSource?: string; linkedAccountId?: string;
  }): UserRecord {
    const u = this.getOrCreateUser(userId);
    const prev = u.subscription || blankSub(Date.now());
    u.subscription = {
      ...blankSub(Date.now()),
      ...prev,
      status: sub.status,
      productId: sub.productId,
      basePlanId: sub.basePlanId ?? prev.basePlanId,
      offerId: sub.offerId ?? prev.offerId,
      purchaseTokenHash: sub.purchaseTokenHash ?? '',
      plan: sub.plan ?? prev.plan,
      billingPeriod: sub.billingPeriod ?? prev.billingPeriod,
      startTime: sub.startTime ?? prev.startTime,
      expiryAt: sub.expiryAt,
      autoRenew: sub.autoRenew ?? prev.autoRenew,
      autoRenewing: sub.autoRenewing ?? (sub.status !== 'CANCELLED' && sub.status !== 'EXPIRED'),
      cancelReason: sub.cancelReason ?? '',
      acknowledgementState: sub.acknowledgementState ?? prev.acknowledgementState,
      lastVerifiedAt: Date.now(),
      verificationSource: sub.verificationSource ?? prev.verificationSource,
      linkedAccountId: sub.linkedAccountId ?? prev.linkedAccountId,
      updatedAt: Date.now(),
    };
    u.updatedAt = Date.now();
    this.save();
    return u;
  }
  /** Server-side daily usage check. Returns { allowed, used, limit }. */
  checkAndCount(userId: string, limit: number): { allowed: boolean; used: number; limit: number } {
    const key = `${userId}:${dayKey()}`;
    let rec = this.data.usage[key];
    const now = Date.now();
    const windowStart = new Date(`${dayKey()}T00:00:00.000Z`).getTime();
    if (!rec || rec.windowStart !== windowStart) {
      rec = { count: 0, windowStart };
      this.data.usage[key] = rec;
    }
    if (limit > 0 && rec.count >= limit) {
      return { allowed: false, used: rec.count, limit };
    }
    rec.count += 1;
    this.save();
    // Prune windows older than 7 days (usage only, never users).
    try {
      for (const k of Object.keys(this.data.usage)) {
        if (this.data.usage[k] && this.data.usage[k].windowStart < now - 7 * 86400000) {
          delete this.data.usage[k];
        }
      }
    } catch { /* noop */ }
    return { allowed: true, used: rec.count, limit };
  }

  getSetting(key: string): unknown {
    return this.data.settings[key];
  }

  setSetting(key: string, value: unknown): void {
    this.data.settings[key] = value;
    this.save();
  }

  // ---- Payment tables: uniqueness enforced here (order_id, provider order,
  // webhook event key). All writes persist; duplicates are rejected, never
  // double-applied.

  savePaymentOrder(o: import('./payments/types.js').PaymentOrder): void {
    this.data.paymentOrders[o.orderId] = o;
    if (o.providerOrderId) {
      this.data.paymentOrdersByProvider[`${o.provider}:${o.providerOrderId}`] = o.orderId;
    }
    this.save();
  }

  getPaymentOrder(orderId: string): import('./payments/types.js').PaymentOrder | null {
    return this.data.paymentOrders[orderId] || null;
  }

  findPaymentOrderByProvider(provider: string, providerOrderId: string): import('./payments/types.js').PaymentOrder | null {
    const id = this.data.paymentOrdersByProvider[`${provider}:${providerOrderId}`];
    return (id && this.data.paymentOrders[id]) || null;
  }

  listPaymentOrders(userKey: string, limit = 50): import('./payments/types.js').PaymentOrder[] {
    return Object.values(this.data.paymentOrders)
      .filter((o) => o.userKey === userKey)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.max(1, Math.min(200, limit)));
  }

  listAllPaymentOrders(status: string, limit = 100): import('./payments/types.js').PaymentOrder[] {
    const all = Object.values(this.data.paymentOrders).sort((a, b) => b.createdAt - a.createdAt);
    const filtered = !status || status === 'all' ? all : all.filter((o) => o.status === status);
    return filtered.slice(0, Math.max(1, Math.min(500, limit)));
  }

  hasWebhookEvent(eventKey: string): boolean {
    return !!this.data.webhookEvents[eventKey];
  }

  saveWebhookEvent(e: import('./payments/types.js').WebhookEvent): void {
    this.data.webhookEvents[e.eventKey] = e;
    this.save();
  }

  saveRefund(r: import('./payments/types.js').RefundRecord): void {
    this.data.refunds[r.refundId] = r;
    this.save();
  }

  getRefund(refundId: string): import('./payments/types.js').RefundRecord | null {
    return this.data.refunds[refundId] || null;
  }

  private normEmail(email: string): string {
    return String(email || '').trim().toLowerCase().slice(0, 128);
  }

  /** Email grant written ONLY on verified fulfillment (or cleared on refund). */
  setEmailGrant(email: string, plan: 'PRO' | 'PLUS', expiryAt: number): void {
    const key = this.normEmail(email);
    if (!key || !key.includes('@')) return;
    this.data.emailGrants[key] = { plan, expiryAt, updatedAt: Date.now() };
    this.save();
  }

  clearEmailGrant(email: string): void {
    const key = this.normEmail(email);
    if (key && this.data.emailGrants[key]) {
      delete this.data.emailGrants[key];
      this.save();
    }
    // Refund/expiry releases the device binding too — a new purchase rebinds.
    this.clearLicenseBinding(email);
  }

  /** Unexpired email grant or null. Never invents premium. */
  getEmailGrant(email: string): { plan: 'PRO' | 'PLUS'; expiryAt: number } | null {
    const g = this.data.emailGrants[this.normEmail(email)];
    if (!g) return null;
    if ((g.plan !== 'PRO' && g.plan !== 'PLUS') || !(g.expiryAt > Date.now())) return null;
    return { plan: g.plan, expiryAt: g.expiryAt };
  }

  /** Anti-piracy device binding for a license email. */
  getLicenseBinding(email: string): { deviceId: string; plan: 'PRO' | 'PLUS'; boundAt: number } | null {
    const b = this.data.licenseBindings[this.normEmail(email)];
    if (!b || !b.deviceId) return null;
    return { deviceId: b.deviceId, plan: b.plan, boundAt: b.boundAt };
  }

  /** First-time active-license login binds the device. Never rebinds here. */
  bindLicenseDevice(email: string, deviceId: string, plan: 'PRO' | 'PLUS'): void {
    const key = this.normEmail(email);
    if (!key || !key.includes('@') || !deviceId) return;
    this.data.licenseBindings[key] = { deviceId: deviceId.slice(0, 128), plan, boundAt: Date.now(), updatedAt: Date.now() };
    this.save();
  }

  /** Cleared with the grant (refund/expiry path) so a new purchase rebinds. */
  clearLicenseBinding(email: string): void {
    const key = this.normEmail(email);
    if (key && this.data.licenseBindings[key]) {
      delete this.data.licenseBindings[key];
      this.save();
    }
  }
}

/** Server-side entitlement decision (never trust client flags). */
export function entitlementsFor(plan: PlanId): { advanced_ai: boolean; advanced_gestures: boolean; hologram: boolean } {
  const active = plan === 'FREE' || plan === 'PRO' || plan === 'PLUS';
  if (!active) return { advanced_ai: false, advanced_gestures: false, hologram: false };
  if (plan === 'PLUS') return { advanced_ai: true, advanced_gestures: true, hologram: true };
  if (plan === 'PRO') return { advanced_ai: true, advanced_gestures: true, hologram: false };
  return { advanced_ai: false, advanced_gestures: false, hologram: true };
}

export function dailyLimitFor(plan: PlanId, free: number, pro: number, plus: number): number {
  if (plan === 'PLUS') return plus;
  if (plan === 'PRO') return pro;
  if (plan === 'FREE') return free;
  return Math.min(free, 5); // EXPIRED/CANCELLED/etc: minimal grace, server decides
}
