import { apiUrl } from '../lib/serverUrl';
import { globalDeviceLink } from './DeviceLinkManager';
import { globalIdentity } from './DeviceIdentity';

/**
 * DeviceManager (§21) — secure owner-controlled device pairing registry client.
 * Every installation is an Ed25519 identity; the server never sees private keys.
 * Sensitive calls are per-request signed (timestamp + nonce) with short-lived
 * access tokens. Nothing here bypasses OS security — it only establishes
 * which JARVIS boxes trust each other.
 */

export interface PermSet { basic: boolean; ft: boolean; cmd: boolean; notify: boolean; screen: boolean; }
export interface RegistryDevice {
  deviceId: string;
  name: string;
  kind: string;
  online: boolean;
  pairedAt: number | null;
  lastSeen: number;
  revoked: boolean;
  hasIdentity: boolean;
  myPerms?: PermSet | null;
  theirPerms?: PermSet | null;
}
export interface PairBegin { sessionId: string; code: string; expiresAt: number; qrText: string; }
export interface AuditEntry { t: number; actor: string; actorName: string; action: string; target?: string; result: string; }

function sha256HexSync(_s: string): Promise<string> {
  // async wrapper (SubtleCrypto) kept promise-based for uniformity
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(_s)).then((b) => {
    const v = new Uint8Array(b);
    return Array.from(v).map((x) => x.toString(16).padStart(2, '0')).join('');
  });
}

class DeviceManagerService {
  private access: { token: string; exp: number } | null = null;

  private deviceKind(): string {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    if (/Mobile/i.test(ua)) return 'mobile';
    return 'pc';
  }

  private async v1Token(): Promise<string> {
    const t = globalDeviceLink.getToken();
    if (t) return t;
    return globalDeviceLink.register();
  }

  /** Upload my PUBLIC key + identity (links crypto identity to this install). */
  async registerIdentity(): Promise<{ deviceId: string }> {
    const { deviceId, pubkeyB64 } = await globalIdentity.ensure();
    const token = await this.v1Token();
    const res = await fetch(apiUrl('/api/v2/identity'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, deviceId, name: globalDeviceLink.getDeviceName(), kind: this.deviceKind(), pubkey: pubkeyB64 }),
    });
    const j = await res.json();
    if (!j.success) throw new Error(j.error || 'Identity register failed');
    return { deviceId: j.deviceId };
  }

  private async fetchAuth(): Promise<{ token: string }> {
    if (this.access && this.access.exp - Date.now() > 120000) return { token: this.access.token };
    const { deviceId } = await globalIdentity.ensure();
    const nRes = await fetch(apiUrl('/api/v2/auth/nonce'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
    const nj = await nRes.json();
    if (!nj.success) throw new Error(nj.error || 'AUTHENTICATION_FAILED');
    const ts = Date.now();
    const sig = await globalIdentity.signText(`auth|${nj.nonce}|${ts}|${deviceId}`);
    const vRes = await fetch(apiUrl('/api/v2/auth/verify'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, nonce: nj.nonce, ts, signature: sig }),
    });
    const vj = await vRes.json();
    if (!vj.success) throw new Error(vj.error || 'AUTHENTICATION_FAILED');
    this.access = { token: vj.accessToken, exp: Date.now() + vj.expiresIn * 1000 };
    return { token: vj.accessToken };
  }

  /** Signed request with one transparent retry after re-auth. */
  async signedFetch(path: string, method: string, body?: Record<string, unknown>): Promise<unknown> {
    const { deviceId } = await globalIdentity.ensure();
    const doOnce = async (freshAuth: boolean): Promise<unknown> => {
      if (freshAuth) this.access = null;
      const { token } = await this.fetchAuth();
      const bodyStr = body ? JSON.stringify(body) : '';
      const ts = Date.now();
      const nonce = `c-${ts.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const bodyHash = await sha256HexSync(bodyStr);
      const sig = await globalIdentity.signText(`v1|${ts}|${nonce}|${method}|${path}|${bodyHash}`);
      const res = await fetch(apiUrl(path), {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Dev-Id': deviceId,
          'X-TS': String(ts),
          'X-Nonce': nonce,
          'X-Sig': sig,
        },
        body: bodyStr || undefined,
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        const err = new Error((j.error as string) || `HTTP ${res.status}`) as Error & { code?: string };
        err.code = (j.error as string) || '';
        throw err;
      }
      return j;
    };
    try {
      return await doOnce(false);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || '';
      if (/INVALID_TOKEN|expired/i.test(msg)) return doOnce(true);
      throw e;
    }
  }

  // ---- pairing flow ----
  async beginPairing(): Promise<PairBegin> {
    const token = await this.v1Token();
    const res = await fetch(apiUrl('/api/v2/pair/begin'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const j = await res.json();
    if (!j.success) throw new Error(j.error || 'Pair begin failed');
    const server = (() => {
      try {
        const b = localStorage.getItem('FRIDAY_SERVER_URL');
        if (b) return b.replace(/\/$/, '');
      } catch { /* noop */ }
      return window.location.origin;
    })();
    const qrText = JSON.stringify({ v: 1, server, session: j.sessionId, code: j.code, exp: j.expiresAt });
    return { sessionId: j.sessionId, code: j.code, expiresAt: j.expiresAt, qrText };
  }

  async pollPair(sessionId: string): Promise<{ state: string; guest?: { deviceId: string; name: string }; expiresAt?: number }> {
    const token = await this.v1Token();
    const res = await fetch(apiUrl(`/api/v2/pair/poll?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sessionId)}`));
    const j = await res.json();
    if (!j.success) throw new Error(j.error || 'Poll failed');
    return j;
  }

  async decidePair(sessionId: string, approve: boolean, perms?: PermSet): Promise<unknown> {
    const token = await this.v1Token();
    const res = await fetch(apiUrl('/api/v2/pair/decide'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, sessionId, approve, perms }),
    });
    const j = await res.json();
    if (!j.success) throw new Error(j.error || 'Decide failed');
    return j;
  }

  async joinPair(sessionId: string, code: string): Promise<{ hostName: string }> {
    await this.registerIdentity();
    const token = await this.v1Token();
    const { pubkeyB64 } = await globalIdentity.ensure();
    const res = await fetch(apiUrl('/api/v2/pair/join'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, sessionId, code, pubkey: pubkeyB64 }),
    });
    const j = await res.json();
    if (!j.success) throw new Error(j.error || 'Join failed');
    return { hostName: j.hostName };
  }

  async pairResult(sessionId: string): Promise<{ state: string; host?: { deviceId: string; name: string } }> {
    const token = await this.v1Token();
    const res = await fetch(apiUrl(`/api/v2/pair/result?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sessionId)}`));
    const j = await res.json();
    if (!j.success) throw new Error(j.error || 'Result failed');
    return j;
  }

  // ---- registry ----
  async listDevices(): Promise<{ self: RegistryDevice; devices: RegistryDevice[] }> {
    const j = (await this.signedFetch('/api/v2/devices', 'GET')) as { self: RegistryDevice; devices: RegistryDevice[] };
    return { self: j.self, devices: j.devices };
  }

  async rename(alias: string): Promise<void> {
    await this.signedFetch('/api/v2/device/rename', 'POST', { alias });
  }

  async setPermissions(targetId: string, perms: PermSet): Promise<void> {
    await this.signedFetch('/api/v2/device/permissions', 'POST', { targetId, perms });
  }

  async revoke(targetId: string): Promise<void> {
    await this.signedFetch('/api/v2/device/revoke', 'POST', { targetId });
    this.access = null;
  }

  async remove(targetId: string): Promise<void> {
    await this.signedFetch('/api/v2/device/remove', 'POST', { targetId });
  }

  async audit(): Promise<AuditEntry[]> {
    const j = (await this.signedFetch('/api/v2/audit', 'GET')) as { entries: AuditEntry[] };
    return j.entries;
  }

  /** Resolve an owner alias/name to a deviceId. Throws (with candidates) when ambiguous. */
  async resolveTarget(name: string): Promise<RegistryDevice> {
    const { devices } = await this.listDevices();
    const q = name.trim().toLowerCase();
    const exact = devices.filter((d) => (d.name || '').toLowerCase() === q);
    if (exact.length === 1) return exact[0];
    const partial = devices.filter((d) => (d.name || '').toLowerCase().includes(q));
    if (partial.length === 1) return partial[0];
    const cands = (exact.length > 1 ? exact : partial).map((d) => d.name).join(', ');
    if (cands) throw new Error(`Which phone, Sir? (${cands})`);
    throw new Error(`Koi device "${name}" naam se paired nahi hai.`);
  }
}

export const globalDeviceManager = new DeviceManagerService();
