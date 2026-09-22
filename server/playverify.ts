// Play Developer API purchase verification (server-side only).
// Flow: service-account JWT (RS256, node:crypto — no new dependencies) ->
// OAuth2 access token -> purchases.subscriptionsv2.get(package, token).
// Credentials come ONLY from PLAY_SERVICE_ACCOUNT_JSON env (never the APK).
// Without credentials, verification is honestly unavailable (501) and nothing
// is granted. Package name must be com.friday.ai.
import { createSign } from 'node:crypto';

const PACKAGE_NAME = 'com.friday.ai';

export type PlayLifecycle =
  | 'ACTIVE' | 'GRACE' | 'PENDING' | 'CANCELED_ACTIVE'
  | 'ACCOUNT_HOLD' | 'PAUSED' | 'EXPIRED';

export type PlayVerifyOutcome =
  | {
      ok: true;
      state: PlayLifecycle;
      expiryAt: number;
      autoRenewing: boolean;
      startTime: number;
      hasLinkedPurchase: boolean;
      productId: string;
    }
  | { ok: false; code: 'NOT_CONFIGURED' | 'INVALID_TOKEN' | 'INVALID_PRODUCT' | 'PACKAGE_MISMATCH' | 'NETWORK_ERROR' };

function b64url(input: Buffer | string): string {
  const b = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function loadCreds(): { clientEmail: string; privateKey: string } | null {
  try {
    const j = JSON.parse(process.env.PLAY_SERVICE_ACCOUNT_JSON || '');
    if (j && j.client_email && j.private_key) {
      return { clientEmail: String(j.client_email), privateKey: String(j.private_key) };
    }
  } catch { /* invalid JSON -> not configured */ }
  return null;
}

async function accessToken(clientEmail: string, privateKey: string, timeoutMs: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  signer.end();
  const signature = b64url(signer.sign(privateKey));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(`${header}.${claims}.${signature}`)}`,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`token HTTP ${res.status}`);
    const j: any = await res.json().catch(() => null);
    if (!j || !j.access_token) throw new Error('no access token');
    return String(j.access_token);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Verifies a Play purchase token for a catalog product. Returns the normalized
 * subscription state; only ACTIVE/GRACE/CANCELED_ACTIVE (future expiry) grant
 * entitlement, decided by the caller via billing.effectivePlan.
 */
export async function verifyPlayPurchase(
  productId: string,
  purchaseToken: string,
  packageName: string,
  timeoutMs = 15000
): Promise<PlayVerifyOutcome> {
  if (!purchaseToken || purchaseToken.length < 8) {
    return { ok: false, code: 'INVALID_TOKEN' };
  }
  if (packageName !== PACKAGE_NAME) {
    return { ok: false, code: 'PACKAGE_MISMATCH' };
  }
  const creds = loadCreds();
  if (!creds) {
    return { ok: false, code: 'NOT_CONFIGURED' };
  }
  try {
    const token = await accessToken(creds.clientEmail, creds.privateKey, timeoutMs);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
      if (res.status === 404 || res.status === 400) {
        return { ok: false, code: 'INVALID_TOKEN' };
      }
      if (!res.ok) {
        return { ok: false, code: 'NETWORK_ERROR' };
      }
      const j: any = await res.json().catch(() => null);
      const line = j?.lineItems?.[0] || {};
      const rawState: string = String(j?.subscriptionState || '').toUpperCase().replace('SUBSCRIPTION_STATE_', '');
      const expiryAt = Date.parse(String(line?.expiryTime || '')) || 0;
      const autoRenewing = line?.autoRenewing === true;
      const startTime = Date.parse(String(j?.startTime || '')) || 0;
      const hasLinkedPurchase = !!j?.linkedPurchaseToken;
      const gotProduct = String(line?.productId || '');
      if (gotProduct && gotProduct !== productId) {
        return { ok: false, code: 'INVALID_PRODUCT' };
      }
      const base = { expiryAt, autoRenewing, startTime, hasLinkedPurchase, productId };
      if (rawState === 'ACTIVE') return { ok: true, state: 'ACTIVE', ...base };
      if (rawState === 'IN_GRACE_PERIOD') return { ok: true, state: 'GRACE', ...base };
      if (rawState === 'ON_HOLD') return { ok: true, state: 'ACCOUNT_HOLD', ...base };
      if (rawState === 'PAUSED') return { ok: true, state: 'PAUSED', ...base };
      if (rawState === 'PENDING') return { ok: true, state: 'PENDING', ...base };
      if (rawState === 'CANCELED') {
        return { ok: true, state: expiryAt > Date.now() ? 'CANCELED_ACTIVE' : 'EXPIRED', ...base };
      }
      return { ok: true, state: 'EXPIRED', ...base };
    } finally {
      clearTimeout(t);
    }
  } catch {
    return { ok: false, code: 'NETWORK_ERROR' };
  }
}
