// License-key minting for Telegram bot sales.
// Format: FRIDAY-XXXX-XXXX (8 random uppercase alphanumerics).
// crypto-secure; collisions resolved by re-rolling against the store.
import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion

function randomGroup(n: number): string {
  const bytes = randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Mint a unique key; exists() checks the registry (rehydrates on collision). */
export function generateLicenseKey(exists: (key: string) => boolean): string {
  for (let i = 0; i < 10; i++) {
    const key = `FRIDAY-${randomGroup(4)}-${randomGroup(4)}`;
    if (!exists(key)) return key;
  }
  // Astronomically unlikely fallback: timestamp suffix keeps uniqueness.
  return `FRIDAY-${randomGroup(4)}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
}
