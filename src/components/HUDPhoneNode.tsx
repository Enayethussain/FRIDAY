import React, { useEffect, useState } from 'react';
import { Smartphone, RefreshCw, Send } from 'lucide-react';
import { globalDeviceManager, type RegistryDevice } from '../services/DeviceManager';
import { PcBridgeService } from '../services/PcBridgeService';
import { globalDeviceLink } from '../services/DeviceLinkManager';
import type { ThemeAccent } from '../types';

interface Props {
  theme: ThemeAccent;
  onOpenTransfer: (targetId?: string) => void;
}

/**
 * Permanent phone node(s) around the Orb — every row is a REAL registry
 * device (status from server lastSeen, never assumed). Windows files can be
 * dragged onto a node for a verified transfer; on web it explains honestly.
 */
export function HUDPhoneNode({ theme, onOpenTransfer }: Props) {
  const accent = theme === 'cyan' ? '#FFC400' : theme === 'violet' ? '#a78bfa' : theme === 'emerald' ? '#34d399' : theme === 'amber' ? '#fbbf24' : '#fb7185';
  const [phones, setPhones] = useState<RegistryDevice[]>([]);
  const [state, setState] = useState<'checking' | 'ready' | 'unreachable'>('checking');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [ft, setFt] = useState<{ name: string; pct: number; phase: string } | null>(null);

  const refresh = async () => {
    try {
      const l = await globalDeviceManager.listDevices();
      setPhones(l.devices.filter((d) => d.kind === 'android' || d.kind === 'mobile'));
      setState('ready');
    } catch {
      setState('unreachable');
    }
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(() => { void refresh(); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dropFile = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOver(null);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!PcBridgeService.isDesktop) {
      setFt({ name: f.name, pct: 0, phase: 'BLOCKED: desktop app me drop karo (browser file path nahi de sakta).' });
      return;
    }
    const realPath = window.fridayDesktop!.pathForFile(f);
    if (!realPath) {
      setFt({ name: f.name, pct: 0, phase: 'BLOCKED: real path nahi mila.' });
      return;
    }
    const token = globalDeviceLink.getToken() || (await globalDeviceLink.register().catch(() => null));
    if (!token) {
      setFt({ name: f.name, pct: 0, phase: 'BLOCKED: server offline.' });
      return;
    }
    setFt({ name: f.name, pct: 0, phase: 'UPLOADING 0%' });
    const off = window.fridayDesktop!.onFtProgress((p) => {
      setFt({ name: f.name, pct: Math.round((p.sent / p.total) * 100), phase: `UPLOADING ${Math.round((p.sent / p.total) * 100)}%` });
    });
    try {
      setFt({ name: f.name, pct: 0, phase: 'VERIFYING…' });
      const r = await window.fridayDesktop!.ftSendPath(realPath, token, targetId);
      setFt({ name: r.name, pct: 100, phase: `✓ TRANSFERRED (${Math.round(r.size / 1024)} KB verified)` });
    } catch (err: unknown) {
      setFt({ name: f.name, pct: 0, phase: `TRANSFER FAILED: ${err instanceof Error ? err.message : 'unknown'}` });
    } finally {
      off();
    }
  };

  const statusDot = (d: RegistryDevice) => (
    <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: d.revoked ? '#ef4444' : d.online ? '#34d399' : '#64748b', boxShadow: d.online && !d.revoked ? '0 0 8px #34d399' : 'none' }} />
  );

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', justifyContent: 'center', flexWrap: 'wrap', fontFamily: 'monospace', maxWidth: '100%', padding: '4px 8px' }}>
      {state === 'checking' && <span style={{ fontSize: 10, color: '#64748b', letterSpacing: 1 }}>📱 PHONE: CHECKING…</span>}
      {state === 'unreachable' && <span style={{ fontSize: 10, color: '#f87171', letterSpacing: 1 }}>📱 PHONE: SERVER UNREACHABLE</span>}
      {state === 'ready' && phones.length === 0 && (
        <span style={{ fontSize: 10, color: '#64748b', letterSpacing: 1 }}>📱 NO PAIRED PHONE — Secure Devices se pair karo</span>
      )}
      {phones.map((d) => (
        <div
          key={d.deviceId}
          onDragOver={(e) => { e.preventDefault(); setDragOver(d.deviceId); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => void dropFile(e, d.deviceId)}
          style={{
            display: 'flex', gap: 8, alignItems: 'center',
            border: `1px solid ${dragOver === d.deviceId ? accent : 'rgba(255,255,255,0.12)'}`,
            background: dragOver === d.deviceId ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.45)',
            borderRadius: 14, padding: '8px 12px', minHeight: 48,
            boxShadow: dragOver === d.deviceId ? `0 0 18px ${accent}` : 'none',
          }}
          title={dragOver === d.deviceId ? 'Chhodo — transfer shuru hoga' : 'Windows file yahan drop karo'}
        >
          <Smartphone className="w-4 h-4" style={{ color: accent }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap' }}>📱 {d.name}</div>
            <div style={{ fontSize: 9, color: '#94a3b8', display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
              {statusDot(d)}
              {d.revoked ? 'REVOKED' : d.online ? 'CONNECTED' : 'OFFLINE'}
              <span>• seen {new Date(d.lastSeen).toLocaleTimeString()}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenTransfer(d.deviceId)}
            disabled={!d.online || d.revoked}
            aria-label={`Transfer file to ${d.name}`}
            style={{ minHeight: 44, minWidth: 44, borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: (!d.online || d.revoked) ? 'not-allowed' : 'pointer', opacity: (!d.online || d.revoked) ? 0.4 : 1 }}
          >
            <Send className="w-3.5 h-3.5" style={{ margin: '0 auto' }} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => void refresh()} aria-label="Refresh phone status"
        style={{ minHeight: 44, minWidth: 44, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>
        <RefreshCw className="w-3.5 h-3.5" style={{ margin: '0 auto' }} />
      </button>
      {ft && (
        <div style={{ width: '100%', maxWidth: 420, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: '8px 12px', fontSize: 10, color: '#e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {ft.name}</span>
            <span>{ft.pct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${ft.pct}%`, background: accent, transition: 'width 0.3s' }} />
          </div>
          <div style={{ marginTop: 4, color: ft.phase.startsWith('✓') ? '#34d399' : ft.phase.includes('FAIL') || ft.phase.startsWith('BLOCKED') ? '#f87171' : '#94a3b8' }}>
            {ft.phase.startsWith('UPLOADING') || ft.phase.startsWith('VERIFYING') ? `TRANSFERRING → 📱 ${ft.phase}` : ft.phase}
          </div>
        </div>
      )}
    </div>
  );
}
