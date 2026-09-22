import { Capacitor } from '@capacitor/core';
import { apiUrl } from '../lib/serverUrl';
import { globalDeviceLink } from './DeviceLinkManager';
import { ActionResult, actionFail, actionOk, classifyNativeError } from './ActionResult';

/**
 * REAL file transfer over the paired-device relay (server /api/ft/*).
 * Steps: manifest -> chunk upload (progress) -> receiver saves ->
 * receiver posts byte-count receipt -> sender verifies size match.
 * TRANSFER COMPLETE is reported ONLY when receiptSize === manifest size.
 * No transport, no pairing, no receipt => explicit failure, never success.
 */

export type FtPhase = 'idle' | 'reading' | 'uploading' | 'awaiting_receipt' | 'complete' | 'failed';
export interface FtProgress {
  phase: FtPhase;
  sentChunks: number;
  chunks: number;
  percent: number;
  detail: string;
}
export interface FtOffer {
  id: string;
  name: string;
  size: number;
  chunks: number;
  received: number;
  fromName: string;
  createdAt: number;
  sha256: string | null;
}

async function sha256HexBytes(buf: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', buf as unknown as BufferSource);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

const CHUNK_BIN = 48 * 1024; // 48 KB binary -> ~64 KB base64 per POST
const MAX_BYTES = 8 * 1024 * 1024;
const RECEIPT_TIMEOUT_MS = 5 * 60 * 1000;

async function authHeaders(): Promise<Record<string, string>> {
  return { 'Content-Type': 'application/json' };
}

async function ensureToken(): Promise<string> {
  const t = globalDeviceLink.getToken();
  if (t) return t;
  return globalDeviceLink.register();
}

async function postJson(path: string, body: Record<string, unknown>, timeoutMs = 30000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const j = (await res.json()) as { success?: boolean; error?: string } & Record<string, unknown>;
    if (!res.ok || !j.success) throw new Error((j.error as string) || `HTTP ${res.status}`);
    return j;
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(path: string, timeoutMs = 15000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl(path), { signal: ctrl.signal });
    const j = (await res.json()) as { success?: boolean; error?: string } & Record<string, unknown>;
    if (!res.ok || !j.success) throw new Error((j.error as string) || `HTTP ${res.status}`);
    return j;
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeName(name: string): string {
  return (name || 'file').split(/[\\/]/).pop()!.slice(0, 120) || 'file';
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class FileTransferService {
  /** Send a user-picked file to the paired device (or an explicit target). Verifies the receipt. */
  static async sendFile(file: File, onProgress?: (p: FtProgress) => void, targetDeviceId?: string, isCancelled?: () => boolean): Promise<ActionResult> {
    const started = Date.now();
    const lat = () => Date.now() - started;
    const prog = (phase: FtPhase, sentChunks: number, chunks: number, detail: string) =>
      onProgress?.({ phase, sentChunks, chunks, percent: chunks ? Math.round((sentChunks / chunks) * 100) : 0, detail });
    try {
      if (file.size <= 0 || file.size > MAX_BYTES) {
        return actionFail('FAILED', 'file_transfer', file.name, 'File 1 byte – 8 MB ke beech honi chahiye.', lat());
      }
      const token = await ensureToken().catch(() => null);
      if (!token) return actionFail('DEVICE_OFFLINE', 'file_transfer', file.name, 'Server se connect nahi ho paya. Internet check karo.', lat());
      const paired = await globalDeviceLink.getStatus().catch(() => ({ paired: null }));
      if (!paired.paired) {
        return actionFail('PERMISSION_REQUIRED', 'file_transfer', file.name, 'Koi paired device nahi hai. Pehle Device Link se pair karo.', lat());
      }

      prog('reading', 0, 0, `Reading ${file.name}…`);
      const buf = new Uint8Array(await file.arrayBuffer());
      if (buf.length !== file.size) {
        return actionFail('FAILED', 'file_transfer', file.name, 'File read nahi ho payi.', lat());
      }
      const chunks: string[] = [];
      for (let off = 0; off < buf.length; off += CHUNK_BIN) {
        chunks.push(bytesToB64(buf.subarray(off, off + CHUNK_BIN)));
      }
      const name = sanitizeName(file.name);
      const hash = await sha256HexBytes(buf);
      const begin = (await postJson('/api/ft/begin', { token, name, size: buf.length, chunks: chunks.length, sha256: hash, toDeviceId: targetDeviceId })) as { id: string; to?: string };
      const id = begin.id;

      for (let i = 0; i < chunks.length; i++) {
        if (isCancelled?.()) {
          prog('failed', i, chunks.length, 'Cancelled by user.');
          return actionFail('FAILED', 'file_transfer', file.name, 'Transfer cancel kar diya.', lat());
        }
        prog('uploading', i, chunks.length, `Uploading ${i + 1}/${chunks.length}…`);
        await postJson('/api/ft/chunk', { token, id, idx: i, data: chunks[i] });
        prog('uploading', i + 1, chunks.length, `Uploading ${i + 1}/${chunks.length}…`);
      }

      // Wait for the receiver's byte-count receipt (only success proof accepted).
      prog('awaiting_receipt', chunks.length, chunks.length, 'Verifying on receiver…');
      const deadline = Date.now() + RECEIPT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (isCancelled?.()) {
          prog('failed', chunks.length, chunks.length, 'Cancelled by user.');
          return actionFail('FAILED', 'file_transfer', name, 'Transfer cancel kar diya.', lat());
        }
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const r = (await getJson(`/api/ft/receipt?token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`)) as {
            complete?: boolean; receiptSize?: number; size?: number; hashOk?: boolean; wantsHash?: boolean;
          };
          if (r.complete && r.receiptSize === buf.length && (!r.wantsHash || r.hashOk === true)) {
            prog('complete', chunks.length, chunks.length, 'Transfer complete.');
            return actionOk('file_transfer', name, `Transfer complete. ${name} receiver par hash-verified ho gaya.`, lat());
          }
          if (r.complete) {
            prog('failed', chunks.length, chunks.length, 'Verification mismatch.');
            return actionFail('VERIFICATION_FAILED', 'file_transfer', name,
              `Receiver receipt match nahi hui (size ${r.receiptSize}, hashOk ${r.hashOk}).`, lat());
          }
        } catch { /* keep polling until deadline */ }
      }
      prog('failed', chunks.length, chunks.length, 'Receipt timeout.');
      return actionFail('TIMEOUT', 'file_transfer', name, 'Receiver se confirmation nahi mili (5 min). File poori pahunchi ya nahi, verify nahi hua.', lat());
    } catch (e) {
      prog('failed', 0, 0, 'Failed.');
      return classifyNativeError('file_transfer', file.name, e, lat());
    }
  }

  /** List pending incoming transfers (receiver must explicitly Accept). */
  static async listIncoming(): Promise<FtOffer[]> {
    try {
      const token = globalDeviceLink.getToken() || (await globalDeviceLink.register().catch(() => null));
      if (!token) return [];
      const j = (await getJson(`/api/ft/inbox?token=${encodeURIComponent(token)}`)) as { transfers?: FtOffer[] };
      return j.transfers ?? [];
    } catch {
      return [];
    }
  }

  /** Accept + download + save + verify + receipt. COMPLETE only after byte match. */
  static async acceptOffer(offer: FtOffer, onProgress?: (p: FtProgress) => void): Promise<ActionResult> {
    const started = Date.now();
    const lat = () => Date.now() - started;
    const prog = (phase: FtPhase, got: number, detail: string) =>
      onProgress?.({ phase, sentChunks: got, chunks: offer.chunks, percent: Math.round((got / offer.chunks) * 100), detail });
    try {
      const token = globalDeviceLink.getToken() || (await globalDeviceLink.register().catch(() => null));
      if (!token) return actionFail('DEVICE_OFFLINE', 'file_transfer', offer.name, 'Server se connect nahi ho paya.', lat());
      const parts: Uint8Array[] = [];
      let total = 0;
      for (let i = 0; i < offer.chunks; i++) {
        prog('uploading', i, `Downloading ${i + 1}/${offer.chunks}…`);
        const r = (await getJson(`/api/ft/chunk?token=${encodeURIComponent(token)}&id=${encodeURIComponent(offer.id)}&idx=${i}`, 30000)) as { data?: string };
        if (!r.data) {
          prog('failed', i, 'Chunk missing.');
          return actionFail('FAILED', 'file_transfer', offer.name, `Chunk ${i + 1} server par nahi mila. Sender upload poora kare.`, lat());
        }
        const bytes = b64ToBytes(r.data);
        parts.push(bytes);
        total += bytes.length;
        prog('uploading', i + 1, `Downloading ${i + 1}/${offer.chunks}…`);
      }
      if (total !== offer.size) {
        prog('failed', offer.chunks, 'Size mismatch.');
        return actionFail('VERIFICATION_FAILED', 'file_transfer', offer.name,
          `Download adhura hai (expected ${offer.size}, mila ${total}).`, lat());
      }
      const merged = new Uint8Array(total);
      let off = 0;
      for (const p of parts) { merged.set(p, off); off += p.length; }

      // Save + verify with a REAL byte count.
      let savedBytes = -1;
      if (Capacitor.getPlatform() !== 'web') {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const name = sanitizeName(offer.name);
        await Filesystem.writeFile({ path: `JARVIS/${name}`, data: bytesToB64(merged), directory: Directory.Documents, recursive: true });
        const stat = await Filesystem.stat({ path: `JARVIS/${name}`, directory: Directory.Documents });
        savedBytes = stat.size;
      } else {
        const blob = new Blob([merged as unknown as BlobPart], { type: 'application/octet-stream' });
        savedBytes = blob.size;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = sanitizeName(offer.name);
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
      }
      if (savedBytes !== offer.size) {
        prog('failed', offer.chunks, 'Save mismatch.');
        return actionFail('VERIFICATION_FAILED', 'file_transfer', offer.name,
          `Save verify nahi hua (expected ${offer.size}, saved ${savedBytes}).`, lat());
      }
      // Hash check (when the sender declared one) BEFORE confirming receipt.
      let hashOk: boolean | null = null;
      if (offer.sha256) {
        hashOk = (await sha256HexBytes(merged)) === offer.sha256.toLowerCase();
        if (!hashOk) {
          prog('failed', offer.chunks, 'Hash mismatch.');
          return actionFail('VERIFICATION_FAILED', 'file_transfer', offer.name,
            'SHA-256 mismatch — file corrupt hui hai, receipt nahi bheja.', lat());
        }
      }
      await postJson('/api/ft/receipt', { token, id: offer.id, receivedSize: savedBytes, hashOk: hashOk === true });
      prog('complete', offer.chunks, 'Transfer complete.');
      return actionOk('file_transfer', offer.name,
        Capacitor.getPlatform() !== 'web'
          ? `Transfer complete. Documents/JARVIS me save ho gaya (${savedBytes} bytes verified).`
          : `Transfer complete. ${savedBytes} bytes verified, download shuru ho gaya.`, lat());
    } catch (e) {
      prog('failed', 0, 'Failed.');
      return classifyNativeError('file_transfer', offer.name, e, lat());
    }
  }
}
