import React, { useState } from 'react';
import {
  Sparkles,
  Sun,
  Flame,
  Moon,
  Shield,
  Play,
  CheckCircle2,
  AlertTriangle,
  X,
  Activity,
  Terminal,
  Zap,
} from 'lucide-react';
import { ProtocolDefinition, ProtocolId, ThemeAccent } from '../types';
import { PROTOCOLS, globalProtocolManager } from '../services/ProtocolManager';
import { THEMES } from '../utils/theme';
import { SoundEffects } from '../utils/SoundEffects';
import { HapticFeedback } from '../utils/HapticFeedback';

interface HUDProtocolManagerProps {
  isOpen: boolean;
  theme: ThemeAccent;
  onClose: () => void;
  onThemeChange: (theme: ThemeAccent) => void;
  onSetTimer: (seconds: number, label: string) => void;
  onActionCard: (card: any) => void;
}

export const HUDProtocolManager: React.FC<HUDProtocolManagerProps> = ({
  isOpen,
  theme,
  onClose,
  onThemeChange,
  onSetTimer,
  onActionCard,
}) => {
  const currentTheme = THEMES[theme] || THEMES.amber;
  const [selectedProtocolId, setSelectedProtocolId] = useState<ProtocolId>('morning_briefing');
  const [executing, setExecuting] = useState<boolean>(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);
  const [protocolResult, setProtocolResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedProtocol =
    PROTOCOLS.find((p) => p.id === selectedProtocolId) || PROTOCOLS[0];

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Sun':
        return <Sun className="w-5 h-5 text-amber-400" />;
      case 'Sparkles':
        return <Sparkles className="w-5 h-5 text-violet-400" />;
      case 'Flame':
        return <Flame className="w-5 h-5 text-rose-500" />;
      case 'Moon':
        return <Moon className="w-5 h-5 text-amber-400" />;
      default:
        return <Shield className="w-5 h-5 text-amber-400" />;
    }
  };

  const handleRunProtocol = async () => {
    setExecuting(true);
    setProtocolResult(null);
    HapticFeedback.tap();
    SoundEffects.playSubtleBeep();

    // Sequentially step through execution indicators
    for (let i = 0; i < selectedProtocol.steps.length; i++) {
      setActiveStepIndex(i);
      SoundEffects.playSubtleBeep();
      await new Promise((resolve) => setTimeout(resolve, 380));
    }

    const res = await globalProtocolManager.executeProtocol(selectedProtocol.id, {
      onThemeChange,
      onSetTimer,
      onActionCard,
    });

    setActiveStepIndex(selectedProtocol.steps.length);
    setProtocolResult(res.summary);
    setExecuting(false);
  };

  return (
    <div
      id="hud-protocols-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border bg-slate-950/95 shadow-2xl overflow-hidden text-slate-100"
        style={{
          borderColor: `${currentTheme.primary}77`,
          boxShadow: `0 0 50px rgba(0,0,0,0.9), 0 0 30px ${currentTheme.primary}33`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b bg-slate-900/60"
          style={{ borderColor: `${currentTheme.primary}33` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg border flex items-center justify-center"
              style={{
                backgroundColor: `${currentTheme.primary}20`,
                borderColor: `${currentTheme.primary}50`,
                color: currentTheme.primary,
              }}
            >
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-white">
                  Autonomous Tactical Protocols
                </h3>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase"
                  style={{
                    backgroundColor: `${currentTheme.primary}20`,
                    color: currentTheme.primary,
                    border: `1px solid ${currentTheme.primary}40`,
                  }}
                >
                  CLEAN SLATE // MK-IV
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400">
                1-Click & Voice Orchestration for Routine Stark Missions
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[440px]">
          {/* Left: Protocols Selector */}
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-800 bg-black/40 p-3 overflow-y-auto shrink-0 flex flex-col gap-2">
            <span className="text-[10px] font-mono tracking-widest uppercase text-slate-400 px-1 font-bold">
              Select Defense / Utility Protocol
            </span>
            {PROTOCOLS.map((proto) => {
              const isSelected = selectedProtocolId === proto.id;
              return (
                <button
                  key={proto.id}
                  type="button"
                  onClick={() => {
                    setSelectedProtocolId(proto.id);
                    setProtocolResult(null);
                    setActiveStepIndex(-1);
                    SoundEffects.playSubtleBeep();
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 border-amber-500/60 shadow-[0_0_15px_rgba(255,196,0,0.15)]'
                      : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-900/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <div className="p-1 rounded-lg bg-black/50 border border-slate-800">
                      {getIcon(proto.icon)}
                    </div>
                    <div>
                      <div className="text-xs font-mono font-bold text-white">
                        {proto.name}
                      </div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400/90 font-semibold">
                        {proto.callsign}
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans leading-tight">
                    {proto.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Right: Protocol Breakdown & Execution Step Matrix */}
          <div className="flex-1 flex flex-col p-4 sm:p-6 bg-[#070b14] overflow-y-auto justify-between">
            <div>
              {/* Header Info */}
              <div className="flex items-start justify-between mb-4 pb-4 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-mono text-amber-400 uppercase tracking-widest block mb-1">
                    AUTONOMOUS DIRECTIVE // {selectedProtocol.callsign}
                  </span>
                  <h4 className="text-lg font-mono font-bold text-white">
                    {selectedProtocol.name}
                  </h4>
                  <p className="text-xs text-slate-300 font-sans mt-1 max-w-xl">
                    {selectedProtocol.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRunProtocol}
                  disabled={executing}
                  className="px-5 py-2.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 shadow-lg transition-all cursor-pointer active:scale-95 disabled:opacity-50 shrink-0"
                  style={{
                    backgroundColor: currentTheme.primary,
                    color: '#020617',
                    boxShadow: `0 0 20px ${currentTheme.primary}77`,
                  }}
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{executing ? 'Executing Protocol...' : 'Initiate Protocol'}</span>
                </button>
              </div>

              {/* Execution Steps Sequence */}
              <div className="space-y-2 mb-4">
                <span className="text-[11px] font-mono uppercase text-slate-400 tracking-wider font-bold block mb-2">
                  Telemetry Step Pipeline
                </span>
                {selectedProtocol.steps.map((step, idx) => {
                  const isDone = activeStepIndex > idx;
                  const isCurrent = activeStepIndex === idx;

                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl border transition-all flex items-center gap-3 ${
                        isDone
                          ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                          : isCurrent
                          ? 'bg-amber-950/40 border-amber-500 text-amber-200 shadow-[0_0_15px_rgba(255,196,0,0.2)]'
                          : 'bg-black/30 border-slate-800/80 text-slate-400'
                      }`}
                    >
                      <div className="shrink-0">
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : isCurrent ? (
                          <div className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                        ) : (
                          <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] font-mono flex items-center justify-center text-slate-400">
                            {idx + 1}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono">{step}</span>
                    </div>
                  );
                })}
              </div>

              {/* Spoken / Terminal Result Message */}
              {protocolResult && (
                <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/40 animate-in fade-in">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold mb-1">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Directive Execution Debrief</span>
                  </div>
                  <p className="text-xs font-mono text-slate-200 leading-relaxed">
                    {protocolResult}
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Voice Command Helper */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>Voice activation enabled: "FRIDAY, initiate Protocol Clean Slate"</span>
              <span className="text-amber-400 font-bold">ARC REACTOR COMPATIBLE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
