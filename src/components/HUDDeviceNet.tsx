import React, { useEffect, useState } from 'react';
import { apiUrl } from '../lib/serverUrl';
import { globalDeviceLink } from '../services/DeviceLinkManager';
import type { ThemeAccent } from '../types';

interface HUDDeviceNetProps {
  theme: ThemeAccent;
  onOpenTransfer: () => void;
}

type NetState = 'online' | 'offline' | 'checking';

/**
 * Device Network strip — every dot is a REAL state:
 * THIS = this browser/app instance, PAIRED = server-reported paired device
 * (online = seen <60s), NET = browser online + backend /api/health reachability.
 */
export function HUDDeviceNet({ theme, onOpenTransfer }: HUDDeviceNetProps) {
  const [pairedName, setPairedName] = useState<string | null>(null);
  const [pairedOnline, setPairedOnline] = useState(false);
  const [net, setNet] = useState<NetState>('checking');
  const [dir, setDir] = useState(() => {
    try { return localStorage.getItem('friday_xfer_dir') || 'this-to-paired'; } catch { return 'this-to-paired'; }
  });

  useEffect(() => {
    let alive = true;
    const checkPaired = async () => {
      try {
        const s = await globalDeviceLink.getStatus();
        if (!alive) return;
        setPairedName(s.paired ? `${s.paired.name} (${s.paired.kind})` : null);
        setPairedOnline(!!s.paired?.online);
      } catch { if (alive) { setPairedName(null); setPairedOnline(false); } }
    };
    const checkNet = async () => {
      if (!navigator.onLine) { if (alive) setNet('offline'); return; }
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(apiUrl('/api/health'), { signal: ctrl.signal });
        clearTimeout(t);
        if (alive) setNet(r.ok ? 'online' : 'offline');
      } catch { if (alive) setNet('offline'); }
    };
    checkPaired();
    checkNet();
    const p = setInterval(checkPaired, 10000);
    const n = setInterval(checkNet, 15000);
    const onNet = () => checkNet();
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    return () => { alive = false; clearInterval(p); clearInterval(n); window.removeEventListener('online', onNet); window.removeEventListener('offline', onNet); };
  }, []);

  const changeDir = (v: string) => {
    setDir(v);
    try { localStorage.setItem('friday_xfer_dir', v); } catch { /* noop */ }
  };

  const dot = (on: boolean, warn = false) => (
    <span style={{
      width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
      background: on ? '#34d399' : warn ? '#fbbf24' : '#ef4444',
      boxShadow: `0 0 8px ${on ? '#34d399' : warn ? '#fbbf24' : '#ef4444'}`,
    }} />
  );

  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
      fontFamily: 'monospace', fontSize: 10, letterSpacing: 1, color: '#94a3b8',
      padding: '6px 12px', maxWidth: '100%',
    }}>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{dot(true)} THIS: {globalDeviceLink.getDeviceName()}</span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {dot(pairedOnline, !!pairedName && !pairedOnline)}
        PAIRED: {pairedName ?? '—'}
      </span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{dot(net === 'online', net === 'checking')} NET: {net.toUpperCase()}</span>
      <select
        value={dir}
        onChange={(e) => changeDir(e.target.value)}
        aria-label="File transfer direction"
        style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', color: '#e2e8f0', borderRadius: 10, fontSize: 10, fontFamily: 'monospace', padding: '6px 8px', minHeight: 44 }}
      >
        <option value="this-to-paired">THIS → PAIRED</option>
        <option value="paired-to-this">PAIRED → THIS</option>
      </select>
      <button
        type="button"
        onClick={onOpenTransfer}
        style={{ border: `1px solid ${theme === 'cyan' ? '#FFC400' : '#e2e8f0'}`, color: '#fff', borderRadius: 12, padding: '6px 12px', fontSize: 10, fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', minHeight: 44, cursor: 'pointer' }}
      >
        ⇄ TRANSFER
      </button>
    </div>
  );
}
