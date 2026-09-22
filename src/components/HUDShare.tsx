import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, RefreshCw, Send, Check, Ban, Trash2, Pencil, ShieldCheck } from 'lucide-react';
import type { ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';
import {
  globalShareManager,
  validateOfferMeta,
  type ShareConnState,
  type ShareDevice,
  type ShareHistoryEntry,
} from '../services/ShareManager';
import { FileTransferService, type FtOffer, type FtProgress } from '../services/FileTransferService';
import { SoundEffects } from '../utils/SoundEffects';
import { Capacitor } from '@capacitor/core';

interface HUDShareProps {
  isOpen: boolean;
  theme: ThemeAccent;
  onClose: () => void;
}

function fmtBytes(n: number): string {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

function fmtSpeed(bps: number): string {
  if (!bps || bps <= 0) return '—';
  return `${fmtBytes(Math.round(bps))}/s`;
}

function fmtEta(sec: number | null): string {
  if (sec == null || !isFinite(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

interface ActiveTransfer {
  fileName: string;
  index: number;
  total: number;
  percent: number;
  detail: string;
  speed: number;
  eta: number | null;
  doneBytes: number;
  size: number;
}

export const HUDShare: React.FC<HUDShareProps> = ({ isOpen, theme, onClose }) => {
  const currentTheme = THEMES[theme] || THEMES.amber;
  const [devices, setDevices] = useState<ShareDevice[]>([]);
  const [connState, setConnState] = useState<ShareConnState>('Available');
  const [note, setNote] = useState('');
  const [scanning, setScanning] = useState(false);
  const [incoming, setIncoming] = useState<FtOffer[]>([]);
  const [active, setActive] = useState<ActiveTransfer | null>(null);
  const [history, setHistory] = useState<ShareHistoryEntry[]>(() => globalShareManager.history());
  const [tab, setTab] = useState<'devices' | 'history' | 'trusted'>('devices');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [sharedIn, setSharedIn] = useState<File[]>([]);
  const [, force] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const transport = globalShareManager.currentTransport();

  const rescan = useCallback(async () => {
    setScanning(true);
    setConnState('Discovering');
    try {
      const r = await globalShareManager.discover();
      setDevices(r.devices);
      setConnState(r.state);
      setNote(r.note);
    } finally {
      setScanning(false);
    }
  }, []);

  const refreshIncoming = useCallback(async () => {
    try {
      const offers = await FileTransferService.listIncoming();
      setIncoming(offers.filter((o) => !validateOfferMeta(o)));
    } catch { /* offline */ }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void rescan();
    void refreshIncoming();
    // Android share-sheet handoff: Gallery -> Share -> FRIDAY stashes URIs
    // natively; read them here so the user can send the ACTUAL shared files.
    if (Capacitor.getPlatform() === 'android') {
      (async () => {
        try {
          const { registerPlugin } = await import('@capacitor/core');
          const ShareReceive = registerPlugin<{ getSharedFiles(): Promise<{ files: Array<{ uri: string; name: string; size: number; type: string }> }> }>('ShareReceive');
          const r = await ShareReceive.getSharedFiles().catch(() => null);
          if (!r?.files?.length) return;
          const picked: File[] = [];
          for (const f of r.files.slice(0, 10)) {
            try {
              const res = await fetch(f.uri);
              if (!res.ok) continue;
              const blob = await res.blob();
              if (!blob.size || blob.size > 8 * 1024 * 1024) continue;
              picked.push(new File([blob], (f.name || 'shared-file').split(/[\\/]/).pop() || 'shared-file', { type: f.type || blob.type }));
            } catch { /* skip unreadable entry honestly */ }
          }
          if (picked.length) {
            setSharedIn(picked);
            setNote(`${picked.length} shared file mili (Share sheet se) — neeche se bhejo.`);
          }
        } catch { /* plugin absent on web/PC */ }
      })();
    }
    const off = globalShareManager.onChange(() => {
      setHistory(globalShareManager.history());
      force((x) => x + 1);
    });
    const t = setInterval(() => {
      void refreshIncoming();
    }, 8000);
    return () => {
      clearInterval(t);
      off();
    };
  }, [isOpen, rescan, refreshIncoming]);

  if (!isOpen) return null;

  const peer = devices[0];
  const totalSize = (files: File[]) => files.reduce((a, f) => a + f.size, 0);

  const handleFiles = async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (!files.length || !peer) return;
    if (active) return;
    const tooBig = files.filter((f) => f.size > 8 * 1024 * 1024);
    const okFiles = files.filter((f) => f.size > 0 && f.size <= 8 * 1024 * 1024);
    if (!okFiles.length) {
      setNote(tooBig.length ? '8 MB se badi files relay se nahi jaati.' : 'Khaali files skip kar di.');
      return;
    }
    setConnState('Transferring');
    setNote(`${okFiles.length} file • ${fmtBytes(totalSize(okFiles))} → ${peer.label}`);
    try {
      SoundEffects.playSubtleBeep();
    } catch { /* noop */ }
    const results = await globalShareManager.sendFiles(okFiles, peer.deviceId, peer.label, (name, i, n, p, speed, eta) => {
      setActive({
        fileName: name, index: i, total: n, percent: p.percent, detail: p.detail,
        speed, eta, doneBytes: Math.round(((p as { sentChunks: number; chunks: number }).sentChunks / Math.max(1, (p as { sentChunks: number; chunks: number }).chunks)) * (okFiles[i - 1]?.size || 0)),
        size: okFiles[i - 1]?.size || 0,
      });
    });
    const failed = results.filter((r) => !(r as { success?: boolean }).success);
    setConnState(failed.length ? 'Failed' : 'Completed');
    setNote(failed.length ? `${failed.length}/${results.length} transfer fail hui.` : `${results.length} transfer complete (verified).`);
    setActive(null);
    setHistory(globalShareManager.history());
    try {
      SoundEffects.playMemoryStored();
    } catch { /* noop */ }
  };

  const accept = async (offer: FtOffer) => {
    setConnState('Transferring');
    setActive({ fileName: offer.name, index: 1, total: 1, percent: 0, detail: 'Downloading…', speed: 0, eta: null, doneBytes: 0, size: offer.size });
    const r = await globalShareManager.acceptOffer(offer, peer?.label || 'Unknown', (p, speed, eta) => {
      setActive({ fileName: offer.name, index: 1, total: 1, percent: p.percent, detail: p.detail, speed, eta, doneBytes: Math.round((p.percent / 100) * offer.size), size: offer.size });
    });
    const ok = (r as { success?: boolean }).success === true;
    setConnState(ok ? 'Completed' : 'Failed');
    setNote(r.message);
    setActive(null);
    setHistory(globalShareManager.history());
    void refreshIncoming();
  };

  const reject = (offer: FtOffer) => {
    globalShareManager.markRejected(offer.name, peer?.label || 'Unknown', offer.size);
    setIncoming((prev) => prev.filter((o) => o.id !== offer.id));
    setHistory(globalShareManager.history());
  };

  const stateColor = (s: ShareConnState) =>
    s === 'Connected' || s === 'Completed' ? '#10b981' : s === 'Transferring' || s === 'Discovering' ? '#f59e0b' : s === 'Failed' ? '#ef4444' : '#94a3b8';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-4">
      <div
        className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-slate-900 border flex flex-col shadow-2xl"
        style={{ borderColor: `${currentTheme.primary}44` }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer?.files?.length) void handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60 sticky top-0">
          <div>
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-100">⤨ FRIDAY Share</h2>
            <p className="text-[11px] font-mono" style={{ color: stateColor(connState) }}>
              {connState} • {globalShareManager.transportLabel(transport)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => void rescan()} disabled={scanning} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800" title="Rescan">
              <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {note && <div className="text-[11px] font-mono text-slate-400 bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2">{note}</div>}

          <div className="flex gap-1.5">
            {(['devices', 'history', 'trusted'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="flex-1 py-1.5 rounded-lg text-xs font-mono border capitalize cursor-pointer"
                style={{ borderColor: tab === t ? currentTheme.primary : '#334155', color: tab === t ? currentTheme.primary : '#94a3b8' }}
              >
                {t === 'devices' ? 'Nearby Devices' : t}
              </button>
            ))}
          </div>

          {tab === 'devices' && (
            <>
              <div>
                <div className="text-[11px] font-mono text-slate-400 uppercase mb-2">Nearby Devices</div>
                {!devices.length && <p className="text-xs font-mono text-slate-500">Koi device nahi mila. Pair karo, phir Rescan dabao. Fake devices kabhi nahi dikhte.</p>}
                {devices.map((d) => (
                  <div key={d.deviceId} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
                    <span className="text-2xl">{d.kind === 'android' ? '📱' : '💻'}</span>
                    <div className="flex-1 min-w-0">
                      {renaming === d.deviceId ? (
                        <div className="flex gap-1.5">
                          <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} maxLength={60} className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-100" />
                          <button type="button" onClick={() => { globalShareManager.rename(d.deviceId, renameVal); setRenaming(null); void rescan(); }} className="text-emerald-400"><Check className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <div className="text-xs font-mono font-bold text-slate-200 truncate">{d.label}</div>
                      )}
                      <div className="text-[10px] font-mono text-slate-500">
                        {d.kind} • {d.online ? '● online' : '○ offline'} {d.trusted ? '• trusted' : ''}
                      </div>
                    </div>
                    <button type="button" title="Rename" onClick={() => { setRenaming(d.deviceId); setRenameVal(d.label); }} className="p-1.5 text-slate-400 hover:text-white"><Pencil className="w-3.5 h-3.5" /></button>
                    <button
                      type="button"
                      title={d.trusted ? 'Untrust' : 'Trust'}
                      onClick={() => { d.trusted ? globalShareManager.untrust(d.deviceId) : globalShareManager.trust(d.deviceId, d.label); void rescan(); }}
                      className="p-1.5"
                    >
                      <ShieldCheck className={`w-4 h-4 ${d.trusted ? 'text-emerald-400' : 'text-slate-500'}`} />
                    </button>
                    <button type="button" title="Block" onClick={() => { globalShareManager.block(d.deviceId); void rescan(); }} className="p-1.5 text-slate-400 hover:text-red-400"><Ban className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>

              <div>
                <div className="text-[11px] font-mono text-slate-400 uppercase mb-2">Send Files {peer ? `→ ${peer.label}` : ''}</div>
                <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void handleFiles(e.target.files); e.target.value = ''; }} />
                <button
                  type="button"
                  disabled={!peer || !!active}
                  onClick={() => fileRef.current?.click()}
                  className="w-full p-3 rounded-xl border border-dashed border-slate-700 text-xs font-mono text-slate-300 hover:border-amber-400 disabled:opacity-40 cursor-pointer"
                >
                  📁 Tap to select files — ya drag &amp; drop karo yahan (photos, videos, docs, audio, ZIP/APK • max 8 MB/file)
                </button>
                {!peer && <p className="text-[10px] font-mono text-slate-500 mt-1">Pehle device pair + online hona chahiye.</p>}
              </div>

              {!!sharedIn.length && (
                <div>
                  <div className="text-[11px] font-mono text-slate-400 uppercase mb-2">Share sheet se mili files ({sharedIn.length})</div>
                  {sharedIn.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center gap-2 mb-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono text-slate-200 truncate">{f.name}</div>
                        <div className="text-[10px] font-mono text-slate-500">{fmtBytes(f.size)}</div>
                      </div>
                      <button
                        type="button"
                        disabled={!peer || !!active}
                        onClick={() => {
                          setSharedIn((prev) => prev.filter((_, j) => j !== i));
                          void handleFiles([f]);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-slate-950 disabled:opacity-40 cursor-pointer"
                        style={{ backgroundColor: currentTheme.primary }}
                      >
                        <Send className="w-3.5 h-3.5 inline" /> Send
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {active && (
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <div className="text-xs font-mono text-slate-200 truncate">{active.fileName} ({active.index}/{active.total})</div>
                  <div className="h-2 bg-slate-800 rounded-full mt-2 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${active.percent}%`, backgroundColor: currentTheme.primary }} />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
                    <span>{active.percent}% • {fmtBytes(active.doneBytes)}/{fmtBytes(active.size)}</span>
                    <span>{fmtSpeed(active.speed)} • ETA {fmtEta(active.eta)}</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 mt-0.5">{active.detail}</div>
                  <button type="button" onClick={() => globalShareManager.requestCancel()} className="mt-2 text-[11px] font-mono text-red-300 hover:text-red-200">Cancel transfer</button>
                </div>
              )}

              {!!incoming.length && (
                <div>
                  <div className="text-[11px] font-mono text-slate-400 uppercase mb-2">Incoming — approval chahiye ({incoming.length})</div>
                  {incoming.map((o) => (
                    <div key={o.id} className="p-3 rounded-xl bg-slate-950/60 border border-amber-500/30 flex items-center gap-2 mb-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono text-slate-200 truncate">{o.name}</div>
                        <div className="text-[10px] font-mono text-slate-500">{fmtBytes(o.size)} • from {o.fromName}</div>
                      </div>
                      <button type="button" onClick={() => void accept(o)} className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-slate-950 cursor-pointer" style={{ backgroundColor: currentTheme.primary }}><Check className="w-3.5 h-3.5 inline" /> Accept</button>
                      <button type="button" onClick={() => reject(o)} className="px-3 py-1.5 rounded-lg text-xs font-mono border border-slate-600 text-slate-300 cursor-pointer">Reject</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'history' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-slate-400 uppercase">Transfer History</span>
                {!!history.length && (
                  <button type="button" onClick={() => { globalShareManager.clearHistory(); setHistory([]); }} className="text-[11px] font-mono text-slate-500 hover:text-red-300 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Clear</button>
                )}
              </div>
              {!history.length && <p className="text-xs font-mono text-slate-500">Abhi koi transfer nahi hui.</p>}
              {history.map((h) => (
                <div key={h.id} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 mb-1.5">
                  <div className="text-xs font-mono text-slate-200 truncate">{h.direction === 'sent' ? '↑' : '↓'} {h.fileName}</div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {new Date(h.at).toLocaleString()} • {h.direction === 'sent' ? `to ${h.peerName}` : `from ${h.peerName}`} • {fmtBytes(h.size)} • {globalShareManager.transportLabel(h.transport)}
                  </div>
                  <div
                    className="text-[10px] font-mono font-bold"
                    style={{ color: h.status === 'SUCCESS' ? '#10b981' : h.status === 'REJECTED' || h.status === 'CANCELLED' ? '#f59e0b' : '#ef4444' }}
                  >
                    {h.status}{h.note ? ` — ${h.note.slice(0, 80)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'trusted' && (
            <div>
              <div className="text-[11px] font-mono text-slate-400 uppercase mb-2">Trusted Devices</div>
              <TrustedList onChanged={() => { void rescan(); force((x) => x + 1); }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TrustedList: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [, tick] = useState(0);
  const refresh = () => {
    tick((x) => x + 1);
    onChanged();
  };
  let trusted: Array<{ deviceId: string; label: string }>;
  try {
    trusted = JSON.parse(localStorage.getItem('friday_share_trusted') || '[]');
  } catch {
    trusted = [];
  }
  let blocked: string[];
  try {
    blocked = JSON.parse(localStorage.getItem('friday_share_blocked') || '[]');
  } catch {
    blocked = [];
  }
  if (!trusted.length && !blocked.length) return <p className="text-xs font-mono text-slate-500">Koi trusted/blocked device nahi.</p>;
  return (
    <div className="space-y-1.5">
      {trusted.map((t) => (
        <div key={t.deviceId} className="p-2.5 rounded-lg bg-slate-950/60 border border-emerald-500/20 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="flex-1 text-xs font-mono text-slate-200 truncate">{t.label}</span>
          <button type="button" onClick={() => { globalShareManager.untrust(t.deviceId); refresh(); }} className="text-[11px] font-mono text-slate-400 hover:text-red-300">Remove</button>
        </div>
      ))}
      {blocked.map((id) => (
        <div key={id} className="p-2.5 rounded-lg bg-slate-950/60 border border-red-500/20 flex items-center gap-2">
          <Ban className="w-4 h-4 text-red-400 shrink-0" />
          <span className="flex-1 text-xs font-mono text-slate-400 truncate">…{id.slice(-8)} (blocked)</span>
          <button type="button" onClick={() => { globalShareManager.unblock(id); refresh(); }} className="text-[11px] font-mono text-slate-400 hover:text-emerald-300">Unblock</button>
        </div>
      ))}
    </div>
  );
};
