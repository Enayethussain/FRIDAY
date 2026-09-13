import React, { useEffect, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface HUDMicMeterProps {
  getStats: (() => { rms: number; threshold: number; noiseFloor: number; sent: number; blocked: number; voiceDetected: boolean; calibrated: boolean }) | null;
  visible: boolean;
}

export function HUDMicMeter({ getStats, visible }: HUDMicMeterProps) {
  const [stats, setStats] = useState({ rms: 0, threshold: 0.02, noiseFloor: 0, sent: 0, blocked: 0, voiceDetected: false, calibrated: false });

  useEffect(() => {
    if (!visible || !getStats) return;
    const t = setInterval(() => {
      try {
        setStats(getStats());
      } catch {}
    }, 200);
    return () => clearInterval(t);
  }, [visible, getStats]);

  if (!visible) return null;

  const max = Math.max(stats.threshold * 2.5, 0.05);
  const levelPct = Math.min(100, (stats.rms / max) * 100);
  const threshPct = Math.min(100, (stats.threshold / max) * 100);
  const hearing = stats.voiceDetected;

  return (
    <div className="w-full max-w-xl my-1.5 p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 backdrop-blur-md">
      <div className="flex items-center gap-2 mb-1.5">
        {hearing ? <Mic className="w-4 h-4 text-emerald-400" /> : <MicOff className="w-4 h-4 text-slate-500" />}
        <span className={`text-[11px] font-mono font-bold uppercase ${hearing ? 'text-emerald-400' : 'text-slate-500'}`}>
          {hearing ? '● MIC SUN RAHA HAI — BOLO' : '○ MIC SILENT — awaaz threshold se kam'}
        </span>
        <span className="ml-auto text-[10px] font-mono text-slate-500">sent {stats.sent} • blocked {stats.blocked}</span>
      </div>
      <div className="relative h-3 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full transition-all duration-150 ${hearing ? 'bg-emerald-400' : 'bg-slate-600'}`}
          style={{ width: `${levelPct}%` }}
        />
        <div className="absolute top-0 bottom-0 w-0.5 bg-red-400" style={{ left: `${threshPct}%` }} title="Voice threshold" />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] font-mono text-slate-500">level {stats.rms.toFixed(4)}</span>
        <span className="text-[10px] font-mono text-red-400">| threshold {stats.threshold.toFixed(4)}</span>
      </div>
      {!stats.calibrated && <p className="text-[10px] font-mono text-amber-400 mt-1">Calibrating background noise...</p>}
    </div>
  );
}
