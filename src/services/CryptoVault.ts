/**
 * CryptoVault
 * Real cryptography via Web Crypto API (no new dependencies):
 * - PIN hashing: PBKDF2-HMAC-SHA256, 210,000 iterations, 128-bit salt
 * - File encryption: AES-GCM-256, key derived from PIN (separate salt), 96-bit IV per write
 *
 * Koi PIN/password plaintext me kabhi store nahi hota.
 */

const HASH_ITERATIONS = 210_000;
const KEY_ITERATIONS = 210_000;

export interface PinHash {
  algo: 'argon2id' | 'pbkdf2';
  /** argon2id: encoded string (params+salt+hash). pbkdf2: base64 hash */
  hash: string;
  /** pbkdf2 only: base64 salt + iterations */
  salt?: string;
  iterations?: number;
  /** argon2id only: encoded params (salt embedded) */
  encoded?: string;
}

let argon2Load: Promise<any> | null = null;

/** Argon2id module lazy-load (wasm: /argon2/*.wasm). Fail ho to null = PBKDF2 fallback */
async function loadArgon2(): Promise<any | null> {
  if (argon2Load) return argon2Load;
  argon2Load = (async () => {
    try {
      const g = globalThis as any;
      g.Module = g.Module || {};
      const prevLocate = g.Module.locateFile;
      g.Module.locateFile = (path: string) => {
        if (path.endsWith('.wasm')) return '/argon2/' + path.split('/').pop();
        return prevLocate ? prevLocate(path) : path;
      };
      // NOTE: package main (lib/argon2.js) Node-only hai (path/fs) — browser self-contained bundle use karo
      const mod = await import('argon2-browser/dist/argon2-bundled.min.js');
      // Warmup: wasm actually load hota hai ya nahi, ek chhota hash karke dekho
      await mod.hash({ pass: 'warmup', salt: 'warmup-salt-1234', time: 1, mem: 8192, hashLen: 16, parallelism: 1, type: mod.ArgonType.Argon2id });
      console.log('[CryptoVault] Argon2id ready');
      return mod;
    } catch (e) {
      console.warn('[CryptoVault] Argon2 unavailable, PBKDF2 fallback:', e);
      return null;
    }
  })();
  return argon2Load;
}

/** Preferred: Argon2id (memory-hard). Na chale to PBKDF2 fallback — hamesha honest flag ke saath */
export async function hashPin(pin: string): Promise<PinHash> {
  const a2 = await loadArgon2();
  if (a2) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const res = await a2.hash({
      pass: pin,
      salt,
      time: 3,
      mem: 65536,
      hashLen: 32,
      parallelism: 1,
      type: a2.ArgonType.Argon2id,
    });
    return { algo: 'argon2id', hash: res.hashHex, encoded: res.encoded };
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(pin, salt, HASH_ITERATIONS, 256);
  return { algo: 'pbkdf2', salt: bufToB64(salt), hash: bufToB64(hash), iterations: HASH_ITERATIONS };
}

/** PIN verify (algo auto-detect; purane PBKDF2 hash bhi chalte hain) */
export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
  try {
    if (stored.algo === 'argon2id' && stored.encoded) {
      const a2 = await loadArgon2();
      if (!a2) return false; // argon2 hash ko PBKDF2 se verify karna jhooth hoga
      try {
        const r: any = await a2.verify({ pass: pin, encoded: stored.encoded });
        // argon2-browser convention: resolve (undefined) = match, reject = mismatch.
        // Kuch builds { correct: boolean } dete hain — dono handle karo.
        if (r && typeof r.correct === 'boolean') return r.correct;
        return true;
      } catch {
        return false; // mismatch
      }
    }
    if (!stored.salt || !stored.iterations) return false;
    const salt = b64ToBytes(stored.salt);
    const expected = b64ToBytes(stored.hash);
    const actual = await pbkdf2(pin, salt, stored.iterations, expected.length * 8);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[]);
  }
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(pin: string, salt: Uint8Array, iterations: number, keyLenBits: number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    keyLenBits
  );
  return new Uint8Array(bits);
}

/** PIN se AES-GCM key derive karo (file encryption ke liye, alag salt) */
async function deriveAesKey(pin: string, saltB64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64) as BufferSource, iterations: KEY_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface EncryptedPayload {
  iv: string; // base64
  data: string; // base64
}

/** JSON-serializable data encrypt karo */
export async function encryptJSON(pin: string, saltB64: string, data: unknown): Promise<EncryptedPayload> {
  const key = await deriveAesKey(pin, saltB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, bytes as BufferSource);
  return { iv: bufToB64(iv), data: bufToB64(ct) };
}

/** Decrypt karo (galat PIN / corrupt data pe throw) */
export async function decryptJSON<T>(pin: string, saltB64: string, payload: EncryptedPayload): Promise<T> {
  const key = await deriveAesKey(pin, saltB64);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(payload.iv) as BufferSource },
    key,
    b64ToBytes(payload.data) as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

/** Naya encryption salt banao */
export function newSalt(): string {
  return bufToB64(crypto.getRandomValues(new Uint8Array(16)));
}
