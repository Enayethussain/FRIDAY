import React, { useEffect, useRef, useState } from 'react';
import { Monitor, X, Maximize2, Minimize2, Sparkles, BookOpen } from 'lucide-react';
import { ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface HUDScreenFeedProps {
  videoElement: HTMLVideoElement | null;
  theme: ThemeAccent;
  resolution?: { width: number; height: number };
  streamLabel?: string;
  onClose: () => void;
  onOpenStudyMatrix?: () => void;
}

export const HUDScreenFeed: React.FC<HUDScreenFeedProps> = ({
  videoElement,
  theme,
  resolution,
  streamLabel,
  onClose,
  onOpenStudyMatrix,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const currentTheme = THEMES[theme] || THEMES.cyan;
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !videoElement) return;

    videoElement.className = 'w-full h-full object-contain bg-black';
    container.innerHTML = '';
    container.appendChild(videoElement);

    return () => {
      if (container.contains(videoElement)) {
        container.removeChild(videoElement);
      }
    };
  }, [videoElement]);

  const resText = resolution && resolution.width > 0 ? `${resolution.width}x${resolution.height}` : 'LIVE';

  return (
    <div
      id="hud-screen-feed"
      className={`fixed z-30 transition-all duration-300 rounded-2xl border bg-black/95 overflow-hidden shadow-2xl backdrop-blur-xl ${
        isExpanded
          ? 'bottom-20 right-4 sm:right-8 w-[92vw] sm:w-[620px] h-[380px] sm:h-[420px]'
          : 'bottom-20 right-4 sm:right-8 w-72 sm:w-84 h-48 sm:h-56'
      }`}
      style={{
        borderColor: `${currentTheme.primary}88`,
        boxShadow: `0 0 35px rgba(0,0,0,0.9), 0 0 25px ${currentTheme.primary}44`,
      }}
    >
      {/* Video Viewport Container */}
      <div ref={containerRef} className="w-full h-full flex items-center justify-center" />

      {/* Cybernetic HUD Reticle Overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Corner Brackets */}
        <div
          className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2"
          style={{ borderColor: currentTheme.primary }}
        />
        <div
          className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2"
          style={{ borderColor: currentTheme.primary }}
        />
        <div
          className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2"
          style={{ borderColor: currentTheme.primary }}
        />
        <div
          className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2"
          style={{ borderColor: currentTheme.primary }}
        />

        {/* Scan lines & Grid matrix */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.25)_51%)] bg-[length:100%_4px] opacity-30" />
      </div>

      {/* Top Controls Header */}
      <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/80 backdrop-blur-md border border-emerald-500/40 text-[10px] font-mono text-emerald-300 shadow-md">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold tracking-wider">FRIDAY WATCHING SCREEN</span>
          <span className="text-slate-400">({resText})</span>
        </div>

        <div className="flex items-center gap-1">
          {onOpenStudyMatrix && (
            <button
              type="button"
              onClick={onOpenStudyMatrix}
              className="p-1 rounded bg-black/70 border border-slate-700 text-slate-300 hover:text-cyan-300 transition-colors"
              title="Open Study Syllabus"
            >
              <BookOpen className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded bg-black/70 border border-slate-700 text-slate-300 hover:text-white transition-colors"
            title={isExpanded ? 'Minimize Viewfinder' : 'Expand Viewfinder'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded bg-black/70 border border-rose-900/60 text-rose-300 hover:text-rose-100 hover:bg-rose-950/80 transition-colors"
            title="Stop Screen Watching"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom Status Ticker */}
      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[9px] font-mono text-slate-400 pointer-events-none">
        <span className="truncate max-w-[170px] text-slate-300 flex items-center gap-1">
          <Monitor className="w-2.5 h-2.5 text-cyan-400 inline" />
          {streamLabel || 'Screen Vision Feed'}
        </span>
        <div className="flex items-center gap-1 text-emerald-400">
          <Sparkles className="w-2.5 h-2.5 animate-spin" />
          <span>TEACHER VISION ACTIVE</span>
        </div>
      </div>
    </div>
  );
};
