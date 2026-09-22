// AiBackendService — the ONLY path the app uses for cloud AI.
// Phone -> HTTPS FRIDAY backend -> AI router -> provider. The app never holds
// API keys, never picks models, never uses localhost in production, and never
// downloads AI models. v1 first, legacy /api/chat as backward-compatible
// fallback for older backends.
import { apiUrl } from '../lib/serverUrl';

export type NetState =
  | 'ONLINE'
  | 'OFFLINE'
  | 'CONNECTING'
  | 'SERVER_UNAVAILABLE'
  | 'AUTH_EXPIRED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'RATE_LIMITED';

export interface BackendChatResult {
  ok: boolean;
  reply: string;
  code: string;
  netState: NetState;
}

function deviceId(): string {
  try {
    let id = localStorage.getItem('friday_device_id') || '';
    if (!id) {
      id = `web-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem('friday_device_id', id);
    }
    return id;
  } catch {
    return 'web-unknown';
  }
}

async function postJson(url: string, body: unknown, timeoutMs: number): Promise<{ status: number; json: any }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

function mapStatus(status: number, code: string): NetState {
  if (status === 429 || code === 'RATE_LIMITED' || code === 'QUOTA_EXHAUSTED') return 'RATE_LIMITED';
  if (status === 401 || status === 403 || code === 'ACCOUNT_DISABLED') return 'AUTH_EXPIRED';
  if (status === 503 || status === 502 || status === 504) return 'AI_PROVIDER_UNAVAILABLE';
  if (status === 0) return 'OFFLINE';
  return 'SERVER_UNAVAILABLE';
}

/** Detects Hinglish/English/Hindi for the backend language hint. */
export function detectLanguageHint(text: string): 'en' | 'hi' | 'hinglish' {
  const t = text || '';
  if (/[\u0900-\u097F]/.test(t)) return /[a-zA-Z]/.test(t) ? 'hinglish' : 'hi';
  const hints = ['kholo', 'khol', 'batao', 'karo', 'kya', 'kaise', 'mujhe', 'meri', 'mera', 'aur', 'phir', 'awaz', 'mausam'];
  const lower = t.toLowerCase();
  if (hints.some((h) => lower.includes(h))) return 'hinglish';
  return 'en';
}

export async function sendBackendChat(message: string, timeoutMs = 45000): Promise<BackendChatResult> {
  const text = (message || '').trim().slice(0, 2000);
  if (!text) {
    return { ok: false, reply: 'Sir, message samajh nahi aaya. Dobara bhejo.', code: 'INVALID_REQUEST', netState: 'ONLINE' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, reply: 'Sir, internet connection nahi hai.', code: 'OFFLINE', netState: 'OFFLINE' };
  }
  const body = {
    message: text,
    conversation_id: 'commander',
    language: detectLanguageHint(text),
    device_id: deviceId(),
  };
  // v1 (AI router) first.
  try {
    const { status, json } = await postJson(apiUrl('/api/v1/chat'), body, timeoutMs);
    if (json && json.success) {
      const reply = String(json.reply ?? json.response ?? json.message ?? json.text ?? '').trim();
      if (reply) return { ok: true, reply, code: 'PROVIDER_OK', netState: 'ONLINE' };
      return { ok: false, reply: 'Sir, server ne khaali jawab bheja. Dobara try karo.', code: 'EMPTY_REPLY', netState: 'AI_PROVIDER_UNAVAILABLE' };
    }
    const code = String(json?.code || '');
    // 404 = older backend without v1 -> fall through to legacy below.
    if (status !== 404) {
      return {
        ok: false,
        reply: String(json?.error || 'Sir, AI request fail ho gayi. Dobara try kijiye.'),
        code: code || `HTTP_${status}`,
        netState: mapStatus(status, code),
      };
    }
  } catch (e: any) {
    if ((e as Error)?.name === 'AbortError') {
      return { ok: false, reply: 'Sir, AI service se jawab aane me bahut time lag raha hai. Dobara try kijiye.', code: 'PROVIDER_TIMEOUT', netState: 'AI_PROVIDER_UNAVAILABLE' };
    }
    // Network failure on v1: try legacy once (same backend, old route) before
    // declaring offline — never invent success.
  }
  // Legacy fallback (same backend, pre-v1 route).
  try {
    const { status, json } = await postJson(apiUrl('/api/chat'), { message: text, sessionId: 'commander' }, timeoutMs);
    if (json && json.success) {
      const reply = String(json.reply ?? json.response ?? json.message ?? json.text ?? '').trim();
      if (reply) return { ok: true, reply, code: 'PROVIDER_OK', netState: 'ONLINE' };
      return { ok: false, reply: 'Sir, server ne khaali jawab bheja. Dobara try karo.', code: 'EMPTY_REPLY', netState: 'AI_PROVIDER_UNAVAILABLE' };
    }
    const code = String(json?.code || json?.error || '');
    return {
      ok: false,
      reply: String(json?.error || json?.reply || 'Sir, AI request fail ho gayi. Dobara try kijiye.'),
      code: code || `HTTP_${status}`,
      netState: mapStatus(status, code),
    };
  } catch (e: any) {
    if ((e as Error)?.name === 'AbortError') {
      return { ok: false, reply: 'Sir, response aane me bahut time lag raha hai (timeout). Dobara try karo.', code: 'PROVIDER_TIMEOUT', netState: 'AI_PROVIDER_UNAVAILABLE' };
    }
    return { ok: false, reply: 'Sir, FRIDAY server reachable nahi hai. Check karo server chal raha hai.', code: 'OFFLINE', netState: 'OFFLINE' };
  }
}

export interface AccountInfo {
  user: { id: string; plan: string; status: string };
  entitlements: { advanced_ai: boolean; advanced_gestures: boolean; hologram: boolean };
  // Additive v1 fields (absent on older backends).
  plan?: string;
  subscription_status?: string;
  subscription?: { status: string; productId: string; expiryAt: number; autoRenew: boolean };
  entitlements_full?: Record<string, boolean>;
  devices_used?: number;
  max_devices?: number;
  device_limited?: boolean;
}

export async function fetchAccount(): Promise<AccountInfo | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(apiUrl(`/api/v1/account?device_id=${encodeURIComponent(deviceId())}`), { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    if (!j || !j.user) return null;
    return j as AccountInfo;
  } catch {
    return null;
  }
}
