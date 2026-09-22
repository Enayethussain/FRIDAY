import { apiUrl } from '../lib/serverUrl';
import { globalDeviceLink } from './DeviceLinkManager';

/**
 * CloudSyncManager — JARVIS CLOUD architecture:
 *   CLOUD/BACKEND (central: Live WS + Gemini + relay + sync bucket)
 *     ├── Android (complete JARVIS)
 *     └── PC (complete JARVIS)
 *   Pair hone par dono ka syncRoom same -> notes/tasks/curriculum/routines auto shared.
 *
 * Memories already Firebase (Google login) se shared hain.
 * Ye manager localStorage keys ko cloud bucket se sync karta hai (last-write-wins).
 */

const SYNC_KEYS = {
  notes: 'friday_notes',
  tasks: 'friday_tasks',
  curriculum: 'friday_study_curriculum',
  routines: 'friday_routines',
  prefs: 'friday_preferences',
} as const;

type BucketKey = keyof typeof SYNC_KEYS;

function readLS(key: string): any {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLS(key: string, val: any): void {
  try {
    if (val === null || val === undefined) return;
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

class CloudSyncManager {
  private timer: any = null;
  private lastPushSig = '';
  private listeners = new Set<(info: { room: string; paired: boolean }) => void>();

  private snapshot(): Record<BucketKey, any> {
    return {
      notes: readLS(SYNC_KEYS.notes),
      tasks: readLS(SYNC_KEYS.tasks),
      curriculum: readLS(SYNC_KEYS.curriculum),
      routines: readLS(SYNC_KEYS.routines),
      prefs: readLS(SYNC_KEYS.prefs),
    };
  }

  private sig(s: Record<string, any>): string {
    const str = JSON.stringify(s);
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return `${h}:${str.length}`;
  }

  async syncNow(): Promise<{ room: string; paired: boolean } | null> {
    const token = globalDeviceLink.getToken();
    if (!token) return null;
    try {
      // 1. Pull cloud bucket
      const pullRes = await fetch(apiUrl(`/api/sync/pull?token=${encodeURIComponent(token)}`));
      const pull = await pullRes.json();
      if (!pull.success) return null;
      const bucket = pull.bucket;

      if (bucket) {
        // Cloud -> local (only non-null keys overwrite)
        if (bucket.notes != null) writeLS(SYNC_KEYS.notes, bucket.notes);
        if (bucket.tasks != null) writeLS(SYNC_KEYS.tasks, bucket.tasks);
        if (bucket.curriculum != null) writeLS(SYNC_KEYS.curriculum, bucket.curriculum);
        if (bucket.routines != null) writeLS(SYNC_KEYS.routines, bucket.routines);
        if (bucket.prefs != null) writeLS(SYNC_KEYS.prefs, bucket.prefs);
      }

      // 2. Push local if changed since last push
      const snap = this.snapshot();
      const s = this.sig(snap);
      if (s !== this.lastPushSig) {
        await fetch(apiUrl('/api/sync/push'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, ...snap }),
        });
        this.lastPushSig = s;
      }

      const info = { room: pull.room as string, paired: !!pull.paired };
      this.listeners.forEach((fn) => { try { fn(info); } catch {} });
      window.dispatchEvent(new CustomEvent('friday-cloud-sync', { detail: info }));
      return info;
    } catch {
      return null;
    }
  }

  start(intervalMs = 10000): void {
    this.stop();
    this.syncNow();
    this.timer = setInterval(() => this.syncNow(), intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onSync(fn: (info: { room: string; paired: boolean }) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}

export const globalCloudSync = new CloudSyncManager();
