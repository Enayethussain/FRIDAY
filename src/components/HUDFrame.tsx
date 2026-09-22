import React, { useEffect, useState } from 'react';

/**
 * Global HUD corner brackets — REMOVED per UI cleanup.
 * The top-left / top-right / bottom-left / bottom-right decorative lines are
 * gone completely (this component now renders nothing, so no empty spacing
 * is left behind). Kept as a no-op export so existing imports keep working.
 * Functional viewfinder reticles (camera/screen feeds) are untouched.
 */
export const HUDFrameCorners: React.FC<{ accent: string }> = () => {
  return null;
};

const BOOT_LINES = [
  'NEURAL CORE ................ ONLINE',
  'VOICE MATRIX ............... ARMED',
  'MEMORY SYNapses ............ SYNCED',
  'SECURITY PROTOCOL .......... L5 ACTIVE',
];

/** Short boot sequence on load — click to skip */
export const BootOverlay: React.FC<{ accent: string; accentLight: string }> = ({ accent, accentLight }) => {
  const [visible, setVisible] = useState(true);
  const [lines, setLines] = useState(0);

  useEffect(() => {
    const timers: any[] = [];
    BOOT_LINES.forEach((_, i) => {
      timers.push(setTimeout(() => setLines(i + 1), 350 + i * 280));
    });
    timers.push(setTimeout(() => setVisible(false), 350 + BOOT_LINES.length * 280 + 500));
    return () => timers.forEach(clearTimeout);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#02040a]/95 backdrop-blur-md cursor-pointer"
      onClick={() => setVisible(false)}
      style={{ animation: 'bootFlicker 2.2s linear' }}
    >
      <div className="w-full max-w-md px-8 text-center">
        <div className="font-display text-5xl sm:text-6xl font-black tracking-widest" style={{ color: accentLight, textShadow: `0 0 30px ${accent}` }}>
          FRIDAY
        </div>
        <div className="mt-1 font-mono text-[11px] tracking-[0.4em] text-slate-500">
          PERSONAL INTELLIGENCE SYSTEM
        </div>
        <div className="mt-6 space-y-1.5 text-left font-mono text-[11px] sm:text-xs" style={{ color: accent }}>
          {BOOT_LINES.slice(0, lines).map((l) => (
            <div key={l} className="animate-in fade-in">{`> ${l}`}</div>
          ))}
        </div>
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full" style={{ background: accent, boxShadow: `0 0 12px ${accent}`, animation: 'bootBar 2s ease-out forwards' }} />
        </div>
        <div className="mt-3 font-mono text-[10px] text-slate-600">TAP TO SKIP</div>
      </div>
    </div>
  );
};
