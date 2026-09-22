import React, { useState } from 'react';
import { XCircle, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  checkForUpdate,
  downloadAndInstall,
  openInstallPermissionSettings,
  type DownloadState,
  type UpdateCheckResult,
} from '../services/UpdateService';

interface UpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initial?: UpdateCheckResult | null;
}

function fmtMB(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** In-app update dialog: real version comparison, real download progress. */
export function UpdateDialog({ isOpen, onClose, initial }: UpdateDialogProps) {
  const [check, setCheck] = useState<UpdateCheckResult | null>(initial || null);
  const [checking, setChecking] = useState(false);
  const [dl, setDl] = useState<DownloadState>({ phase: 'idle' });

  // Refresh the passed-in check when the dialog opens with a new result.
  React.useEffect(() => {
    if (isOpen && initial) {
      setCheck(initial);
      setDl({ phase: 'idle' });
    }
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const recheck = async () => {
    setChecking(true);
    try {
      setCheck(await checkForUpdate());
    } finally {
      setChecking(false);
    }
  };

  const startUpdate = async () => {
    if (!check?.remote?.apkUrl) return;
    setDl({ phase: 'downloading', downloaded: 0, total: 0 });
    await downloadAndInstall(check.remote.apkUrl, setDl);
  };

  const pct =
    dl.phase === 'downloading' && dl.total > 0
      ? Math.min(100, Math.round((dl.downloaded / dl.total) * 100))
      : null;

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
      onClick={onClose}
      role="dialog"
      aria-label="App update"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-amber-500/40 bg-gradient-to-br from-slate-900 to-slate-800 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display font-bold text-slate-100 text-lg">App Update</h2>
          <button onClick={onClose} aria-label="Close update dialog" className="p-2 min-w-[44px] min-h-[44px] text-slate-400 hover:text-white">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {!check || !check.configured ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">Update server configured nahi hai. App Settings me update URL set karo ya dobara check karo.</p>
            <button type="button" onClick={() => void recheck()} disabled={checking} className="w-full min-h-[44px] rounded-xl bg-slate-800 border border-slate-700 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              <RefreshCw className="w-4 h-4" /> {checking ? 'Checking…' : 'Check Again'}
            </button>
          </div>
        ) : check.error && !check.remote ? (
          <div className="space-y-3">
            <p className="text-sm text-red-300">Update check fail: {check.error}</p>
            <button type="button" onClick={() => void recheck()} disabled={checking} className="w-full min-h-[44px] rounded-xl bg-slate-800 border border-slate-700 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              <RefreshCw className="w-4 h-4" /> {checking ? 'Checking…' : 'Retry'}
            </button>
          </div>
        ) : !check.updateAvailable ? (
          <p className="text-sm text-emerald-300 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" /> FRIDAY updated hai (v{check.localName || check.localCode}).
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              Naya version available hai: <b className="text-amber-300">v{check.remote!.latestVersionName}</b>
              {check.localName ? <span className="text-slate-500"> (current v{check.localName})</span> : null}
            </p>
            {check.remote!.releaseNotes ? (
              <p className="text-xs text-slate-400 bg-black/40 rounded-xl px-3 py-2 whitespace-pre-wrap">{check.remote!.releaseNotes}</p>
            ) : null}

            {dl.phase === 'idle' && (
              <button type="button" onClick={() => void startUpdate()} className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-sm text-slate-950 flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> Update Now
              </button>
            )}
            {dl.phase === 'downloading' && (
              <div>
                <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-amber-500 transition-all" style={{ width: `${pct ?? 0}%` }} />
                </div>
                <p className="mt-1 text-xs font-mono text-slate-400">
                  Downloading… {pct !== null ? `${pct}%` : ''} {fmtMB(dl.downloaded)}{dl.total > 0 ? ` / ${fmtMB(dl.total)}` : ''}
                </p>
              </div>
            )}
            {dl.phase === 'downloaded' && <p className="text-xs font-mono text-slate-400 animate-pulse">Download complete — installer khul raha hai…</p>}
            {dl.phase === 'needPermission' && (
              <div className="space-y-2">
                <p className="text-sm text-amber-300">Install ke liye permission chahiye: Settings me “Allow from this source” ON karo.</p>
                <button type="button" onClick={() => void openInstallPermissionSettings()} className="w-full min-h-[44px] rounded-xl border border-amber-500/50 text-amber-300 font-bold text-sm">
                  Open Install Settings
                </button>
              </div>
            )}
            {dl.phase === 'installing' && <p className="text-sm text-emerald-300">Installer khul gaya — screen par install confirm karo.</p>}
            {dl.phase === 'error' && (
              <div className="space-y-2">
                <p className="text-sm text-red-300">{dl.message}</p>
                <button type="button" onClick={() => void startUpdate()} className="w-full min-h-[44px] rounded-xl bg-slate-800 border border-slate-700 font-bold text-sm">
                  Retry Download
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
