import React, { useEffect, useState } from 'react';

/** Fixed HUD corner brackets — pure decoration, clicks pass through */
export const HUDFrameCorners: React.FC<{ accent: string }> = ({ accent }) => {
  const base = 'pointer-events-none absolute z-40 h-7 w-7 sm:h-9 sm:w-9';
  const border = (pos: string) => ({
    borderColor: `${accent}88`,
    boxShadow: `0 0 12px ${accent}33`,
  });
  return (
    <div className="pointer-events-none fixed inset-2 sm:inset-3 z-40" aria-hidden="true">
      <div className={`${base} left-0 top-0 border-l-2 border-t-2`} style={border('tl')} />
      <div className={`${base} right-0 top-0 border-r-2 border-t-2`} style={border('tr')} />
      <div className={`${base} bottom-0 left-0 border-b-2 border-l-2`} style={border('bl')} />
      <div className={`${base} bottom-0 right-0 border-b-2 border-r-2`} style={border('br')} />
    </div>
  );
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
