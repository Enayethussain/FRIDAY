import React, { useEffect, useRef, useState } from 'react';
import { Hammer, Trash2, FolderOpen, RefreshCw, XCircle, Play } from 'lucide-react';
import { apiUrl } from '../lib/serverUrl';
import { globalDeviceLink } from '../services/DeviceLinkManager';

type Conn = 'unknown' | 'online' | 'offline';
interface JobInfo { id: string; status: string; logs: string[]; errors: string[]; appId: string | null; artifact: any; testsPassed: number; testsFailed: number; }

const STAGES = ['QUEUED', 'PLANNING', 'GENERATING', 'TESTING', 'BUILDING', 'FIXING', 'VERIFYING', 'SUCCESS'];

export function HUDAppBuilder({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [req, setReq] = useState('');
  const [conn, setConn] = useState<Conn>('unknown');
  const [job, setJob] = useState<JobInfo | null>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const pollRef = useRef<any>(null);

  const token = async () => {
    try { return await globalDeviceLink.register(); } catch { return globalDeviceLink.getToken(); }
  };

  const refreshApps = async () => {
    try {
      const t = await token(); if (!t) { setConn('offline'); return; }
      const r = await fetch(apiUrl(`/api/app-builder/apps?token=${encodeURIComponent(t)}`));
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      if (j.success) { setApps(j.apps); setConn('online'); }
    } catch { setConn('offline'); }
  };

  const pollJob = async (jobId: string) => {
    try {
      const t = await token(); if (!t) return;
      const r = await fetch(apiUrl(`/api/app-builder/jobs/${jobId}?token=${encodeURIComponent(t)}`));
      const j = await r.json();
      if (j.success) {
        setJob(j.job);
        setConn('online');
        if (['SUCCESS', 'FAILED', 'PARTIALLY_COMPLETED', 'CANCELLED'].includes(j.job.status)) {
          clearInterval(pollRef.current); setBusy(false); refreshApps();
        }
      }
    } catch { setConn('offline'); }
  };

  useEffect(() => {
    if (isOpen) { setMsg(''); refreshApps(); }
    else clearInterval(pollRef.current);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  if (!isOpen) return null;

  const build = async () => {
    if (!req.trim()) return;
    setBusy(true); setMsg(''); setJob(null);
    try {
      const t = await token(); if (!t) throw new Error('OFFLINE — backend reachable nahi. Server URL check karo.');
      const r = await fetch(apiUrl('/api/app-builder/jobs'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t, request: req.trim() }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Job create failed');
      setConn('online');
      pollRef.current = setInterval(() => pollJob(j.jobId), 2500);
      pollJob(j.jobId);
    } catch (e: any) {
      setBusy(false); setConn('offline');
      setMsg(e?.message || 'OFFLINE — cloud backend unavailable. Retry karo.');
    }
  };

  const stageIdx = job ? STAGES.indexOf(job.status) : -1;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto bg-gradient-to-br from-slate-900/95 to-slate-800/95 rounded-2xl border border-amber-500/30 p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><Hammer className="w-6 h-6 text-amber-400" /> Cloud App Builder <span className="text-xs font-normal text-slate-400">v1 ☁️</span></h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white"><XCircle className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          {conn === 'online' ? '🟢 CLOUD online — PC OFF ho tab bhi chalega.' : conn === 'offline' ? '🔴 OFFLINE — backend unreachable. Retry karo.' : '… connecting…'}
          {' '}V1: <b>calculator</b>, <b>tic-tac-toe</b>. Apps isolated cloud workspace me bante hain.
        </p>
        <div className="flex gap-2 mb-3">
          <input value={req} onChange={(e) => setReq(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && build()}
            placeholder='e.g. "ek calculator app banao"' className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500" />
          <button disabled={busy || !req.trim()} onClick={build} className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center gap-1.5"><Play className="w-4 h-4" /> {busy ? 'Working…' : 'Build'}</button>
        </div>

        {job && (
          <div className="rounded-xl border border-amber-500/30 bg-black/50 p-3 mb-3">
            <p className="text-xs font-mono text-amber-200 mb-2">{job.id} — <b>{job.status}</b> {job.appId ? `• ${job.appId}` : ''}</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {STAGES.map((s, i) => (
                <span key={s} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${i < stageIdx ? 'bg-emerald-600/40 text-emerald-200' : i === stageIdx ? 'bg-amber-600/60 text-white' : 'bg-slate-700/60 text-slate-400'}`}>{i < stageIdx ? '✓ ' : ''}{s}</span>
              ))}
            </div>
            <div className="font-mono text-[11px] text-emerald-200 max-h-[140px] overflow-y-auto whitespace-pre-wrap">
              {job.logs.slice(-12).join('\n')}
            </div>
            {job.errors.length > 0 && <p className="text-[11px] text-red-300 mt-1">❌ {job.errors.join(' | ').slice(0, 400)}</p>}
            {job.status === 'SUCCESS' && job.artifact?.zip && (
              <p className="text-[11px] text-emerald-300 mt-1">📦 Artifact ready: {job.appId}.zip ({job.testsPassed} tests passed)</p>
            )}
          </div>
        )}
        {msg && <p className="text-xs text-amber-300 mb-3">{msg}</p>}

        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-slate-200">📦 My Apps</h3>
          <button onClick={refreshApps} className="p-1.5 text-slate-400 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
        </div>
        <div className="space-y-2">
          {apps.length === 0 && <p className="text-xs text-slate-500">{conn === 'offline' ? 'OFFLINE — apps load nahi ho paye.' : 'Abhi koi cloud app nahi.'}</p>}
          {apps.map((a: any) => (
            <div key={a.appId} className="p-3 rounded-xl bg-slate-800/60 border border-slate-700">
              <div className="flex items-center justify-between">
                <p className="text-slate-100 text-sm font-semibold">{a.appId} <span className="text-[11px] text-slate-400">• {a.kind} • ✓ {a.testsPassed} tests</span></p>
                <button onClick={async () => {
                  if (!confirm(`Delete ${a.appId}? (confirmation required)`)) return;
                  const t = await token();
                  await fetch(apiUrl(`/api/app-builder/apps/${a.appId}?token=${encodeURIComponent(t || '')}`), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, confirm: true }) });
                  refreshApps();
                }} className="p-2 text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="flex gap-2 mt-1">
                {a.downloadUrl && <a href={a.downloadUrl} className="text-[11px] text-amber-300 underline flex items-center gap-1"><FolderOpen className="w-3 h-3" /> Download ZIP</a>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
