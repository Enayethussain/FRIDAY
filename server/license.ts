// License verification + one-device binding (anti-piracy).
// POST /api/license/check { email, deviceId }
// - No (or expired) grant   -> licensed:false,  isAuthorized:true  (FREE unaffected)
// - Active grant, first seen -> binds deviceId, isAuthorized:true, bound:true
// - Active grant, same device -> isAuthorized:true
// - Active grant, OTHER device -> isAuthorized:false (anti-sharing reject)
// All decisions server-side; the client only enforces the verdict.
import express from 'express';
import type { FridayStore } from './store.js';

export interface LicenseDeps {
  store: FridayStore;
  redact: (s: string) => string;
  log: (...a: any[]) => void;
  logError: (...a: any[]) => void;
}

// Simple per-IP rate limit: 30 checks / minute (blocks enumeration loops).
const buckets = new Map<string, { count: number; windowStart: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const e = buckets.get(ip);
  if (!e || now - e.windowStart > 60000) {
    buckets.set(ip, { count: 1, windowStart: now });
    return false;
  }
  e.count += 1;
  return e.count > 30;
}

function clientIp(req: express.Request): string {
  const fwd = String(req.headers['x-forwarded-for'] || '');
  return (fwd.split(',')[0] || '').trim() || req.ip || 'unknown';
}

// Shared verdict core: grant + binding state machine. Both the lenient
// app-boot gate (/api/license/check) and the strict paid gate
// (POST /api/check-license) read this — one state, two policies.
export type LicenseVerdict =
  | { kind: 'invalid'; code: 'EMAIL_REQUIRED' | 'DEVICE_REQUIRED' }
  | { kind: 'no_subscription' }
  | { kind: 'bound'; first: boolean; plan: 'PRO' | 'PLUS'; boundAt: number }
  | { kind: 'mismatch'; plan: 'PRO' | 'PLUS' };

export function verifyLicenseBinding(
  store: FridayStore, email: string, deviceId: string
): LicenseVerdict {
  const mail = String(email || '').trim().toLowerCase().slice(0, 128);
  const dev = String(deviceId || '').trim().slice(0, 128);
  if (!mail || !mail.includes('@')) return { kind: 'invalid', code: 'EMAIL_REQUIRED' };
  if (!dev) return { kind: 'invalid', code: 'DEVICE_REQUIRED' };
  const grant = store.getEmailGrant(mail);
  if (!grant) return { kind: 'no_subscription' };
  const binding = store.getLicenseBinding(mail);
  if (!binding) {
    store.bindLicenseDevice(mail, dev, grant.plan);
    return { kind: 'bound', first: true, plan: grant.plan, boundAt: Date.now() };
  }
  if (binding.deviceId === dev) {
    return { kind: 'bound', first: false, plan: grant.plan, boundAt: binding.boundAt };
  }
  return { kind: 'mismatch', plan: grant.plan };
}

export function createLicenseRouter(deps: LicenseDeps): express.Router {
  const { store, redact, logError } = deps;
  const r = express.Router();

  r.post('/check', express.json({ limit: '8kb' }), (req, res) => {
    try {
      const ip = clientIp(req);
      if (limited(ip)) {
        res.status(429).json({ success: false, code: 'RATE_LIMITED', error: 'Bahut jaldi-jaldi. Thoda ruk kar try karo.' });
        return;
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const verdict = verifyLicenseBinding(
        store,
        String(body.email ?? body.customer_email ?? ''),
        String(body.deviceId ?? body.device_id ?? '')
      );
      if (verdict.kind === 'invalid') {
        res.status(400).json({
          success: false,
          code: verdict.code,
          error: verdict.code === 'EMAIL_REQUIRED' ? 'License check ke liye email chahiye.' : 'License check ke liye device ID chahiye.',
        });
        return;
      }
      // Lenient policy: no active purchase -> nothing to bind; FREE users pass.
      if (verdict.kind === 'no_subscription') {
        res.json({ success: true, isAuthorized: true, licensed: false, plan: 'FREE', bound: false });
        return;
      }
      if (verdict.kind === 'bound') {
        res.json({ success: true, isAuthorized: true, licensed: true, plan: verdict.plan, bound: true, boundAt: verdict.boundAt });
        return;
      }
      logError(`license device mismatch email=${redact(String(body.email ?? ''))}`);
      res.json({
        success: true,
        isAuthorized: false,
        licensed: true,
        plan: verdict.plan,
        bound: true,
        reason: 'DEVICE_MISMATCH',
        message: 'Ye license kisi aur device par active hai. Ek license = ek device.',
      });
    } catch (e: any) {
      logError(`license check exception: ${redact(String(e?.message || e)).slice(0, 120)}`);
      // Fail OPEN on server error (never lock paying users on a crash);
      // the next successful check enforces honestly.
      res.json({ success: true, isAuthorized: true, licensed: false, plan: 'FREE', bound: false, degraded: true });
    }
  });

  return r;
}

/**
 * Strict paid gate: POST /api/check-license { email, deviceId }.
 * Exact contract — no active subscription is itself a reject:
 *   none      -> { isAuthorized:false, message:'No active subscription found.' }
 *   first     -> { isAuthorized:true,  message:'Device bound successfully.' }
 *   match     -> { isAuthorized:true,  message:'Access granted.' }
 *   mismatch  -> { isAuthorized:false, message:'License is already bound to another device. Sharing is not allowed.' }
 */
export function createStrictLicenseHandler(deps: LicenseDeps): express.RequestHandler {
  const { store, redact, logError } = deps;
  return (req, res) => {
    try {
      const ip = clientIp(req);
      if (limited(ip)) {
        res.status(429).json({ success: false, isAuthorized: false, code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' });
        return;
      }
      const body = (req.body || {}) as Record<string, unknown>;
      // --- License-key flow (Telegram bot sales): { licenseKey, deviceId }.
      // Takes precedence when a key is supplied. Null deviceId = first
      // activation binds this phone; a different phone is rejected.
      const rawKey = String(body.licenseKey ?? body.license_key ?? '').trim();
      if (rawKey) {
        const keyDeviceId = String(body.deviceId ?? body.device_id ?? '').trim().slice(0, 128);
        if (!keyDeviceId) {
          res.status(400).json({ success: false, isAuthorized: false, code: 'DEVICE_REQUIRED', message: 'Email and deviceId are required.' });
          return;
        }
        const record = store.getLicense(rawKey);
        if (!record) {
          res.json({ success: true, isAuthorized: false, licensed: false, message: 'Invalid license key.' });
          return;
        }
        if (record.status !== 'active') {
          res.json({ success: true, isAuthorized: false, licensed: true, plan: record.plan, message: 'License is not active.' });
          return;
        }
        if (!record.deviceId) {
          store.bindLicenseDeviceKey(rawKey, keyDeviceId);
          res.json({ success: true, isAuthorized: true, licensed: true, plan: record.plan, bound: true, message: 'Device bound successfully.' });
          return;
        }
        if (record.deviceId === keyDeviceId) {
          res.json({ success: true, isAuthorized: true, licensed: true, plan: record.plan, bound: true, message: 'Access granted.' });
          return;
        }
        logError('license key device mismatch');
        res.json({ success: true, isAuthorized: false, licensed: true, plan: record.plan, reason: 'DEVICE_MISMATCH', message: 'Device limit reached. License is bound to another phone.' });
        return;
      }
      const verdict = verifyLicenseBinding(
        store,
        String(body.email ?? body.customer_email ?? ''),
        String(body.deviceId ?? body.device_id ?? '')
      );
      if (verdict.kind === 'invalid') {
        res.status(400).json({
          success: false,
          isAuthorized: false,
          code: verdict.code,
          message: verdict.code === 'EMAIL_REQUIRED' ? 'Email and deviceId are required.' : 'Email and deviceId are required.',
        });
        return;
      }
      if (verdict.kind === 'no_subscription') {
        res.json({ success: true, isAuthorized: false, licensed: false, message: 'No active subscription found.' });
        return;
      }
      if (verdict.kind === 'bound') {
        res.json({
          success: true,
          isAuthorized: true,
          licensed: true,
          plan: verdict.plan,
          bound: true,
          message: verdict.first ? 'Device bound successfully.' : 'Access granted.',
        });
        return;
      }
      logError(`license strict mismatch email=${redact(String(body.email ?? ''))}`);
      res.json({
        success: true,
        isAuthorized: false,
        licensed: true,
        plan: verdict.plan,
        reason: 'DEVICE_MISMATCH',
        message: 'License is already bound to another device. Sharing is not allowed.',
      });
    } catch (e: any) {
      logError(`license strict exception: ${redact(String(e?.message || e)).slice(0, 120)}`);
      // Strict gate fails CLOSED on crash (paid gate; retry is cheap).
      res.status(500).json({ success: false, isAuthorized: false, message: 'License verification failed. Try again.' });
    }
  };
}
