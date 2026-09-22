import React, { useState } from 'react';
import { usePWAInstall } from './usePWAInstall';
import { Download } from 'lucide-react';
import { ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface PWAInstallButtonProps {
  theme?: ThemeAccent;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ theme = 'cyan' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const currentTheme = THEMES[theme];

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border text-[10px] font-mono transition-all hover:scale-105 cursor-pointer"
        style={{
          borderColor: currentTheme.primary,
          color: '#0f172a',
          backgroundColor: currentTheme.primary,
        }}
        title="Install FRIDAY App"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline font-bold uppercase tracking-wider">Install App</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border text-[10px] font-mono transition-all hover:scale-105 cursor-pointer"
          style={{
            borderColor: currentTheme.primary,
            color: '#0f172a',
            backgroundColor: currentTheme.primary,
          }}
          title="Install FRIDAY App on iOS"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline font-bold uppercase tracking-wider">Install App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="w-full max-w-sm rounded-xl bg-slate-900 border border-slate-700/80 p-6 shadow-2xl relative">
              <h3 className="text-lg font-semibold text-slate-100 font-display mb-4 flex items-center gap-2">
                <Download className="w-5 h-5 text-amber-400" />
                Install on iPhone / iPad
              </h3>
              <div className="space-y-3 text-sm text-slate-300 font-sans p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                <p className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">1.</span>
                  <span>Tap the <strong>Share</strong> button in the Safari toolbar at the bottom of your screen.</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">2.</span>
                  <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
                </p>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="px-4 py-2 rounded-lg text-xs font-mono font-medium transition-colors"
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${currentTheme.primary}40`,
                    color: currentTheme.primaryLight,
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
