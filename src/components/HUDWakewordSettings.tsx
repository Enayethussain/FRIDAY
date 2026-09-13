import React, { useState, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { WakewordConfig, WakewordState, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';
import { SoundEffects } from '../utils/SoundEffects';

interface HUDWakewordSettingsProps {
  isOpen: boolean;
  config: WakewordConfig;
  state: WakewordState;
  theme: ThemeAccent;
  onUpdateConfig: (updates: Partial<WakewordConfig>) => void;
  onTestChime: () => void;
  onClose: () => void;
}

const WAKEWORD_OPTIONS = [
  { id: 'hey friday', label: '"Hey Friday"', description: 'Standard Iron Man Stark protocol' },
  { id: 'friday', label: '"Friday"', description: 'Direct single-word activation' },
  { id: 'myraa', label: '"Myraa"', description: 'Alternative companion identity' },
  { id: 'jarvis', label: '"Jarvis"', description: 'Legacy Stark protocol' },
];

export const HUDWakewordSettings: React.FC<HUDWakewordSettingsProps> = ({
  isOpen,
  config,
  state,
  theme,
  onUpdateConfig,
  onTestChime,
  onClose,
}) => {
  const [selectedWord, setSelectedWord] = useState(config.keyword);
  const [enabled, setEnabled] = useState(config.enabled);
  const [audioFeedback, setAudioFeedback] = useState(config.audioFeedback);

  useEffect(() => {
    setSelectedWord(config.keyword);
    setEnabled(config.enabled);
    setAudioFeedback(config.audioFeedback);
  }, [config]);

  if (!isOpen) return null;

  const currentTheme = THEMES[theme] || THEMES.cyan;

  const handleToggleEnable = (newEnabled: boolean) => {
    setEnabled(newEnabled);
    onUpdateConfig({ enabled: newEnabled });
    if (newEnabled) {
      SoundEffects.playWakewordChime();
    }
  };

  const handleSelectWord = (word: string) => {
    setSelectedWord(word);
    onUpdateConfig({ keyword: word });
  };

  const handleToggleAudioFeedback = (feedback: boolean) => {
    setAudioFeedback(feedback);
    onUpdateConfig({ audioFeedback: feedback });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-4">
      <div
        className="relative w-full max-w-md rounded-2xl bg-slate-900 border flex flex-col shadow-2xl overflow-hidden"
        style={{
          borderColor: `${currentTheme.primary}44`,
          boxShadow: `0 0 30px ${currentTheme.primary}15`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border font-mono"
              style={{
                backgroundColor: `${currentTheme.primary}15`,
                borderColor: `${currentTheme.primary}55`,
                color: currentTheme.primary,
              }}
            >
              <Mic className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-100 flex items-center gap-2">
                HANDS-FREE WAKEWORD PROTOCOL
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                Continuous voice activation without tapping
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Status Indicator */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-3 h-3 rounded-full ${
                  state.isListening
                    ? 'bg-emerald-400 animate-ping'
                    : enabled
                    ? 'bg-amber-400'
                    : 'bg-slate-600'
                }`}
              />
              <div>
                <div className="text-xs font-mono font-bold text-slate-200">
                  {state.isListening
                    ? `LISTENING FOR "${config.keyword.toUpperCase()}"`
                    : enabled
                    ? 'STANDBY (CONNECTS ON VOICE)'
                    : 'WAKEWORD DISABLED'}
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {state.isSupported
                    ? 'Browser speech recognition engine active'
                    : 'Speech recognition requires Chromium / Edge or standard browser'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleToggleEnable(!enabled)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer"
              style={{
                backgroundColor: enabled ? `${currentTheme.primary}22` : 'rgba(30, 41, 59, 0.6)',
                borderColor: enabled ? currentTheme.primary : '#475569',
                color: enabled ? currentTheme.primary : '#94a3b8',
                borderWidth: 1,
              }}
            >
              {enabled ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          {/* Wakeword Selector */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 uppercase mb-2">
              Activation Phrase
            </label>
            <div className="grid grid-cols-2 gap-2">
              {WAKEWORD_OPTIONS.map((opt) => {
                const isSelected = selectedWord.toLowerCase() === opt.id.toLowerCase();
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectWord(opt.id)}
                    className="p-2.5 rounded-xl border text-left transition-all cursor-pointer"
                    style={{
                      backgroundColor: isSelected ? `${currentTheme.primary}15` : 'rgba(15, 23, 42, 0.6)',
                      borderColor: isSelected ? currentTheme.primary : 'rgba(51, 65, 85, 0.4)',
                    }}
                  >
                    <div
                      className="text-xs font-mono font-bold"
                      style={{ color: isSelected ? currentTheme.primary : '#e2e8f0' }}
                    >
                      {opt.label}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                      {opt.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Audio Chime on Wake */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {audioFeedback ? (
                <Volume2 className="w-4 h-4 text-cyan-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-500" />
              )}
              <div>
                <div className="text-xs font-mono text-slate-200">
                  Wakeword Acoustic Chime
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  Plays high-tech feedback sound when wakeword is detected
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onTestChime}
                title="Test activation chime"
                className="px-2 py-1 rounded text-[10px] font-mono border border-slate-700 hover:border-cyan-400 text-slate-300"
              >
                Test Sound
              </button>
              <input
                type="checkbox"
                checked={audioFeedback}
                onChange={(e) => handleToggleAudioFeedback(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
              />
            </div>
          </div>

          {/* Last Detected Event */}
          {state.lastDetectedWord && (
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Last heard: "{state.lastDetectedWord}" ({new Date(state.lastDetectedTime || Date.now()).toLocaleTimeString()})
              </span>
            </div>
          )}

          {/* Instructions */}
          <div className="text-[11px] font-mono text-slate-400 bg-slate-950/30 p-3 rounded-xl border border-slate-800/80 leading-relaxed">
            💡 Say <strong>"{config.keyword}"</strong> out loud when FRIDAY is in standby to automatically wake her core and begin speaking immediately without clicking.
          </div>
        </div>
      </div>
    </div>
  );
};
