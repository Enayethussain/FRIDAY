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
      const email = String(body.email ?? body.customer_email ?? '').trim().toLowerCase().slice(0, 128);
      const deviceId = String(body.deviceId ?? body.device_id ?? '').trim().slice(0, 128);
      if (!email || !email.includes('@')) {
        res.status(400).json({ success: false, code: 'EMAIL_REQUIRED', error: 'License check ke liye email chahiye.' });
        return;
      }
      if (!deviceId) {
        res.status(400).json({ success: false, code: 'DEVICE_REQUIRED', error: 'License check ke liye device ID chahiye.' });
        return;
      }
      // No active purchase -> nothing to bind; FREE users always pass.
      const grant = store.getEmailGrant(email);
      if (!grant) {
        res.json({ success: true, isAuthorized: true, licensed: false, plan: 'FREE', bound: false });
        return;
      }
      // First active-license sighting binds this device permanently.
      const binding = store.getLicenseBinding(email);
      if (!binding) {
        store.bindLicenseDevice(email, deviceId, grant.plan);
        res.json({ success: true, isAuthorized: true, licensed: true, plan: grant.plan, bound: true, boundAt: Date.now() });
        return;
      }
      // Same device -> pass. Different device -> anti-sharing reject.
      if (binding.deviceId === deviceId) {
        res.json({ success: true, isAuthorized: true, licensed: true, plan: grant.plan, bound: true, boundAt: binding.boundAt });
        return;
      }
      logError(`license device mismatch email=${redact(email)}`);
      res.json({
        success: true,
        isAuthorized: false,
        licensed: true,
        plan: grant.plan,
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
