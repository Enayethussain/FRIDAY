import React from 'react';
import { ExternalLink, Maximize2, Minimize2, Play, Volume2, X, Youtube } from 'lucide-react';
import { MediaViewportState, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface HUDMediaViewportProps {
  viewport: MediaViewportState;
  theme: ThemeAccent;
  onClose: () => void;
}

export const HUDMediaViewport: React.FC<HUDMediaViewportProps> = ({
  viewport,
  theme,
  onClose,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const currentTheme = THEMES[theme] || THEMES.amber;

  if (!viewport.isOpen) return null;

  return (
    <div
      id="hud-media-viewport-backdrop"
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200`}
      onClick={onClose}
    >
      <div
        id="hud-media-viewport-modal"
        className={`relative w-full rounded-2xl border bg-[#090e1a] shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ${
          isExpanded ? 'max-w-6xl h-[90vh]' : 'max-w-3xl h-[65vh] sm:h-[75vh]'
        }`}
        style={{
          borderColor: `${currentTheme.primary}77`,
          boxShadow: `0 0 50px rgba(0,0,0,0.9), 0 0 30px ${currentTheme.primary}33`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Futuristic Cyber Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#070b14]">
          <div className="flex items-center gap-2.5">
            <div
              className="p-1.5 rounded-lg border text-red-400"
              style={{
                borderColor: `${currentTheme.primary}44`,
                background: `${currentTheme.primary}15`,
              }}
            >
              <Youtube className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-mono font-bold text-slate-100 truncate max-w-xs sm:max-w-md">
                {viewport.title}
              </h3>
              <p className="text-[10px] font-mono text-slate-400">
                FRIDAY In-App Media Streamer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Direct Open in Full Browser Tab */}
            <a
              href={viewport.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors hover:brightness-110"
              style={{
                backgroundColor: currentTheme.primary,
                color: '#020617',
              }}
              title="Open directly in YouTube / External Tab"
            >
              <span>Full Tab</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            {/* Expand / Minimize Toggle */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              aria-label={isExpanded ? 'Minimize viewer' : 'Expand viewer'}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="Close viewport"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Media Frame Container */}
        <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
          <iframe
            id="friday-embedded-media-frame"
            src={viewport.embedUrl}
            title={viewport.title}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        {/* Bottom Status Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#060912] border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>PLAYING IN HUD VIEWPORT</span>
          </div>
          <span className="truncate max-w-xs text-slate-500">
            {viewport.externalUrl}
          </span>
        </div>
      </div>
    </div>
  );
};
