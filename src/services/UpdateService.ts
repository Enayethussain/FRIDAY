// UpdateService — in-app update checker for the FRIDAY Android app.
// Flow: fetch remote version.json -> validate -> compare latestVersionCode
// with the local versionCode (native PackageManager via AppUpdate plugin) ->
// dialog -> DownloadManager download -> package installer.
// Nothing is faked: every state reflects the real check/download/install
// result. Web browsers skip native install (download opens as a file link).
import { Capacitor, registerPlugin } from '@capacitor/core';
import { FridayLogger } from './FridayLogger';

const TAG = 'Update';

// Your version.json URL: localStorage override wins, then build-time env.
// Expected JSON: { latestVersionCode: number, latestVersionName: string,
//   apkUrl: string, releaseNotes?: string, minSupportedVersionCode?: number }
function updateJsonUrl(): string {
  try {
    const ls = localStorage.getItem('friday_update_url') || '';
    if (ls) return ls;
  } catch { /* storage unavailable */ }
  try {
    const env = (import.meta as any).env || {};
    return String(env.VITE_UPDATE_JSON_URL || '');
  } catch {
    return '';
  }
}

export interface RemoteVersion {
  latestVersionCode: number;
  latestVersionName: string;
  apkUrl: string;
  releaseNotes: string;
  minSupportedVersionCode: number;
}

export interface UpdateCheckResult {
  configured: boolean;
  updateAvailable: boolean;
  localCode: number;
  localName: string;
  remote: RemoteVersion | null;
  error: string;
}

interface AppUpdatePlugin {
  getVersion(): Promise<{ versionCode: number; versionName: string; packageName: string }>;
  downloadApk(options: { url: string }): Promise<{ downloadId: number }>;
  downloadStatus(options: { downloadId: number }): Promise<{ downloadId: number; status: string; bytesDownloaded: number; bytesTotal: number }>;
  installApk(): Promise<{ status: string }>;
  openInstallSettings(): Promise<void>;
}

let plugin: AppUpdatePlugin | null = null;
try {
  if (Capacitor.isNativePlatform()) {
    plugin = registerPlugin<AppUpdatePlugin>('AppUpdate');
  }
} catch { plugin = null; }

export function isUpdateSupported(): boolean {
  return plugin !== null;
}

/** Pure: validate remote version.json shape. Exported for tests. */
export function parseRemoteVersion(j: unknown): RemoteVersion | null {
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  const code = Number(o.latestVersionCode);
  const name = String(o.latestVersionName || '');
  const apkUrl = String(o.apkUrl || '');
  if (!Number.isFinite(code) || code < 0 || !name || !/^https?:\/\//.test(apkUrl)) return null;
  return {
    latestVersionCode: Math.floor(code),
    latestVersionName: name.slice(0, 32),
    apkUrl,
    releaseNotes: String(o.releaseNotes || '').slice(0, 2000),
    minSupportedVersionCode: Number.isFinite(Number(o.minSupportedVersionCode)) ? Math.floor(Number(o.minSupportedVersionCode)) : 0,
  };
}

/** Pure: true when remote build is newer. Exported for tests. */
export function isUpdateAvailable(localCode: number, remoteCode: number): boolean {
  if (!Number.isFinite(localCode) || !Number.isFinite(remoteCode)) return false;
  return Math.floor(remoteCode) > Math.floor(localCode);
}

async function getLocalVersion(): Promise<{ versionCode: number; versionName: string }> {
  if (plugin) {
    const v = await plugin.getVersion();
    return { versionCode: Number(v.versionCode) || 0, versionName: String(v.versionName || '') };
  }
  // Web fallback: build-stamped version when available, else unknown (0).
  try {
    const env = (import.meta as any).env || {};
    const stamp = String(env.VITE_APP_VERSION || '');
    const m = stamp.match(/^(\d+)\.(.+)$/);
    if (m) return { versionCode: Number(m[1]) || 0, versionName: m[2] };
  } catch { /* noop */ }
  return { versionCode: 0, versionName: '' };
}

/** Fetch + validate remote version.json, compare with local build. */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const url = updateJsonUrl();
  if (!url) {
    return { configured: false, updateAvailable: false, localCode: 0, localName: '', remote: null, error: 'Update server not configured.' };
  }
  let local = { versionCode: 0, versionName: '' };
  try {
    local = await getLocalVersion();
  } catch (e) {
    FridayLogger.error(TAG, `local version lookup failed: ${(e as Error)?.message || e}`);
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const remote = parseRemoteVersion(await res.json().catch(() => null));
    if (!remote) throw new Error('Invalid version.json');
    return {
      configured: true,
      updateAvailable: isUpdateAvailable(local.versionCode, remote.latestVersionCode),
      localCode: local.versionCode,
      localName: local.versionName,
      remote,
      error: '',
    };
  } catch (e: any) {
    FridayLogger.error(TAG, `update check failed: ${e?.message || e}`);
    return {
      configured: true, updateAvailable: false,
      localCode: local.versionCode, localName: local.versionName,
      remote: null, error: e?.message || 'Update check failed.',
    };
  }
}

export type DownloadState =
  | { phase: 'idle' }
  | { phase: 'downloading'; downloaded: number; total: number }
  | { phase: 'downloaded' }
  | { phase: 'needPermission' }
  | { phase: 'installing' }
  | { phase: 'error'; message: string };

/**
 * Download the APK and launch the installer, reporting real progress.
 * Returns the terminal phase. Native only; on web it opens the APK URL.
 */
export async function downloadAndInstall(
  apkUrl: string,
  onState: (s: DownloadState) => void
): Promise<DownloadState> {
  if (!plugin) {
    try {
      window.open(apkUrl, '_blank', 'noopener');
      return { phase: 'error', message: 'Web browser me APK direct install nahi hota — file download ho gayi hogi.' };
    } catch {
      return { phase: 'error', message: 'Download start nahi ho paya.' };
    }
  }
  try {
    const { downloadId } = await plugin.downloadApk({ url: apkUrl });
    for (let i = 0; i < 600; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      let st: { status: string; bytesDownloaded: number; bytesTotal: number };
      try {
        st = await plugin.downloadStatus({ downloadId });
      } catch {
        continue;
      }
      if (st.status === 'SUCCESSFUL') break;
      if (st.status === 'FAILED') {
        const s: DownloadState = { phase: 'error', message: 'Download fail ho gaya. Dobara try karo.' };
        onState(s);
        return s;
      }
      onState({ phase: 'downloading', downloaded: Number(st.bytesDownloaded) || 0, total: Number(st.bytesTotal) || 0 });
    }
    onState({ phase: 'downloaded' });
    const res = await plugin.installApk();
    if (res?.status === 'NEED_INSTALL_PERMISSION') {
      const s: DownloadState = { phase: 'needPermission' };
      onState(s);
      return s;
    }
    const s: DownloadState = { phase: 'installing' };
    onState(s);
    return s;
  } catch (e: any) {
    const s: DownloadState = { phase: 'error', message: e?.message || 'Update fail ho gaya.' };
    onState(s);
    return s;
  }
}

/** Open Android unknown-sources settings for this app. No-op on web. */
export async function openInstallPermissionSettings(): Promise<void> {
  if (!plugin) return;
  try {
    await plugin.openInstallSettings();
  } catch (e) {
    FridayLogger.error(TAG, `install settings failed: ${(e as Error)?.message || e}`);
  }
}
