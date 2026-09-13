import React from 'react';
import { Mic, Power, Radio, Sparkles, Activity } from 'lucide-react';
import { AssistantState, EmotionalMetadata, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface CentralArcReactorProps {
  state: AssistantState;
  theme: ThemeAccent;
  onToggle: () => void;
  isLoading?: boolean;
  emotionalMetadata?: EmotionalMetadata;
  onOpenEmotionalDiagnostics?: () => void;
}

export const CentralArcReactor: React.FC<CentralArcReactorProps> = ({
  state,
  theme,
  onToggle,
  isLoading = false,
  emotionalMetadata,
  onOpenEmotionalDiagnostics,
}) => {
  const currentTheme = THEMES[theme] || THEMES.cyan;

  const isConnected = state === 'listening' || state === 'speaking';
  const isConnecting = state === 'connecting' || isLoading;
  const isSpeaking = state === 'speaking';
  const isListening = state === 'listening';

  // Dynamic emotional modulation parameters
  const glowMultiplier = emotionalMetadata?.glowIntensity ?? 1.0;
  const pulseFreq = emotionalMetadata?.pulseFrequency ?? 1.0;
  const pulseDuration = emotionalMetadata?.pulseDuration ?? 1.0; // In seconds
  const ambientColor = emotionalMetadata?.ambientColor || currentTheme.primary;
  const emotionalTone = emotionalMetadata?.tone || 'neutral';
  const emotionalLabel = emotionalMetadata?.label || 'EQUILIBRIUM';

  // Dynamic animation speeds in seconds based on pulse frequency
  const radarRotationDuration = isConnected ? `${Math.max(6, 36 / pulseFreq)}s` : '40s';
  const orbitalArcDuration = isConnected
    ? `${Math.max(3, 18 / pulseFreq)}s`
    : isConnecting
    ? '4s'
    : '20s';

  return (
    <div
      id="arc-reactor-container"
      className="relative flex flex-col items-center justify-center select-none py-4 sm:py-6 pb-10 sm:pb-14"
    >
      {/* Deep Background Ambient Bloom - Adjusted by Glow Intensity & Pulse Frequency */}
      <div
        className={`absolute w-72 h-72 sm:w-96 sm:h-96 rounded-full blur-3xl pointer-events-none transition-all duration-700`}
        style={{
          opacity: isConnected
            ? Math.min(1.0, (isSpeaking ? 0.8 : 0.5) * glowMultiplier)
            : 0.2,
          transform: `scale(${isConnected ? Math.min(1.4, 0.95 + glowMultiplier * 0.15) : 0.88})`,
          background: `radial-gradient(circle, ${ambientColor}66 0%, ${currentTheme.primary}22 50%, transparent 70%)`,
          animation: isConnected ? `arcBloom ${pulseDuration}s ease-in-out infinite` : undefined,
        }}
      />

      {/* Outermost Radar Energy Ticks Ring (Rotation speed dynamically governed by pulse frequency) */}
      <div
        className={`absolute w-64 h-64 sm:w-80 sm:h-80 rounded-full border border-dashed border-slate-700/40 pointer-events-none transition-transform duration-1000 ${
          isConnected ? 'animate-[spin_var(--spin-dur)_linear_infinite]' : ''
        }`}
        style={{
          ['--spin-dur' as any]: radarRotationDuration,
          borderColor: isConnected ? `${ambientColor}33` : undefined,
        }}
      >
        <div
          className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full transition-colors duration-500"
          style={{
            backgroundColor: isConnected ? ambientColor : '#475569',
            boxShadow: isConnected ? `0 0 8px ${ambientColor}` : undefined,
          }}
        />
        <div
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full transition-colors duration-500"
          style={{
            backgroundColor: isConnected ? ambientColor : '#475569',
            boxShadow: isConnected ? `0 0 8px ${ambientColor}` : undefined,
          }}
        />
      </div>

      {/* Segmented Orbital Arc Ring (Counter-Clockwise Rotation tied to pulse frequency) */}
      <svg
        className={`absolute w-56 h-56 sm:w-72 sm:h-72 pointer-events-none transition-all ${
          isConnecting
            ? 'animate-[spin_4s_linear_infinite]'
            : isConnected
            ? 'animate-[spin_var(--orb-dur)_linear_infinite_reverse]'
            : 'opacity-40'
        }`}
        style={{
          ['--orb-dur' as any]: orbitalArcDuration,
        }}
        viewBox="0 0 200 200"
      >
        <circle
          cx="100"
          cy="100"
          r="86"
          fill="none"
          stroke={ambientColor}
          strokeWidth="1.5"
          strokeDasharray="16 12 4 12 32 14"
          strokeOpacity={isConnected ? `${Math.min(1.0, 0.6 * glowMultiplier)}` : '0.3'}
          className="transition-colors duration-500"
        />
        <circle
          cx="100"
          cy="100"
          r="78"
          fill="none"
          stroke={currentTheme.primary}
          strokeWidth="1"
          strokeDasharray="8 8"
          strokeOpacity={isConnected ? `${Math.min(0.9, 0.45 * glowMultiplier)}` : '0.2'}
        />
      </svg>

      {/* Dynamic Audio Reactive & Emotional Heartbeat Pulse Waves */}
      {isConnected && (
        <>
          {/* Primary Emotional Expanding Ripple Wave */}
          <div
            className="absolute w-44 h-44 sm:w-56 sm:h-56 rounded-full border-2 pointer-events-none"
            style={{
              borderColor: ambientColor,
              animation: `arcRipple ${pulseDuration}s cubic-bezier(0.1, 0.7, 0.1, 1) infinite`,
              boxShadow: `0 0 ${20 * glowMultiplier}px ${ambientColor}44`,
            }}
          />

          {/* Secondary Breathing Pulse Ring */}
          <div
            className="absolute w-44 h-44 sm:w-56 sm:h-56 rounded-full border pointer-events-none"
            style={{
              borderColor: `${ambientColor}66`,
              animation: `arcPulse ${pulseDuration}s ease-in-out infinite`,
            }}
          />

          {/* Rotating Dashed Energy Track */}
          <div
            className="absolute w-40 h-40 sm:w-52 sm:h-52 rounded-full border border-dashed pointer-events-none"
            style={{
              borderColor: `${ambientColor}44`,
              animation: `spin ${Math.max(5, 15 / pulseFreq)}s linear infinite`,
            }}
          />
        </>
      )}

      {/* Central Core Glassmorphic Activator Button */}
      <button
        id="core-power-trigger"
        type="button"
        onClick={onToggle}
        disabled={isConnecting}
        aria-label={isConnected ? 'Disconnect voice session' : 'Connect voice session'}
        className={`group relative z-10 w-32 h-32 sm:w-40 sm:h-40 rounded-full flex flex-col items-center justify-center transition-all duration-500 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-[#05070f] active:scale-95 cursor-pointer ${
          isConnected
            ? `bg-gradient-to-b from-[#0e1628] to-[#080d19] border-2`
            : `bg-gradient-to-b from-[#0f172a]/90 to-[#020617]/90 border border-slate-700/60 hover:border-slate-500 shadow-xl hover:shadow-[0_0_30px_rgba(6,182,212,0.2)]`
        }`}
        style={{
          borderColor: isConnected ? ambientColor : undefined,
          boxShadow: isConnected
            ? `0 0 ${35 * glowMultiplier}px ${ambientColor}77, 0 0 ${75 * glowMultiplier}px ${currentTheme.primary}44, inset 0 0 ${20 * glowMultiplier}px ${ambientColor}55`
            : undefined,
        }}
      >
        {/* Inner Glowing Core Lens - Driven by Glow Intensity & Emotional Color */}
        <div
          className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all duration-500 ${
            isSpeaking
              ? 'scale-110'
              : isListening
              ? 'scale-100'
              : 'scale-95 group-hover:scale-100'
          }`}
          style={{
            background: isConnected
              ? `radial-gradient(circle, #ffffff 0%, ${ambientColor} 55%, ${currentTheme.primary} 100%)`
              : 'radial-gradient(circle, #334155 0%, #1e293b 80%, #0f172a 100%)',
            boxShadow: isConnected
              ? `0 0 ${25 * glowMultiplier}px ${ambientColor}, 0 0 ${50 * glowMultiplier}px ${ambientColor}88`
              : '0 0 10px rgba(0,0,0,0.5)',
          }}
        >
          {isConnecting ? (
            <Radio className="w-8 h-8 sm:w-10 sm:h-10 text-slate-900 animate-spin" />
          ) : isSpeaking ? (
            <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-slate-950 animate-bounce" />
          ) : isListening ? (
            <Mic className="w-8 h-8 sm:w-10 sm:h-10 text-slate-950 animate-pulse" />
          ) : (
            <Power className="w-8 h-8 sm:w-10 sm:h-10 text-slate-400 group-hover:text-cyan-400 transition-colors" />
          )}
        </div>

        {/* State Label Below Core Icon */}
        <span
          className="mt-2 text-[10px] sm:text-xs font-mono uppercase tracking-widest font-semibold transition-colors"
          style={{
            color: isConnected ? '#ffffff' : '#94a3b8',
            textShadow: isConnected ? `0 0 8px ${ambientColor}` : undefined,
          }}
        >
          {isConnecting
            ? 'SYNCING...'
            : isSpeaking
            ? 'TALKING'
            : isListening
            ? 'ONLINE'
            : 'ACTIVATE'}
        </span>
      </button>

      {/* Floating Cybernetic Emotional Resonance Tag */}
      {isConnected && (
        <button
          type="button"
          onClick={onOpenEmotionalDiagnostics}
          title="Click to open Emotional Metadata Processor diagnostics"
          className="absolute -bottom-4 sm:-bottom-8 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/80 border text-[10px] font-mono tracking-wider uppercase transition-all hover:scale-105 cursor-pointer backdrop-blur-md animate-in fade-in"
          style={{
            borderColor: `${ambientColor}66`,
            color: ambientColor,
            boxShadow: `0 0 15px ${ambientColor}22`,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-ping"
            style={{ backgroundColor: ambientColor }}
          />
          <span className="font-bold">{emotionalLabel}</span>
          <span className="text-slate-400 font-normal">
            • {pulseFreq.toFixed(1)} Hz • {(glowMultiplier * 100).toFixed(0)}% GLOW
          </span>
        </button>
      )}
    </div>
  );
};
