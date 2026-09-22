import React, { useEffect, useState } from 'react';
import { Link2, Unlink, Send, RefreshCw, XCircle, Smartphone, MonitorSmartphone } from 'lucide-react';
import { globalDeviceLink, PairedInfo, InboxMessage } from '../services/DeviceLinkManager';
import { getServerBase } from '../lib/serverUrl';

interface HUDDeviceLinkProps {
  isOpen: boolean;
  onClose: () => void;
  onIncoming?: (messages: InboxMessage[]) => void;
}

export function HUDDeviceLink({ isOpen, onClose }: HUDDeviceLinkProps) {
  const [name, setName] = useState(globalDeviceLink.getDeviceName());
  const [code, setCode] = useState('');
  const [pairInput, setPairInput] = useState('');
  const [paired, setPaired] = useState<PairedInfo | null>(null);
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const [sendText, setSendText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => { try { return localStorage.getItem('FRIDAY_SERVER_URL') || ''; } catch { return ''; } });

  const refresh = async () => {
    try {
      const s = await globalDeviceLink.getStatus();
      setPaired(s.paired);
      const box = await globalDeviceLink.fetchInbox();
      if (box.messages.length > 0) setInbox((prev) => [...box.messages, ...prev].slice(0, 20));
    } catch (e: any) {
      setMsg(e?.message || 'Server se connect nahi ho paya.');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setMsg('');
    setCode('');
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const doRegister = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e: any) {
      setMsg(e?.message || 'Failed.');
    }
    setBusy(false);
    refresh();
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-gradient-to-br from-slate-900/95 to-slate-800/95 rounded-2xl border border-emerald-500/30 p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <MonitorSmartphone className="w-6 h-6 text-emerald-400" /> Device Link
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white"><XCircle className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-slate-400 mb-4">PC ↔ Phone real relay — pairing code se jodo, messages asal me pahunchte hain.</p>

        <label className="text-xs text-slate-400 font-mono">Backend server URL (APK me zaroori — PC pe khaali chhodo)</label>
        <div className="flex gap-2 mt-1 mb-4">
          <input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value.trim())}
            placeholder="https://your-server.com"
            inputMode="url"
            className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => { try { if (serverUrl) localStorage.setItem('FRIDAY_SERVER_URL', serverUrl); else localStorage.removeItem('FRIDAY_SERVER_URL'); } catch {} setMsg(serverUrl ? `Server save ho gaya: ${serverUrl}` : 'Same-origin mode (PC).'); }}
            className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
          >
            Save
          </button>
        </div>
        {!serverUrl && getServerBase() === '' && (
          <p className="text-[11px] text-amber-300/90 mb-4">⚠️ APK me bina server URL ke voice/chat kaam nahi karega. Apna hosted backend URL yahan save karo.</p>
        )}

        <label className="text-xs text-slate-400 font-mono">Is device ka naam</label>
        <div className="flex gap-2 mt-1 mb-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => { globalDeviceLink.setDeviceName(name); setMsg('Naam save ho gaya.'); }}
            className="px-3 py-2 rounded-xl bg-slate-700 text-white text-sm"
          >
            Save
          </button>
        </div>

        <div className={`p-3 rounded-xl border mb-2 text-sm ${paired ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-slate-800/60 border-slate-700 text-slate-300'}`}>
          {paired ? (
            <span>🔗 Paired: <strong>{paired.name}</strong> ({paired.online ? 'online 🟢' : 'offline ⚪'}) — ☁️ Cloud sync ON: notes/tasks/syllabus dono pe same</span>
          ) : (
            <span>⛓️ Koi device paired nahi hai. Pair karo — phir notes/tasks/syllabus auto sync honge. Memories Google login se shared hain.</span>
          )}
        </div>
        <button
          onClick={async () => { setBusy(true); try { const { globalCloudSync } = await import('../services/CloudSyncManager'); const r = await globalCloudSync.syncNow(); setMsg(r ? (r.paired ? `☁️ Synced (paired room) ✅` : '☁️ Synced (solo — pair karo sharing ke liye) ✅') : 'Sync ke liye pehle server URL save karo.'); } catch (e: any) { setMsg(e?.message || 'Sync failed'); } setBusy(false); }}
          className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-sm mb-4"
        >
          ☁️ Abhi Sync Karo
        </button>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            disabled={busy}
            onClick={() => doRegister(async () => { const c = await globalDeviceLink.createCode(); setCode(c); })}
            className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm"
          >
            Mera Code Banao
          </button>
          <button
            disabled={busy}
            onClick={() => doRegister(async () => { await globalDeviceLink.unpair(); setPaired(null); })}
            className="py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-1.5"
          >
            <Unlink className="w-4 h-4" /> Unpair
          </button>
        </div>

        {code && (
          <div className="text-center p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/40 mb-4">
            <p className="text-xs text-slate-400">Doosre device pe ye code daalo (10 min valid)</p>
            <p className="text-4xl font-mono font-bold text-emerald-300 tracking-widest">{code}</p>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <input
            value={pairInput}
            onChange={(e) => setPairInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit code"
            className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm text-center tracking-widest focus:outline-none focus:border-emerald-500"
          />
          <button
            disabled={busy || pairInput.length !== 6}
            onClick={() => doRegister(async () => { const r = await globalDeviceLink.pairWithCode(pairInput); setPairInput(''); setMsg(`Paired: ${r.pairedName}`); })}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center gap-1.5"
          >
            <Link2 className="w-4 h-4" /> Pair
          </button>
        </div>

        {paired && (
          <div className="flex gap-2 mb-4">
            <input
              value={sendText}
              onChange={(e) => setSendText(e.target.value)}
              placeholder={`${paired.name} ko message...`}
              className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
            />
            <button
              disabled={busy || !sendText.trim()}
              onClick={() => doRegister(async () => { await globalDeviceLink.send(sendText.trim()); setSendText(''); setMsg('Bhej diya ✅'); })}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-slate-200">📥 Inbox</h3>
          <button onClick={refresh} className="p-1.5 text-slate-400 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
        </div>
        <div className="space-y-2">
          {inbox.length === 0 && <p className="text-xs text-slate-500">Koi message nahi.</p>}
          {inbox.map((m) => (
            <div key={m.id} className="p-3 rounded-xl bg-slate-800/60 border border-slate-700">
              <p className="text-slate-100 text-sm">{m.payload}</p>
              <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1"><Smartphone className="w-3 h-3" /> {m.fromName} • {new Date(m.t).toLocaleString()}</p>
            </div>
          ))}
        </div>

        {msg && <p className="text-sm text-amber-300 mt-3">{msg}</p>}
      </div>
    </div>
  );
}
