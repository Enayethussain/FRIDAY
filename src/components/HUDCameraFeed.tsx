import React, { useEffect, useRef } from 'react';
import { Camera, RefreshCw, X, Eye, Shield } from 'lucide-react';
import { ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface HUDCameraFeedProps {
  videoElement: HTMLVideoElement | null;
  theme: ThemeAccent;
  onFlip: () => void;
  onClose: () => void;
}

export const HUDCameraFeed: React.FC<HUDCameraFeedProps> = ({
  videoElement,
  theme,
  onFlip,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const currentTheme = THEMES[theme] || THEMES.amber;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !videoElement) return;

    videoElement.className = 'w-full h-full object-cover';
    container.innerHTML = '';
    container.appendChild(videoElement);

    return () => {
      if (container.contains(videoElement)) {
        container.removeChild(videoElement);
      }
    };
  }, [videoElement]);

  return (
    <div
      id="hud-camera-feed"
      className="relative w-56 max-w-[68vw] sm:w-80 h-40 sm:h-52 rounded-2xl border bg-black/90 overflow-hidden shadow-2xl backdrop-blur-md animate-in zoom-in-95 duration-200"
      style={{
        borderColor: `${currentTheme.primary}77`,
        boxShadow: `0 0 30px rgba(0,0,0,0.8), 0 0 20px ${currentTheme.primary}33`,
      }}
    >
      {/* Video Container */}
      <div ref={containerRef} className="w-full h-full" />

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

        {/* Center Targeting Crosshair */}
        <div className="absolute inset-0 flex items-center justify-center opacity-40">
          <div
            className="w-12 h-12 rounded-full border border-dashed animate-[spin_12s_linear_infinite]"
            style={{ borderColor: currentTheme.primary }}
          />
        </div>
      </div>

      {/* Top Header Badge */}
      <div className="absolute top-2 left-3 right-3 flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md border border-slate-700/60 text-[10px] font-mono text-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>VISION STREAM (1 FPS)</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onFlip}
            className="p-1 rounded bg-black/60 border border-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Switch front/back camera"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded bg-black/60 border border-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Close camera"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom Status Text */}
      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] font-mono text-slate-300 pointer-events-none bg-black/50 px-2 py-0.5 rounded backdrop-blur-xs">
        <span className="truncate">MULTIMODAL LIVE // PERCEPTION ONLINE</span>
        <span style={{ color: currentTheme.primaryLight }}>FRIDAY CAN SEE</span>
      </div>
    </div>
  );
};
