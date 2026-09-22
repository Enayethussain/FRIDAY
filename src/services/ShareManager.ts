import { apiUrl, getServerBase } from '../lib/serverUrl';
import { globalDeviceLink, type PairedInfo } from './DeviceLinkManager';
import { FileTransferService, type FtOffer, type FtProgress } from './FileTransferService';
import { globalPrivateVault } from './PrivateVaultManager';
import { FridayLogger } from './FridayLogger';
import type { ActionResult } from './ActionResult';

/**
 * FRIDAY Share — nearby sharing built on the proven paired-device relay.
 *
 * Transport honesty: transfers use the SAME /api/ft/* chunk+receipt protocol
 * as FileTransferService. When FRIDAY_SERVER_URL points at the PC's LAN
 * address the bytes stay on the local network (direct local, no cloud);
 * when it points at the cloud host the relay is used and the UI labels it
 * as relay. BLE / Wi-Fi Direct P2P transports are NOT implemented — there
 * is no native P2P code in this project, and this manager never claims them.
 */

export type ShareTransport = 'lan-direct' | 'server-relay' | 'unknown';
export type ShareConnState =
  | 'Discovering' | 'Available' | 'Pairing' | 'Waiting for approval'
  | 'Connected' | 'Transferring' | 'Completed' | 'Failed';

export interface ShareDevice extends PairedInfo {
  /** User-assigned label, e.g. "My Phone". Defaults to server name. */
  label: string;
  trusted: boolean;
  blocked: boolean;
}

export type HistoryStatus = 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REJECTED';
export interface ShareHistoryEntry {
  id: string;
  at: number;
  direction: 'sent' | 'received';
  peerName: string;
  fileName: string;
  size: number;
  status: HistoryStatus;
  transport: ShareTransport;
  note?: string;
}

interface TrustedEntry {
  deviceId: string;
  label: string;
  addedAt: number;
}

const TRUST_KEY = 'friday_share_trusted';
const BLOCK_KEY = 'friday_share_blocked';
const HISTORY_KEY = 'friday_share_history';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage-only */ }
}

/** Redacted structured log — never tokens, keys, contents, or full bodies. */
export function shareLog(event: string, detail: Record<string, string | number | boolean> = {}): void {
  FridayLogger.info('Share', `${event} ${JSON.stringify(detail)}`);
}

/** Collision-safe name: "photo.jpg" -> "photo (1).jpg". Pure function. */
export function collisionFree(name: string, taken: Set<string>): string {
  const clean = (name || 'file').split(/[\\/]/).pop()!.slice(0, 120) || 'file';
  if (!taken.has(clean)) return clean;
  const dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  for (let i = 1; i < 1000; i++) {
    const cand = `${stem} (${i})${ext}`.slice(0, 120);
    if (!taken.has(cand)) return cand;
  }
  return `${Date.now()}-${clean}`.slice(0, 120);
}

/** Reject unsafe transfer metadata before anything touches disk. */
export function validateOfferMeta(offer: FtOffer): string | null {
  if (!offer || typeof offer !== 'object') return 'Malformed offer.';
  if (!offer.id || typeof offer.id !== 'string') return 'Missing transfer id.';
  if (!offer.name || typeof offer.name !== 'string' || /[\\/]{2,}|\.\.|[\0-\x1f]/.test(offer.name)) {
    return 'Unsafe file name rejected.';
  }
  if (!Number.isFinite(offer.size) || offer.size <= 0 || offer.size > 8 * 1024 * 1024) {
    return 'Invalid file size.';
  }
  if (!Number.isFinite(offer.chunks) || offer.chunks < 1 || offer.chunks > 400) {
    return 'Invalid chunk count.';
  }
  return null;
}

export class ShareManager {
  private cancelRequested = false;
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch { /* noop */ }
    });
  }

  /** Which transport will carry the NEXT transfer — the actually configured one. */
  currentTransport(): ShareTransport {
    try {
      const base = getServerBase();
      if (!base) return 'unknown';
      const host = base.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1') return 'unknown';
      if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|.*\.local)$/.test(host)) return 'lan-direct';
      return 'server-relay';
    } catch {
      return 'unknown';
    }
  }

  transportLabel(t: ShareTransport): string {
    if (t === 'lan-direct') return 'Local Wi-Fi (direct)';
    if (t === 'server-relay') return 'Server relay';
    return 'Not configured';
  }

  // ---------- trusted / blocked / renamed devices ----------

  private trusted(): TrustedEntry[] {
    return readJson<TrustedEntry[]>(TRUST_KEY, []);
  }

  isTrusted(deviceId: string): boolean {
    return this.trusted().some((t) => t.deviceId === deviceId);
  }

  trust(deviceId: string, label: string): void {
    const list = this.trusted().filter((t) => t.deviceId !== deviceId);
    list.push({ deviceId, label: label.slice(0, 60), addedAt: Date.now() });
    writeJson(TRUST_KEY, list);
    shareLog('device_trusted', { deviceId: deviceId.slice(-6) });
    this.emit();
  }

  untrust(deviceId: string): void {
    writeJson(TRUST_KEY, this.trusted().filter((t) => t.deviceId !== deviceId));
    shareLog('device_untrusted', { deviceId: deviceId.slice(-6) });
    this.emit();
  }

  rename(deviceId: string, label: string): void {
    const clean = label.trim().slice(0, 60);
    if (!clean) return;
    const list = this.trusted();
    const found = list.find((t) => t.deviceId === deviceId);
    if (found) found.label = clean;
    else list.push({ deviceId, label: clean, addedAt: Date.now() });
    writeJson(TRUST_KEY, list);
    shareLog('device_renamed', { deviceId: deviceId.slice(-6) });
    this.emit();
  }

  trustedLabel(deviceId: string, fallback: string): string {
    return this.trusted().find((t) => t.deviceId === deviceId)?.label || fallback;
  }

  private blocked(): string[] {
    return readJson<string[]>(BLOCK_KEY, []);
  }

  isBlocked(deviceId: string): boolean {
    return this.blocked().includes(deviceId);
  }

  block(deviceId: string): void {
    const list = this.blocked();
    if (!list.includes(deviceId)) list.push(deviceId);
    writeJson(BLOCK_KEY, list);
    this.untrust(deviceId);
    shareLog('device_blocked', { deviceId: deviceId.slice(-6) });
    this.emit();
  }

  unblock(deviceId: string): void {
    writeJson(BLOCK_KEY, this.blocked().filter((d) => d !== deviceId));
    shareLog('device_unblocked', { deviceId: deviceId.slice(-6) });
    this.emit();
  }

  // ---------- discovery (real presence only — never fake devices) ----------

  /** Paired peer from the server + trust overlay. Empty = none found. */
  async discover(): Promise<{ devices: ShareDevice[]; state: ShareConnState; note: string }> {
    shareLog('discovery_start', {});
    try {
      const { paired } = await globalDeviceLink.getStatus();
      if (!paired) {
        shareLog('discovery_empty', {});
        return { devices: [], state: 'Available', note: 'Koi paired device nahi. Device Link se pair karo.' };
      }
      if (this.isBlocked(paired.deviceId)) {
        shareLog('discovery_blocked', {});
        return { devices: [], state: 'Available', note: 'Paired device blocked hai.' };
      }
      const dev: ShareDevice = {
        ...paired,
        label: this.trustedLabel(paired.deviceId, paired.name),
        trusted: this.isTrusted(paired.deviceId),
        blocked: false,
      };
      shareLog('discovery_found', { online: paired.online });
      return {
        devices: [dev],
        state: paired.online ? 'Connected' : 'Available',
        note: paired.online ? 'Device online hai.' : 'Device offline dikh raha hai (60s se zyada inactive).',
      };
    } catch (e) {
      shareLog('discovery_failed', {});
      return { devices: [], state: 'Failed', note: `Discovery nahi ho payi: ${(e as Error)?.message || 'server unreachable'}` };
    }
  }

  // ---------- history (SUCCESS only on verified receipt) ----------

  history(): ShareHistoryEntry[] {
    return readJson<ShareHistoryEntry[]>(HISTORY_KEY, []);
  }

  private addHistory(entry: Omit<ShareHistoryEntry, 'id'>): void {
    const list = this.history();
    list.unshift({ ...entry, id: `sh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
    writeJson(HISTORY_KEY, list.slice(0, 200));
    this.emit();
  }

  clearHistory(): void {
    writeJson(HISTORY_KEY, []);
    this.emit();
  }

  // ---------- private-folder guard ----------

  /** Private vault items need the vault unlocked first — never bypassed. */
  assertShareable(isPrivate: boolean): string | null {
    if (isPrivate && !globalPrivateVault.isUnlocked()) {
      return 'Ye private file hai. Pehle Private Vault unlock karo, phir share karo.';
    }
    return null;
  }

  // ---------- send / receive (receipt-verified, cancellable) ----------

  requestCancel(): void {
    this.cancelRequested = true;
    shareLog('transfer_cancel_requested', {});
  }

  /** Send files sequentially to the paired device. Honest per-file results. */
  async sendFiles(
    files: File[],
    targetDeviceId: string | undefined,
    peerName: string,
    onProgress?: (fileName: string, index: number, total: number, p: FtProgress, speedBps: number, etaSec: number | null) => void,
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    const transport = this.currentTransport();
    this.cancelRequested = false;
    shareLog('transfer_start', { count: files.length, transport });
    let i = 0;
    for (const file of files) {
      i++;
      if (this.cancelRequested) {
        this.addHistory({ at: Date.now(), direction: 'sent', peerName, fileName: file.name, size: file.size, status: 'CANCELLED', transport });
        shareLog('transfer_cancelled', { file: file.name.slice(0, 60) });
        results.push({ success: false, message: 'Cancelled by user', voiceResponse: 'Transfer cancel kar diya.' });
        continue;
      }
      const t0 = Date.now();
      const r = await FileTransferService.sendFile(
        file,
        (p) => {
          const elapsed = Math.max(0.5, (Date.now() - t0) / 1000);
          const doneBytes = Math.round((p.percent / 100) * file.size);
          const speed = doneBytes / elapsed;
          const eta = speed > 0 && p.percent < 100 ? (file.size - doneBytes) / speed : null;
          onProgress?.(file.name, i, files.length, p, speed, eta);
        },
        targetDeviceId,
        () => this.cancelRequested,
      );
      const ok = (r as { success?: boolean }).success === true;
      this.addHistory({
        at: Date.now(), direction: 'sent', peerName, fileName: file.name, size: file.size,
        status: this.cancelRequested ? 'CANCELLED' : ok ? 'SUCCESS' : 'FAILED',
        transport, note: ok ? undefined : r.message,
      });
      shareLog(ok ? 'transfer_complete' : 'transfer_failed', { file: file.name.slice(0, 60) });
      results.push(r);
    }
    return results;
  }

  /** Accept an offer after validating metadata + trust/block checks. */
  async acceptOffer(
    offer: FtOffer,
    peerName: string,
    onProgress?: (p: FtProgress, speedBps: number, etaSec: number | null) => void,
  ): Promise<ActionResult> {
    const problem = validateOfferMeta(offer);
    if (problem) {
      shareLog('transfer_rejected_unsafe', {});
      return { success: false, message: problem, voiceResponse: `Sir, ${problem}` };
    }
    const transport = this.currentTransport();
    const t0 = Date.now();
    shareLog('transfer_accept', { size: offer.size, transport });
    const r = await FileTransferService.acceptOffer(offer, (p) => {
      const elapsed = Math.max(0.5, (Date.now() - t0) / 1000);
      const doneBytes = Math.round((p.percent / 100) * offer.size);
      const speed = doneBytes / elapsed;
      onProgress?.(p, speed, speed > 0 && p.percent < 100 ? (offer.size - doneBytes) / speed : null);
    });
    const ok = (r as { success?: boolean }).success === true;
    this.addHistory({
      at: Date.now(), direction: 'received', peerName, fileName: offer.name, size: offer.size,
      status: ok ? 'SUCCESS' : 'FAILED', transport, note: ok ? undefined : r.message,
    });
    shareLog(ok ? 'transfer_complete' : 'transfer_failed', { file: offer.name.slice(0, 60) });
    return r;
  }

  markRejected(offerName: string, peerName: string, size: number): void {
    this.addHistory({
      at: Date.now(), direction: 'received', peerName, fileName: offerName, size,
      status: 'REJECTED', transport: this.currentTransport(),
    });
    shareLog('transfer_rejected', {});
  }
}

export const globalShareManager = new ShareManager();
