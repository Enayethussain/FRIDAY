import React, { useEffect, useRef, useState } from 'react';
import { X, ShieldCheck, QrCode, ScanLine, RefreshCw, Trash2, Ban, Pencil, Check, XCircle } from 'lucide-react';
import QRCode from 'qrcode';
import { globalDeviceManager, type PermSet, type RegistryDevice, type AuditEntry } from '../services/DeviceManager';
import { THEMES } from '../utils/theme';
import type { ThemeAccent } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeAccent;
}

const PERM_LABELS: Array<{ key: keyof PermSet; label: string }> = [
  { key: 'ft', label: 'Files' },
  { key: 'cmd', label: 'Commands' },
  { key: 'notify', label: 'Notify' },
  { key: 'screen', label: 'Screen' },
];

/**
 * Secure Devices — owner-controlled pairing registry.
 * Pairing completes ONLY after explicit ALLOW; revoke kills credentials;
 * every state shown comes from the server registry (lastSeen-based online).
 */
export function HUDSecureDevices({ isOpen, onClose, theme }: Props) {
  const currentTheme = THEMES[theme] || THEMES.amber;
  const [tab, setTab] = useState<'devices' | 'pair' | 'audit'>('devices');
  const [self, setSelf] = useState<RegistryDevice | null>(null);
  const [devices, setDevices] = useState<RegistryDevice[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [aliasInput, setAliasInput] = useState('');

  // pair-host state
  const [session, setSession] = useState<{ sessionId: string; code: string; expiresAt: number; qrText: string } | null>(null);
  const [qrImg, setQrImg] = useState('');
  const [guest, setGuest] = useState<{ deviceId: string; name: string } | null>(null);
  const [grantPerms, setGrantPerms] = useState<PermSet>({ basic: true, ft: true, cmd: false, notify: true, screen: false });
  // pair-join state
  const [joinCode, setJoinCode] = useState('');
  const [joinState, setJoinState] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanCtl = useRef<{ stop: () => void } | null>(null);

  const refresh = async () => {
    try {
      await globalDeviceManager.registerIdentity();
      const l = await globalDeviceManager.listDevices();
      setSelf(l.self);
      setDevices(l.devices);
      setMsg('');
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Registry unreachable.');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setMsg('');
    void refresh();
    const t = setInterval(() => { void refresh(); }, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // host polling for guest arrival
  useEffect(() => {
    if (!session) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await globalDeviceManager.pollPair(session.sessionId);
        if (!alive) return;
        if (r.state === 'pending' && r.guest) setGuest(r.guest);
        else if (r.state !== 'pending') {
          setMsg(r.state === 'allowed' ? 'Paired.' : `Session ${r.state}.`);
          setSession(null);
          setGuest(null);
          void refresh();
        }
      } catch { /* keep polling */ }
    };
    const t = setInterval(poll, 2500);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => () => { try { scanCtl.current?.stop(); } catch { /* noop */ } }, []);

  if (!isOpen) return null;

  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
      if (okMsg) setMsg(okMsg);
      await refresh();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Failed.');
    }
    setBusy(false);
  };

  const startHost = async () => {
    setBusy(true);
    setMsg('');
    setGuest(null);
    try {
      const s = await globalDeviceManager.beginPairing();
      setSession(s);
      setQrImg(await QRCode.toDataURL(s.qrText, { width: 220, margin: 1 }));
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Pair session failed.');
    }
    setBusy(false);
  };

  const decide = async (approve: boolean) => {
    if (!session) return;
    setBusy(true);
    try {
      await globalDeviceManager.decidePair(session.sessionId, approve, grantPerms);
      setMsg(approve ? 'Device TRUSTED. Registry updated.' : 'Pairing DENIED.');
      setSession(null);
      setGuest(null);
      await refresh();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Decide failed.');
    }
    setBusy(false);
  };

  const joinWith = async (sessId: string, code: string) => {
    setBusy(true);
    setJoinState('Joining… host approval ka wait karo…');
    try {
      const r = await globalDeviceManager.joinPair(sessId, code);
      setJoinState(`Request sent to ${r.hostName}. Waiting for ALLOW…`);
      for (let i = 0; i < 40; i++) {
        await new Promise((r2) => setTimeout(r2, 3000));
        const st = await globalDeviceManager.pairResult(sessId);
        if (st.state === 'allowed') { setJoinState(`TRUST ESTABLISHED with ${st.host?.name}.`); await refresh(); break; }
        if (st.state === 'denied' || st.state === 'expired') { setJoinState(`Pairing ${st.state}.`); break; }
      }
    } catch (e: unknown) {
      setJoinState(e instanceof Error ? e.message : 'Join failed.');
    }
    setBusy(false);
  };

  const startScan = async () => {
    setScanOpen(true);
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      const devices = await BrowserMultiFormatReader.listVideoInputDevices().catch(() => []);
      const id = devices[0]?.deviceId;
      scanCtl.current = { stop: () => { try { (reader as unknown as { reset: () => void }).reset(); } catch { /* noop */ } } };
      const result = await reader.decodeOnceFromVideoDevice(id, videoRef.current!);
      const text = result.getText();
      const payload = JSON.parse(text) as { v?: number; server?: string; session?: string; code?: string; exp?: number };
      if (payload.v !== 1 || !payload.session || !payload.code) throw new Error('Ye FRIDAY pairing QR nahi hai.');
      if (payload.exp && payload.exp < Date.now()) throw new Error('PAIRING_EXPIRED: naya QR banao.');
      if (payload.server) {
        try { localStorage.setItem('FRIDAY_SERVER_URL', payload.server); } catch { /* noop */ }
      }
      setScanOpen(false);
      try { scanCtl.current?.stop(); } catch { /* noop */ }
      await joinWith(payload.session, payload.code);
    } catch (e: unknown) {
      setScanOpen(false);
      try { scanCtl.current?.stop(); } catch { /* noop */ }
      const m = e instanceof Error ? e.message : '';
      if (m && !/abort|cancel/i.test(m)) setJoinState(`Scan failed: ${m}`);
    }
  };

  const loadAudit = async () => {
    try { setAudit(await globalDeviceManager.audit()); }
    catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Audit unreachable.'); }
  };

  const dot = (on: boolean) => (
    <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: on ? '#34d399' : '#64748b', boxShadow: `0 0 8px ${on ? '#34d399' : 'transparent'}` }} />
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4">
      <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl border shadow-2xl"
        style={{ backgroundColor: '#090e1a', borderColor: `${currentTheme.primary}44`, boxShadow: `0 0 40px ${currentTheme.primary}22` }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/60 sticky top-0">
          <div>
            <h2 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" style={{ color: currentTheme.primary }} /> SECURE DEVICES
            </h2>
            <p className="text-[10px] text-slate-400 font-mono">Ed25519 identity • owner-approved trust only</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white" aria-label="Close secure devices" style={{ minHeight: 44, minWidth: 44 }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 px-4 pt-3">
          {(['devices', 'pair', 'audit'] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); if (t === 'audit') void loadAudit(); }}
              className="flex-1 py-2 rounded-lg text-xs font-mono font-bold uppercase"
              style={tab === t
                ? { backgroundColor: `${currentTheme.primary}22`, color: currentTheme.primary, border: `1px solid ${currentTheme.primary}66` }
                : { backgroundColor: '#0f172a', color: '#94a3b8', border: '1px solid #1e293b' }}>
              {t}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          {tab === 'devices' && (
            <>
              {self && (
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {dot(true)}
                      <div className="min-w-0">
                        <p className="text-sm text-white font-mono font-bold truncate">🖥 {self.name} (this device)</p>
                        <p className="text-[10px] text-slate-400 font-mono">{self.kind} • {self.hasIdentity ? '🔒 identity ON' : '⚠ identity missing'}</p>
                      </div>
                    </div>
                    <button onClick={() => { setRenaming(!renaming); setAliasInput(self.name); }} className="p-2 text-slate-400 hover:text-white" aria-label="Rename this device" style={{ minHeight: 44, minWidth: 44 }}>
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                  {renaming && (
                    <div className="flex gap-2 mt-2">
                      <input value={aliasInput} onChange={(e) => setAliasInput(e.target.value.slice(0, 40))} placeholder="Main Phone / Work PC…"
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm font-mono" />
                      <button onClick={() => void run(async () => { await globalDeviceManager.rename(aliasInput.trim()); setRenaming(false); }, 'Naam save ho gaya.')}
                        disabled={busy || !aliasInput.trim()} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-50" style={{ minHeight: 44 }}>
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              {devices.length === 0 && <p className="text-xs text-slate-400 font-mono text-center py-3">Koi paired device nahi. PAIR tab se jodo.</p>}
              {devices.map((d) => (
                <div key={d.deviceId} className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {dot(d.online && !d.revoked)}
                      <div className="min-w-0">
                        <p className="text-sm text-white font-mono font-bold truncate">
                          {d.kind === 'android' || d.kind === 'mobile' ? '📱' : '🖥'} {d.name}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {d.revoked ? '⛔ REVOKED' : d.online ? 'CONNECTED' : 'OFFLINE'} • last seen {new Date(d.lastSeen).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!d.revoked && (
                        <button onClick={() => { if (confirm(`Revoke ${d.name}? Iske credentials turant mar jayenge.`)) void run(() => globalDeviceManager.revoke(d.deviceId), `${d.name} revoked.`); }}
                          disabled={busy} className="px-3 py-2 rounded-lg bg-red-900/50 border border-red-500/40 text-red-200 text-xs font-mono disabled:opacity-50" style={{ minHeight: 44 }} title="Revoke access">
                          <Ban className="w-3.5 h-3.5 inline" /> REVOKE
                        </button>
                      )}
                      <button onClick={() => { if (confirm(`Remove pairing with ${d.name}?`)) void run(() => globalDeviceManager.remove(d.deviceId), 'Pairing removed.'); }}
                        disabled={busy} className="px-3 py-2 rounded-lg bg-slate-700 text-slate-200 text-xs font-mono disabled:opacity-50" style={{ minHeight: 44 }} title="Remove pairing">
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </div>
                  </div>
                  {!d.revoked && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] text-slate-500 font-mono mr-1">ALLOW:</span>
                      {PERM_LABELS.map((p) => {
                        const on = !!d.myPerms?.[p.key];
                        return (
                          <button key={p.key} disabled={busy}
                            onClick={() => void run(() => globalDeviceManager.setPermissions(d.deviceId, { ...(d.myPerms || { basic: true, ft: false, cmd: false, notify: true, screen: false }), [p.key]: !on }))}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono border ${on ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-200' : 'bg-slate-900 border-slate-700 text-slate-500'}`}
                            style={{ minHeight: 44 }} aria-pressed={on}>
                            {p.label} {on ? '✓' : '✕'}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              <button onClick={() => void refresh()} disabled={busy} className="w-full py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-mono disabled:opacity-50" style={{ minHeight: 44 }}>
                <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> REFRESH STATUS
              </button>
            </>
          )}

          {tab === 'pair' && (
            <>
              <button onClick={() => void startHost()} disabled={busy}
                className="w-full py-3 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: currentTheme.primary, minHeight: 48 }}>
                <QrCode className="w-4 h-4" /> PAIR NEW DEVICE (code + QR, 5 min)
              </button>
              {session && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/40 text-center space-y-2">
                  {qrImg && <img src={qrImg} alt="Pairing QR — private keys nahi hain" className="mx-auto rounded-lg" style={{ width: 200, height: 200 }} />}
                  <p className="text-4xl font-mono font-bold text-emerald-300 tracking-widest">{session.code}</p>
                  <p className="text-[10px] text-slate-400 font-mono">Expires {new Date(session.expiresAt).toLocaleTimeString()} • QR me sirf server + session hai</p>
                  {guest ? (
                    <div className="pt-2 space-y-2">
                      <p className="text-sm text-white font-mono">PAIRING REQUEST: <strong>{guest.name}</strong> — allow?</p>
                      <div className="flex flex-wrap gap-1.5 justify-center">
                        {PERM_LABELS.map((p) => (
                          <button key={p.key} onClick={() => setGrantPerms((g) => ({ ...g, [p.key]: !g[p.key] }))}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono border ${grantPerms[p.key] ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-200' : 'bg-slate-900 border-slate-700 text-slate-500'}`}
                            style={{ minHeight: 44 }}>
                            {p.label} {grantPerms[p.key] ? '✓' : '✕'}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => void decide(true)} disabled={busy} className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-50" style={{ minHeight: 48 }}>
                          <Check className="w-4 h-4 inline" /> ALLOW
                        </button>
                        <button onClick={() => void decide(false)} disabled={busy} className="px-6 py-2.5 rounded-xl bg-red-700 text-white font-bold text-sm disabled:opacity-50" style={{ minHeight: 48 }}>
                          <XCircle className="w-4 h-4 inline" /> DENY
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-300 font-mono animate-pulse">SCANNING… guest ka wait ho raha hai</p>
                  )}
                </div>
              )}
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 space-y-2">
                <p className="text-xs text-slate-300 font-mono font-bold">JOIN with code / QR</p>
                <div className="flex gap-2">
                  <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit code" className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-center tracking-widest font-mono" />
                  <button onClick={() => { const s = prompt('Host session ID (QR scan na ho to):'); if (s) void joinWith(s.trim(), joinCode); }}
                    disabled={busy || joinCode.length !== 6} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50" style={{ minHeight: 44 }}>
                    JOIN
                  </button>
                  <button onClick={() => void startScan()} disabled={busy} className="px-4 py-2 rounded-xl bg-amber-700 text-white text-sm font-bold disabled:opacity-50" style={{ minHeight: 44 }} title="Scan QR">
                    <ScanLine className="w-4 h-4" />
                  </button>
                </div>
                {joinState && <p className="text-xs text-amber-200 font-mono">{joinState}</p>}
              </div>
              {scanOpen && (
                <div className="p-3 rounded-xl bg-black border border-amber-500/40 text-center">
                  <video ref={videoRef} style={{ width: '100%', borderRadius: 12 }} playsInline muted />
                  <p className="text-xs text-amber-200 font-mono mt-2">QR ko camera ke samne rakho…</p>
                  <button onClick={() => { try { scanCtl.current?.stop(); } catch { /* noop */ } setScanOpen(false); }}
                    className="mt-2 px-4 py-2 rounded-lg bg-slate-700 text-white text-xs font-mono" style={{ minHeight: 44 }}>CANCEL</button>
                </div>
              )}
            </>
          )}

          {tab === 'audit' && (
            <>
              {audit.length === 0 && <p className="text-xs text-slate-400 font-mono text-center py-3">Koi entry nahi — refresh dabao.</p>}
              {audit.map((a, i) => (
                <div key={i} className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 font-mono">
                  <p className="text-[11px] text-slate-200">{new Date(a.t).toLocaleTimeString()} • {a.actorName} • {a.action}{a.target ? ` → ${a.target.slice(0, 12)}` : ''}</p>
                  <p className="text-[10px] text-slate-400">{a.result.slice(0, 120)}</p>
                </div>
              ))}
            </>
          )}

          {msg && <p className="text-sm text-amber-300 font-mono">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
