import React from 'react';
import {
  Activity,
  Heart,
  Sliders,
  Sparkles,
  Volume2,
  X,
  Zap,
  Gauge,
  Smile,
  ShieldAlert,
  Flame,
  Coffee,
  Check,
} from 'lucide-react';
import { EmotionalMetadata, EmotionalTone, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';
import { TONE_PROFILES } from '../services/EmotionalMetadataProcessor';

interface HUDEmotionalProcessorProps {
  isOpen: boolean;
  metadata: EmotionalMetadata;
  theme: ThemeAccent;
  onSelectTone: (tone: EmotionalTone) => void;
  onClose: () => void;
}

const PRESET_TONES: {
  tone: EmotionalTone;
  name: string;
  icon: React.ElementType;
  desc: string;
  color: string;
}[] = [
  {
    tone: 'neutral',
    name: 'Equilibrium',
    icon: Sliders,
    desc: 'Calm cybernetic baseline • 1.0 Hz • 100% Glow',
    color: '#FFC400',
  },
  {
    tone: 'joyful',
    name: 'Joyful Vibrancy',
    icon: Smile,
    desc: 'Euphoric & radiant • 2.1 Hz • 165% Glow',
    color: '#f59e0b',
  },
  {
    tone: 'excited',
    name: 'High-Energy',
    icon: Flame,
    desc: 'Hyper-energized kinetics • 3.0 Hz • 220% Glow',
    color: '#eab308',
  },
  {
    tone: 'empathetic',
    name: 'Empathic Attunement',
    icon: Heart,
    desc: 'Soft, compassionate breathing • 0.65 Hz • 130% Glow',
    color: '#f43f5e',
  },
  {
    tone: 'playful',
    name: 'Playful Wit',
    icon: Sparkles,
    desc: 'Clever banter & sparkling cadence • 1.85 Hz • 155% Glow',
    color: '#a855f7',
  },
  {
    tone: 'thoughtful',
    name: 'Contemplation',
    icon: Coffee,
    desc: 'Deep analytical focus • 0.55 Hz • 85% Glow',
    color: '#6366f1',
  },
  {
    tone: 'alert',
    name: 'Alert Awareness',
    icon: ShieldAlert,
    desc: 'Urgent caution • 2.7 Hz • 190% Glow',
    color: '#ef4444',
  },
];

export const HUDEmotionalProcessor: React.FC<HUDEmotionalProcessorProps> = ({
  isOpen,
  metadata,
  theme,
  onSelectTone,
  onClose,
}) => {
  if (!isOpen) return null;

  const currentTheme = THEMES[theme] || THEMES.amber;
  const currentToneConfig = TONE_PROFILES[metadata.tone] || TONE_PROFILES.neutral;

  // Normalized percentages for visual bar meters
  const glowPercent = Math.min(100, Math.round((metadata.glowIntensity / 2.5) * 100));
  const freqPercent = Math.min(100, Math.round((metadata.pulseFrequency / 3.5) * 100));
  const valencePercent = Math.min(100, Math.round(((metadata.valence + 1) / 2) * 100));
  const arousalPercent = Math.min(100, Math.round(metadata.arousal * 100));

  return (
    <div
      id="hud-emotional-processor-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-xl rounded-2xl bg-[#090d1a] border shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]"
        style={{
          borderColor: `${metadata.ambientColor}66`,
          boxShadow: `0 0 40px ${metadata.ambientColor}22, 0 20px 40px rgba(0,0,0,0.8)`,
        }}
      >
        {/* Header Bar */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b bg-slate-900/60"
          style={{ borderColor: `${metadata.ambientColor}33` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border animate-pulse"
              style={{
                background: `${metadata.ambientColor}22`,
                borderColor: metadata.ambientColor,
                color: metadata.ambientColor,
              }}
            >
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold font-mono tracking-wider uppercase text-slate-100 flex items-center gap-2">
                EMOTIONAL METADATA PROCESSOR
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-mono font-normal uppercase"
                  style={{
                    background: `${metadata.ambientColor}22`,
                    color: metadata.ambientColor,
                  }}
                >
                  LIVE TELEMETRY
                </span>
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                Acoustic prosody & conversational sentiment calibrating Arc Reactor physics
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close emotional processor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Active Emotional Resonance Status Card */}
          <div
            className="p-4 rounded-xl border relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${metadata.ambientColor}15 0%, #050814 100%)`,
              borderColor: `${metadata.ambientColor}44`,
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full animate-ping"
                    style={{ backgroundColor: metadata.ambientColor }}
                  />
                  <span
                    className="text-xs font-mono font-bold tracking-widest uppercase"
                    style={{ color: metadata.ambientColor }}
                  >
                    CURRENT RESONANCE: {metadata.label}
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-mono mt-1">
                  {metadata.summary || currentToneConfig.summary}
                </p>
              </div>

              {/* Heartbeat Frequency Badge */}
              <div
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-black/40 border self-start sm:self-center"
                style={{ borderColor: `${metadata.ambientColor}33` }}
              >
                <Zap className="w-4 h-4" style={{ color: metadata.ambientColor }} />
                <div className="text-right">
                  <div className="text-xs font-mono font-extrabold text-white">
                    {metadata.pulseFrequency.toFixed(2)} Hz
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    Cycle: {metadata.pulseDuration.toFixed(2)}s
                  </div>
                </div>
              </div>
            </div>

            {/* Live Dual Gauge: Glow Intensity & Pulse Rate */}
            <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-800/80">
              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    Glow Radiance
                  </span>
                  <span className="font-bold text-slate-200">
                    {(metadata.glowIntensity * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${glowPercent}%`,
                      background: `linear-gradient(to right, ${currentTheme.primary}, ${metadata.ambientColor})`,
                      boxShadow: `0 0 10px ${metadata.ambientColor}`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                  <span className="flex items-center gap-1">
                    <Gauge className="w-3 h-3 text-amber-400" />
                    Pulse Frequency
                  </span>
                  <span className="font-bold text-slate-200">
                    {metadata.pulseFrequency.toFixed(1)} Hz
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${freqPercent}%`,
                      background: `linear-gradient(to right, ${metadata.ambientColor}, #f43f5e)`,
                      boxShadow: `0 0 10px ${metadata.ambientColor}`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Valence & Arousal 2-Dimensional Plane */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                  <span>Valence (Positivity)</span>
                  <span className="font-bold text-slate-200">
                    {metadata.valence > 0 ? `+${metadata.valence.toFixed(2)}` : metadata.valence.toFixed(2)}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${valencePercent}%`,
                      backgroundColor: metadata.valence >= 0 ? '#10b981' : '#f43f5e',
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                  <span>Arousal (Energy Level)</span>
                  <span className="font-bold text-slate-200">
                    {(metadata.arousal * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${arousalPercent}%`,
                      backgroundColor: '#eab308',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Tone Calibrator / Test Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-bold flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                CONVERSATION TONE CALIBRATION PRESETS
              </h3>
              <span className="text-[10px] font-mono text-slate-500">
                Click to preview Arc Reactor response
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRESET_TONES.map((preset) => {
                const isSelected = metadata.tone === preset.tone;
                const IconComponent = preset.icon;

                return (
                  <button
                    key={preset.tone}
                    type="button"
                    onClick={() => onSelectTone(preset.tone)}
                    className={`flex items-start gap-3 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 border-white/40 shadow-lg'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-600 hover:bg-slate-900/60'
                    }`}
                    style={{
                      borderColor: isSelected ? preset.color : undefined,
                    }}
                  >
                    <div
                      className="p-2 rounded-lg shrink-0 transition-colors"
                      style={{
                        background: `${preset.color}22`,
                        color: preset.color,
                      }}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-slate-200">
                          {preset.name}
                        </span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5" style={{ color: preset.color }} />
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                        {preset.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Explanation note */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-2 text-[11px] font-mono text-slate-400">
            <Volume2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Real-time Automatic Coupling:</strong> When speaking, FRIDAY's acoustic prosody
              engine measures vocal pitch variance and root-mean-square energy to organically surge the
              Arc Reactor's glow and breathing rhythm in harmony with the conversation.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 px-5 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition-colors cursor-pointer"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};
