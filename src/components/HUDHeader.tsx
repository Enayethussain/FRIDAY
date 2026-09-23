import React, { useState } from 'react';
import {
  Camera,
  Cpu,
  Info,
  Palette,
  X,
  ShieldCheck,
  Mic,
  Lock,
} from 'lucide-react';
import {
  AssistantState,
  ThemeAccent,
  UserProfile,
  WakewordConfig,
  WakewordState,
} from '../types';
import { THEMES } from '../utils/theme';
import { PWAInstallButton } from './PWAInstallButton';

interface HUDHeaderProps {
  state: AssistantState;
  theme: ThemeAccent;
  isCameraActive: boolean;
  /** Dual-voice indicator: FRIDAY (default) or JARVIS. Minimal pill, existing HUD style. */
  activeVoice?: 'FRIDAY' | 'JARVIS';
  authProfile?: UserProfile;
  wakewordConfig?: WakewordConfig;
  wakewordState?: WakewordState;
  onSelectTheme: (theme: ThemeAccent) => void;
  onOpenWakeword?: () => void;
  onLockSession?: () => void;
  onOpenAuth?: () => void;
}

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
}

export const HUDHeader: React.FC<HUDHeaderProps> = ({
  state,
  theme,
  isCameraActive,
  activeVoice = 'FRIDAY',
  authProfile,
  wakewordConfig,
  wakewordState,
  onSelectTheme,
  onOpenWakeword,
  onLockSession,
  onOpenAuth,
}) => {
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const currentTheme = THEMES[theme] || THEMES.amber;
  const mobile = isMobile();

  const getStatusText = () => {
    switch (state) {
      case 'connecting': return 'ESTABLISHING LINK';
      case 'listening': return isCameraActive ? 'VOICE + VISION' : 'VOICE ACTIVE';
      case 'speaking': return 'SPEAKING';
      case 'disconnected':
      default: return 'STANDBY';
    }
  };

  const getStatusColor = () => {
    switch (state) {
      case 'connecting': return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'listening': case 'speaking': return `${currentTheme.badgeBg}`;
      default: return 'text-slate-400 bg-slate-800/40 border-slate-700/50';
    }
  };

  return (
    <header
      id="hud-header"
      className={`w-full flex items-center justify-between border-b border-slate-800/60 bg-[#030405]/90 backdrop-blur-md z-20 ${mobile ? 'px-4 pt-3 pb-3' : 'px-3 sm:px-6 py-2.5 sm:py-3'}`}
      style={{
        paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
      }}
    >
      {/* LEFT: Logo + Status */}
      <div className="flex items-center gap-2.5">
        <div
          className={`${mobile ? 'w-9 h-9' : 'w-8 h-8 sm:w-9 sm:h-9'} rounded-xl flex items-center justify-center border font-display font-bold text-xs sm:text-sm tracking-tighter shadow-md shrink-0`}
          style={{ borderColor: `${currentTheme.primary}66`, background: `linear-gradient(135deg, ${currentTheme.primary}22, #020617)`, color: currentTheme.primaryLight }}
        >
          FR
        </div>
        <div className="flex items-center gap-2">
          <h1 className={`${mobile ? 'text-base' : 'text-sm sm:text-lg'} font-display font-extrabold tracking-wider text-slate-100`}>
            FRIDAY
          </h1>
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] sm:text-[10px] font-mono font-medium transition-all ${getStatusColor()}`}>
            <span className={`${mobile ? 'w-2 h-2' : 'w-1.5 h-1.5'} rounded-full ${state === 'disconnected' ? 'bg-slate-500' : state === 'connecting' ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-pulse'}`} />
            {!mobile && <span className="tracking-wider uppercase">{getStatusText()}</span>}
            {mobile && <span className="tracking-wider uppercase text-[9px]">{state === 'disconnected' ? 'OFF' : state === 'connecting' ? 'LINK' : state === 'speaking' ? 'LIVE' : 'ON'}</span>}
          </div>
          {/* Dual-voice indicator (minimal): shows the REAL active TTS voice. */}
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-mono font-semibold tracking-wider uppercase"
            title={`Active voice: ${activeVoice}`}
            aria-label={`Active voice ${activeVoice}`}
            style={{
              borderColor: `${currentTheme.primary}66`,
              background: `${currentTheme.primary}12`,
              color: currentTheme.primaryLight,
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeVoice === 'JARVIS' ? 'bg-sky-400' : 'bg-pink-400'} animate-pulse`} />
            {activeVoice === 'JARVIS' ? 'JARVIS VOICE' : 'FRIDAY VOICE'}
          </div>
        </div>
      </div>

      {/* RIGHT: Mobile = Lock only. PC = everything. */}
      <div className="flex items-center gap-2">
        {mobile ? (
          <>
            {/* Mobile: Wakeword indicator + Lock */}
            {wakewordConfig?.enabled && wakewordState?.isListening && (
              <button onClick={onOpenWakeword} className="p-2 rounded-xl border" style={{ borderColor: currentTheme.primary, color: currentTheme.primary }}>
                <Mic className="w-4 h-4 animate-pulse" />
              </button>
            )}
            {onLockSession && (
              <button onClick={onLockSession} title="Lock FRIDAY" className="p-2 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300 hover:text-red-400 hover:border-red-500/50 transition-colors">
                <Lock className="w-5 h-5" />
              </button>
            )}
          </>
        ) : (
          <>
            {/* PC: full header */}
            {wakewordConfig && (
              <button onClick={onOpenWakeword} title={`Wakeword: "${wakewordConfig.keyword}"`} className="flex items-center gap-1 p-1.5 sm:px-2 sm:py-1.5 rounded-lg border text-xs font-mono transition-all hover:scale-105 cursor-pointer" style={{ backgroundColor: wakewordConfig.enabled ? `${currentTheme.primary}15` : 'rgba(15,23,42,0.6)', borderColor: wakewordConfig.enabled ? currentTheme.primary : 'rgba(51,65,85,0.6)', color: wakewordConfig.enabled ? currentTheme.primary : '#94a3b8' }}>
                <Mic className="w-3.5 h-3.5" />
                {wakewordState?.isListening && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute -top-1 -right-1" />}
              </button>
            )}
            <PWAInstallButton theme={theme} />
            <div className="relative">
              <button onClick={() => setShowThemePicker(!showThemePicker)} className="p-1.5 sm:p-2 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer">
                <Palette className="w-4 h-4" style={{ color: currentTheme.primary }} />
              </button>
              {showThemePicker && (
                <div className="absolute right-0 mt-2 w-48 p-2 rounded-xl border border-slate-700/80 bg-[#080A0D] shadow-2xl backdrop-blur-xl z-50">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 px-2 py-1 mb-1">Accent Core</div>
                  <div className="space-y-1">
                    {(Object.keys(THEMES) as ThemeAccent[]).map((key) => {
                      const t = THEMES[key]; const sel = theme === key;
                      return <button key={key} onClick={() => { onSelectTheme(key); setShowThemePicker(false); }} className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono ${sel ? 'bg-slate-800/80 text-white font-semibold' : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'}`}><div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.primary }} /><span>{t.name}</span></div>{sel && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.primary }} />}</button>;
                    })}
                  </div>
                </div>
              )}
            </div>
            {onLockSession && (
              <button onClick={onLockSession} title="Lock FRIDAY Core" className="p-1.5 sm:p-2 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-colors cursor-pointer">
                <Lock className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => setShowInfoModal(true)} className="p-1.5 sm:p-2 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-colors cursor-pointer">
              <Info className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Info Dialog (PC only) */}
      {!mobile && showInfoModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowInfoModal(false)}>
          <div className="w-full max-w-md bg-[#080A0D] border border-slate-700/80 rounded-2xl p-6 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowInfoModal(false)} className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"><X className="w-5 h-5" /></button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center border" style={{ borderColor: `${currentTheme.primary}66`, background: `${currentTheme.primary}15`, color: currentTheme.primaryLight }}><Cpu className="w-5 h-5" /></div>
              <div><h3 className="font-display font-bold text-slate-100 text-lg">FRIDAY AI Matrix</h3><p className="text-xs font-mono text-slate-400">Gemini 3.1 Flash Live Protocol</p></div>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-800 flex justify-end">
              <button onClick={() => setShowInfoModal(false)} className="px-4 py-2 rounded-xl text-xs font-mono font-medium" style={{ backgroundColor: currentTheme.primary, color: '#020617' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
