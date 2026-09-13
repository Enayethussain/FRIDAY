import { apiUrl } from '../lib/serverUrl';
/**
 * DeviceLinkManager
 * PC <-> Phone real relay client (server /api/devices/* ke saath):
 * - register, pairing code, pair, send, inbox poll, status
 * - Token + deviceId localStorage me. Koi FCM nahi — polling relay (works LAN + internet).
 */

export interface PairedInfo {
  deviceId: string;
  name: string;
  kind: string;
  online: boolean;
}

export interface InboxMessage {
  id: string;
  fromDeviceId: string;
  fromName: string;
  payload: string;
  t: number;
}

const DEVICE_ID_KEY = 'friday_device_id';
const DEVICE_TOKEN_KEY = 'friday_device_token';
const DEVICE_NAME_KEY = 'friday_device_name';

export class DeviceLinkManager {
  private deviceId: string;
  private token: string | null = null;
  private pollTimer: any = null;
  private listeners: Set<(messages: InboxMessage[]) => void> = new Set();

  constructor() {
    let id: string | null = null;
    try {
      id = localStorage.getItem(DEVICE_ID_KEY);
      this.token = localStorage.getItem(DEVICE_TOKEN_KEY);
    } catch {}
    if (!id) {
      id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        localStorage.setItem(DEVICE_ID_KEY, id);
      } catch {}
    }
    this.deviceId = id;
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  getToken(): string | null {
    return this.token;
  }

  getDeviceName(): string {
    try {
      return localStorage.getItem(DEVICE_NAME_KEY) || this.defaultName();
    } catch {
      return this.defaultName();
    }
  }

  setDeviceName(name: string): void {
    try {
      localStorage.setItem(DEVICE_NAME_KEY, name.trim().slice(0, 60) || this.defaultName());
    } catch {}
  }

  private defaultName(): string {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'FRIDAY Phone';
    if (/Mobile/i.test(ua)) return 'FRIDAY Mobile';
    return 'FRIDAY PC';
  }

  private deviceKind(): string {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    if (/Mobile/i.test(ua)) return 'mobile';
    return 'pc';
  }

  async register(): Promise<string> {
    const res = await fetch(apiUrl('/api/devices/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: this.deviceId, name: this.getDeviceName(), kind: this.deviceKind() }),
    });
    const j = await res.json();
    if (!j.success) throw new Error(j.error || 'Register failed');
    this.token = j.token;
    try {
      localStorage.setItem(DEVICE_TOKEN_KEY, j.token);
    } catch {}
    return j.token;
  }

  private async ensureToken(): Promise<string> {
    if (this.token) return this.token;
    return this.register();
  }

  /** Server restart par token invalid ho jata hai (in-memory map) — 401 par ek baar re-register + retry */
  private async withFreshToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
    try {
      return await fn(await this.ensureToken());
    } catch (e: unknown) {
      const msg = String((e as Error)?.message || '');
      if (msg.toLowerCase().includes('invalid token')) {
        this.token = null;
        try {
          localStorage.removeItem(DEVICE_TOKEN_KEY);
        } catch {}
        return await fn(await this.register());
      }
      throw e;
    }
  }

  async createCode(): Promise<string> {
    return this.withFreshToken(async (token) => {
      const res = await fetch(apiUrl('/api/devices/code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'Code failed');
      return j.code;
    });
  }

  async pairWithCode(code: string): Promise<{ pairedWith: string; pairedName: string }> {
    return this.withFreshToken(async (token) => {
      const res = await fetch(apiUrl('/api/devices/pair'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, code: code.trim() }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'Pair failed');
      return { pairedWith: j.pairedWith, pairedName: j.pairedName };
    });
  }

  async unpair(): Promise<void> {
    await this.withFreshToken(async (token) => {
      await fetch(apiUrl('/api/devices/unpair'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    }).catch(() => {});
  }

  async send(payload: string, toDeviceId?: string): Promise<string> {
    return this.withFreshToken(async (token) => {
      const res = await fetch(apiUrl('/api/devices/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, payload, toDeviceId }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'Send failed');
      return j.id;
    });
  }

  async fetchInbox(): Promise<{ messages: InboxMessage[]; pairedWith: string | null }> {
    return this.withFreshToken(async (token) => {
      const res = await fetch(apiUrl(`/api/devices/inbox?token=${encodeURIComponent(token)}`));
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'Inbox failed');
      return { messages: j.messages || [], pairedWith: j.pairedWith || null };
    });
  }

  async getStatus(): Promise<{ paired: PairedInfo | null }> {
    return this.withFreshToken(async (token) => {
      const res = await fetch(apiUrl(`/api/devices/status?token=${encodeURIComponent(token)}`));
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'Status failed');
      return { paired: j.paired || null };
    });
  }

  /** Inbox polling shuru karo (default 5s) — naye messages par listeners fire */
  startPolling(intervalMs = 5000): void {
    this.stopPolling();
    const poll = async () => {
      try {
        const { messages } = await this.fetchInbox();
        if (messages.length > 0) {
          this.listeners.forEach((fn) => {
            try {
              fn(messages);
            } catch {}
          });
        }
      } catch {}
    };
    poll();
    this.pollTimer = setInterval(poll, intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  onMessage(fn: (messages: InboxMessage[]) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const globalDeviceLink = new DeviceLinkManager();
