import React, { useEffect, useRef, useState } from 'react';
import { X, Upload, Download, RefreshCw, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { FileTransferService, type FtOffer, type FtProgress } from '../services/FileTransferService';
import { globalDeviceLink } from '../services/DeviceLinkManager';
import { globalDeviceManager, type RegistryDevice } from '../services/DeviceManager';
import { THEMES } from '../utils/theme';
import type { ThemeAccent } from '../types';

interface HUDFileTransferProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeAccent;
  /** pre-selected target device (phone node button passes it) */
  targetId?: string;
}

/**
 * Verified file-transfer console. Progress + final state come from the
 * real relay protocol (manifest -> chunks -> byte-count receipt).
 * COMPLETE appears only after size match; every failure names its reason.
 */
export function HUDFileTransfer({ isOpen, onClose, theme, targetId }: HUDFileTransferProps) {
  const currentTheme = THEMES[theme] || THEMES.amber;
  const [tab, setTab] = useState<'send' | 'receive'>('send');
  const [pairedLabel, setPairedLabel] = useState('checking…');
  const [targets, setTargets] = useState<RegistryDevice[]>([]);
  const [target, setTarget] = useState<string | undefined>(targetId);
  const [progress, setProgress] = useState<FtProgress | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [offers, setOffers] = useState<FtOffer[]>([]);
  const [recvBusy, setRecvBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setProgress(null);
    setResult(null);
    setTarget(targetId);
    globalDeviceLink.getStatus()
      .then((s) => setPairedLabel(s.paired ? `${s.paired.name} (${s.paired.online ? 'online' : 'offline'})` : 'not paired — Device Link se pair karo'))
      .catch(() => setPairedLabel('status unknown — server reachable nahi'));
    globalDeviceManager.listDevices()
      .then((l) => setTargets(l.devices.filter((d) => !d.revoked)))
      .catch(() => setTargets([]));
    if (tab === 'receive') void refreshOffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab, targetId]);

  const refreshOffers = async () => {
    setOffers(await FileTransferService.listIncoming());
  };

  const sendPicked = async (f: File | undefined) => {
    if (!f || busy) return;
    setBusy(true);
    setResult(null);
    const r = await FileTransferService.sendFile(f, setProgress, target);
    setResult({ ok: r.status === 'SUCCESS', text: r.message });
    setBusy(false);
  };

  const accept = async (o: FtOffer) => {
    if (recvBusy) return;
    setRecvBusy(o.id);
    setResult(null);
    const r = await FileTransferService.acceptOffer(o, setProgress);
    setResult({ ok: r.status === 'SUCCESS', text: r.message });
    setRecvBusy(null);
    void refreshOffers();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4">
      <div
        className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto flex flex-col rounded-2xl border shadow-2xl"
        style={{ backgroundColor: '#090e1a', borderColor: `${currentTheme.primary}44`, boxShadow: `0 0 40px ${currentTheme.primary}22` }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/60">
          <div>
            <h2 className="text-sm font-bold text-white font-mono">FILE TRANSFER</h2>
            <p className="text-[10px] text-slate-400 font-mono">Paired: {pairedLabel}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white" aria-label="Close file transfer" style={{ minHeight: 44, minWidth: 44 }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 px-4 pt-3">
          {(['send', 'receive'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-lg text-xs font-mono font-bold"
              style={tab === t
                ? { backgroundColor: `${currentTheme.primary}22`, color: currentTheme.primary, border: `1px solid ${currentTheme.primary}66` }
                : { backgroundColor: '#0f172a', color: '#94a3b8', border: '1px solid #1e293b' }}
            >
              {t === 'send' ? '⇪ SEND' : '⇩ RECEIVE'}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          {tab === 'send' && (
            <>
              {targets.length > 1 && (
                <select
                  value={target ?? ''}
                  onChange={(e) => setTarget(e.target.value || undefined)}
                  aria-label="Target device"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm font-mono"
                  style={{ minHeight: 44 }}
                >
                  <option value="">Default paired device</option>
                  {targets.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.name} ({d.online ? 'online' : 'offline'})
                    </option>
                  ))}
                </select>
              )}
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => { void sendPicked(e.target.files?.[0]); e.target.value = ''; }} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="w-full py-3 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: currentTheme.primary, minHeight: 48 }}
              >
                <Upload className="w-4 h-4" /> {busy ? 'SENDING…' : 'SELECT FILE (max 8 MB)'}
              </button>
            </>
          )}

          {tab === 'receive' && (
            <>
              <button
                onClick={() => void refreshOffers()}
                className="w-full py-2 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2"
                style={{ backgroundColor: '#0f766e', minHeight: 48 }}
              >
                <RefreshCw className="w-4 h-4" /> REFRESH INCOMING
              </button>
              {offers.length === 0 && <p className="text-xs text-slate-400 font-mono text-center py-3">Koi incoming file nahi hai.</p>}
              {offers.map((o) => (
                <div key={o.id} className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-white font-mono font-bold truncate">{o.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{Math.round(o.size / 1024)} KB • from {o.fromName} • {o.received}/{o.chunks} chunks on server</p>
                  </div>
                  <button
                    onClick={() => void accept(o)}
                    disabled={recvBusy !== null}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                    style={{ minHeight: 44 }}
                  >
                    <Download className="w-3.5 h-3.5" /> {recvBusy === o.id ? '…' : 'ACCEPT'}
                  </button>
                </div>
              ))}
            </>
          )}

          {progress && progress.phase !== 'idle' && (
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: currentTheme.primary }} />
                <p className="text-xs text-slate-200 font-mono">{progress.detail}</p>
              </div>
              <div className="h-2 rounded bg-slate-700 overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${progress.percent}%`, backgroundColor: currentTheme.primary }} />
              </div>
              <p className="text-[10px] text-slate-400 font-mono mt-1">{progress.percent}% • {progress.sentChunks}/{progress.chunks} chunks</p>
            </div>
          )}

          {result && (
            <div className={`p-3 rounded-xl border flex items-start gap-2 ${result.ok ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              {result.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
              <p className="text-xs text-slate-200 font-mono">{result.text}</p>
            </div>
          )}

          <p className="text-[10px] text-slate-500 font-mono text-center">
            Relay server par files 20 min me expire hoti hain. COMPLETE sirf byte-match receipt ke baad.
          </p>
        </div>
      </div>
    </div>
  );
}
