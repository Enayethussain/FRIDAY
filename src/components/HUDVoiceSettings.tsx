import React, { useState } from 'react';
import { Mic, Volume2, X, Sliders, Check, Smartphone } from 'lucide-react';
import { LiveVoice, ThemeAccent, WitLevel } from '../types';
import { THEMES } from '../utils/theme';
import { HapticFeedback } from '../utils/HapticFeedback';

interface HUDVoiceSettingsProps {
  isOpen: boolean;
  currentVoice: LiveVoice;
  currentWit: WitLevel;
  theme: ThemeAccent;
  onSelectVoice: (voice: LiveVoice) => void;
  onSelectWit: (wit: WitLevel) => void;
  onClose: () => void;
}

const VOICES: { id: LiveVoice; name: string; desc: string; tone: string }[] = [
  { id: 'Aoede', name: 'Aoede · FRIDAY', desc: 'Warm, energetic, charismatic female voice — FRIDAY default (Recommended)', tone: 'Natural & Expressive' },
  { id: 'Kore', name: 'Kore', desc: 'Smooth, relaxed, clear and calm tone', tone: 'Calm & Professional' },
  { id: 'Puck', name: 'Puck', desc: 'Playful, lively, spirited tempo', tone: 'Cheerful & Upbeat' },
  { id: 'Fenrir', name: 'Fenrir · JARVIS', desc: 'Deep, calm, sophisticated male voice — JARVIS voice (PRO)', tone: 'Bold & Crisp' },
  { id: 'Zephyr', name: 'Zephyr', desc: 'Soft-spoken, mellow, reflective voice', tone: 'Warm & Gentle' },
];

const WIT_LEVELS: { id: WitLevel; title: string; desc: string }[] = [
  { id: 'polite', title: 'Polite & Efficient', desc: 'Courteous, direct, and strictly professional.' },
  { id: 'balanced', title: 'Balanced Companion', desc: 'Friendly, warm, and helpful.' },
  { id: 'witty', title: 'Witty & Charming (Default)', desc: 'Playful humor, clever remarks, and lively banter.' },
  { id: 'sarcastic', title: 'Full Stark Sarcasm', desc: 'Dry wit, playful teasing, and sharp banter.' },
];

export const HUDVoiceSettings: React.FC<HUDVoiceSettingsProps> = ({
  isOpen,
  currentVoice,
  currentWit,
  theme,
  onSelectVoice,
  onSelectWit,
  onClose,
}) => {
  const currentTheme = THEMES[theme] || THEMES.amber;
  const [hapticsEnabled, setHapticsEnabled] = useState(HapticFeedback.isEnabled());

  if (!isOpen) return null;

  return (
    <div
      id="voice-settings-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="voice-settings-modal"
        className="w-full max-w-lg bg-[#0a0f1e] border border-slate-700/90 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
        style={{
          boxShadow: `0 0 50px rgba(0,0,0,0.8), 0 0 25px ${currentTheme.primary}22`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border"
            style={{
              borderColor: `${currentTheme.primary}66`,
              background: `${currentTheme.primary}18`,
              color: currentTheme.primaryLight,
            }}
          >
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-slate-100 text-lg">Voice & Persona Matrix</h3>
            <p className="text-xs font-mono text-slate-400">Configure FRIDAY's neural acoustic model</p>
          </div>
        </div>

        {/* Voice Selection */}
        <div className="mb-6">
          <label className="text-xs font-mono uppercase tracking-wider text-slate-400 block mb-2.5">
            Synthetic Voice Model
          </label>
          <div className="space-y-2">
            {VOICES.map((v) => {
              const isSelected = currentVoice === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelectVoice(v.id)}
                  className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800/80 border-amber-500 shadow-md'
                      : 'bg-slate-900/50 border-slate-800 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                  style={{
                    borderColor: isSelected ? currentTheme.primary : undefined,
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-100">{v.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {v.tone}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{v.desc}</p>
                  </div>
                  {isSelected && (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-slate-950 shrink-0 ml-2"
                      style={{ backgroundColor: currentTheme.primary }}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Banter & Wit Level */}
        <div>
          <label className="text-xs font-mono uppercase tracking-wider text-slate-400 block mb-2.5">
            Banter & Wit Dial
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {WIT_LEVELS.map((w) => {
              const isSelected = currentWit === w.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onSelectWit(w.id)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800/80 shadow-md'
                      : 'bg-slate-900/50 border-slate-800 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                  style={{
                    borderColor: isSelected ? currentTheme.primary : undefined,
                  }}
                >
                  <div className="font-mono font-bold text-xs text-slate-100 mb-1">{w.title}</div>
                  <div className="text-[11px] text-slate-400 font-sans leading-tight">{w.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile Tactile Haptics (navigator.vibrate) */}
        <div className="mt-6 pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 mt-0.5">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-mono font-bold text-slate-200 block">
                  Tactile Haptic Feedback (Mobile)
                </span>
                <span className="text-[11px] text-slate-400 font-sans block leading-tight">
                  Triggers physical vibration patterns on core state changes: connecting [35,45,40ms], listening [45ms], and speaking [25,40,30ms].
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !hapticsEnabled;
                setHapticsEnabled(next);
                HapticFeedback.setEnabled(next);
              }}
              className={`px-3 py-1 rounded-full text-xs font-mono font-semibold transition-all shrink-0 cursor-pointer ${
                hapticsEnabled
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/60 shadow-[0_0_10px_rgba(255,196,0,0.3)]'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {hapticsEnabled ? 'ACTIVE' : 'MUTED'}
            </button>
          </div>

          {hapticsEnabled && (
            <div className="mt-3 flex flex-wrap items-center gap-2 bg-black/40 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Test Vibration:</span>
              <button
                type="button"
                onClick={() => HapticFeedback.triggerStateHaptic('connecting')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400/50 text-[10px] font-mono text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
              >
                Connecting [35,45,40]
              </button>
              <button
                type="button"
                onClick={() => HapticFeedback.triggerStateHaptic('listening')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400/50 text-[10px] font-mono text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
              >
                Listening [45ms]
              </button>
              <button
                type="button"
                onClick={() => HapticFeedback.triggerStateHaptic('speaking')}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400/50 text-[10px] font-mono text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
              >
                Speaking [25,40,30]
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-colors cursor-pointer"
            style={{
              backgroundColor: currentTheme.primary,
              color: '#020617',
            }}
          >
            Apply Configuration
          </button>
        </div>
      </div>
    </div>
  );
};
