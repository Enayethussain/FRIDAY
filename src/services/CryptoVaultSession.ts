/**
 * CryptoVaultSession
 * PIN se derived CryptoKey ko memory me rakhkar encrypt/decrypt.
 * PIN khud memory me store nahi hota; lock par key wipe ho jaati hai.
 */
import type { EncryptedPayload } from './CryptoVault';

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)) as number[]);
  }
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** PIN + salt se non-extractable AES-GCM session key derive karo */
export async function deriveKeyForSession(pin: string, saltB64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64) as BufferSource, iterations: 210_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptWithKey(key: CryptoKey, data: unknown): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, bytes as BufferSource);
  return { iv: bufToB64(iv), data: bufToB64(ct) };
}

export async function decryptWithKey<T>(key: CryptoKey, payload: EncryptedPayload): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(payload.iv) as BufferSource },
    key,
    b64ToBytes(payload.data) as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
