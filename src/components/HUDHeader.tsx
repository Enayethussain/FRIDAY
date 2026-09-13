import React, { useState } from 'react';
import {
  Camera,
  CheckSquare,
  Cpu,
  FileText,
  Globe,
  HardDrive,
  Info,
  Palette,
  Sliders,
  X,
  Activity,
  Brain,
  ShieldCheck,
  Mic,
  Lock,
  Monitor,
  GraduationCap,
  Code2,
  Network,
  Zap,
  ClipboardList,
  Calculator,
  Calendar,
  Terminal,
} from 'lucide-react';
import {
  AssistantState,
  EmotionalMetadata,
  StudyCurriculum,
  ThemeAccent,
  UserProfile,
  WakewordConfig,
  WakewordState,
} from '../types';
import { THEMES } from '../utils/theme';
import { HUDWorkspaceStatus } from './HUDWorkspaceStatus';
import { PWAInstallButton } from './PWAInstallButton';

interface HUDHeaderProps {
  state: AssistantState;
  theme: ThemeAccent;
  isCameraActive: boolean;
  isScreenWatching?: boolean;
  curriculum?: StudyCurriculum;
  notesCount: number;
  tasksCount: number;
  filesCount: number;
  memoriesCount?: number;
  activeLanguage: string;
  emotionalMetadata?: EmotionalMetadata;
  authProfile?: UserProfile;
  wakewordConfig?: WakewordConfig;
  wakewordState?: WakewordState;
  onSelectTheme: (theme: ThemeAccent) => void;
  onToggleCamera: () => void;
  onToggleScreenWatch?: () => void;
  onOpenStudyMatrix?: () => void;
  onOpenNotes: () => void;
  onOpenTasks: () => void;
  onOpenFiles: () => void;
  onOpenLanguages: () => void;
  onOpenVoiceSettings: () => void;
  onOpenMemories?: () => void;
  onOpenAuth?: () => void;
  onOpenWakeword?: () => void;
  onLockSession?: () => void;
  onOpenEmotionalProcessor?: () => void;
  onOpenWorkbench?: () => void;
  onOpenProtocols?: () => void;
  onOpenKnowledgeGraph?: () => void;
  onOpenDebrief?: () => void;
  onOpenCalculator?: () => void;
  onOpenPrivateVault?: () => void;
  onOpenRoutinePreferences?: () => void;
  onOpenDesktopBridge?: () => void;
  onOpenImageGenerator?: () => void;
  onOpenVoiceEnrollment?: () => void;
  isPrivateVaultUnlocked?: boolean;
}

export const HUDHeader: React.FC<HUDHeaderProps> = ({
  state,
  theme,
  isCameraActive,
  isScreenWatching = false,
  curriculum,
  notesCount,
  tasksCount,
  filesCount,
  memoriesCount = 0,
  activeLanguage,
  emotionalMetadata,
  authProfile,
  wakewordConfig,
  wakewordState,
  onSelectTheme,
  onToggleCamera,
  onToggleScreenWatch,
  onOpenStudyMatrix,
  onOpenNotes,
  onOpenTasks,
  onOpenFiles,
  onOpenLanguages,
  onOpenVoiceSettings,
  onOpenMemories,
  onOpenAuth,
  onOpenWakeword,
  onLockSession,
  onOpenEmotionalProcessor,
  onOpenWorkbench,
  onOpenProtocols,
  onOpenKnowledgeGraph,
  onOpenDebrief,
  onOpenCalculator,
  onOpenPrivateVault,
  onOpenRoutinePreferences,
  onOpenDesktopBridge,
  onOpenImageGenerator,
  onOpenVoiceEnrollment,
  isPrivateVaultUnlocked = false,
}) => {
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const currentTheme = THEMES[theme] || THEMES.cyan;

  const getStatusText = () => {
    switch (state) {
      case 'connecting':
        return 'ESTABLISHING QUANTUM LINK';
      case 'listening':
        return isCameraActive ? 'VOICE & VISION STREAM' : 'VOICE STREAM ACTIVE';
      case 'speaking':
        return 'SYNTHESIZING SPEECH (24kHz)';
      case 'disconnected':
      default:
        return 'STANDBY MODE';
    }
  };

  const getStatusColor = () => {
    switch (state) {
      case 'connecting':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'listening':
      case 'speaking':
        return `${currentTheme.badgeBg}`;
      case 'disconnected':
      default:
        return 'text-slate-400 bg-slate-800/40 border-slate-700/50';
    }
  };

  return (
    <header
      id="hud-header"
      className="w-full px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between border-b border-slate-800/60 bg-[#05070f]/80 backdrop-blur-md z-20"
    >
      {/* Brand Identity */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center border font-display font-bold text-xs sm:text-sm tracking-tighter shadow-md shrink-0"
          style={{
            borderColor: `${currentTheme.primary}66`,
            background: `linear-gradient(135deg, ${currentTheme.primary}22, #020617)`,
            color: currentTheme.primaryLight,
          }}
        >
          FR
        </div>
        <div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <h1 className="text-sm sm:text-lg font-display font-extrabold tracking-wider text-slate-100">
              FRIDAY
            </h1>
            <span className="text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
              LIVE 3.1
            </span>
            {authProfile && (
              <button
                type="button"
                onClick={onOpenAuth}
                title="Commander Security Clearance (Only I can talk to FRIDAY)"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono transition-all hover:scale-105 cursor-pointer"
                style={{
                  backgroundColor: `${currentTheme.primary}15`,
                  borderColor: `${currentTheme.primary}44`,
                  color: currentTheme.primary,
                }}
              >
                <ShieldCheck className="w-3 h-3 text-cyan-400" />
                <span className="font-bold uppercase tracking-wider hidden sm:inline">
                  {authProfile.callSign || 'COMMANDER'}
                </span>
                <span className="text-slate-400 hidden md:inline">// L5</span>
              </button>
            )}
          </div>
          <p className="text-[10px] sm:text-[11px] font-mono text-slate-400 hidden md:block">
            Omniglot Voice Companion & PC System Operator
          </p>
        </div>
      </div>

      {/* Center Dynamic Status Pill */}
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full border text-[11px] sm:text-xs font-mono font-medium transition-all ${getStatusColor()}`}
        >
          <span
            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
              state === 'disconnected'
                ? 'bg-slate-500'
                : state === 'connecting'
                ? 'bg-amber-400 animate-ping'
                : 'bg-emerald-400 animate-pulse'
            }`}
          />
          <span className="tracking-wider uppercase truncate max-w-[140px] sm:max-w-none">
            {getStatusText()}
          </span>
        </div>
      </div>

      {/* Right Controls Bar */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Wakeword + Voice Lock stacked vertically */}
        <div className="flex flex-col items-center gap-1">
          {wakewordConfig && (
            <button
              id="wakeword-toggle-btn"
              type="button"
              onClick={onOpenWakeword}
              title={`Wakeword: "${wakewordConfig.keyword}" (${wakewordConfig.enabled ? 'Active' : 'Disabled'})`}
              className="flex items-center gap-1 p-1.5 sm:px-2 sm:py-1.5 rounded-lg border text-xs font-mono transition-all hover:scale-105 cursor-pointer relative"
              style={{
                backgroundColor: wakewordConfig.enabled ? `${currentTheme.primary}15` : 'rgba(15, 23, 42, 0.6)',
                borderColor: wakewordConfig.enabled ? currentTheme.primary : 'rgba(51, 65, 85, 0.6)',
                color: wakewordConfig.enabled ? currentTheme.primary : '#94a3b8',
              }}
            >
              <Mic className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase hidden xl:inline">
                "{wakewordConfig.keyword}"
              </span>
              {wakewordState?.isListening && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute -top-1 -right-1" />
              )}
            </button>
          )}

          {/* Voice Authentication Button - mic button ke niche */}
          {onOpenVoiceEnrollment && (
            <button
              id="voice-auth-toggle-btn"
              type="button"
              onClick={onOpenVoiceEnrollment}
              title="Voice Authentication Setup (Enroll Commander Voice)"
              className="flex items-center gap-1 p-1.5 sm:px-2 sm:py-1.5 rounded-lg border text-xs font-mono transition-all hover:scale-105 cursor-pointer relative"
              style={{
                backgroundColor: `${currentTheme.primary}15`,
                borderColor: `${currentTheme.primary}44`,
                color: currentTheme.primary,
              }}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[10px] font-bold uppercase hidden xl:inline">
                VOICE LOCK
              </span>
            </button>
          )}
        </div>

        <PWAInstallButton theme={theme} />
        <HUDWorkspaceStatus theme={theme} />

        {/* Image Generator Button */}
        {onOpenImageGenerator && (
          <button
            onClick={onOpenImageGenerator}
            title="Vision Matrix / Image Generator"
            className="p-1.5 sm:p-2 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
          >
            <Camera className="w-4 h-4" style={{ color: currentTheme.primary }} />
          </button>
        )}

        {/* Theme Picker Button */}
        <div className="relative">
          <button
            id="theme-toggle-btn"
            type="button"
            onClick={() => setShowThemePicker(!showThemePicker)}
            aria-label="Change Theme Accent"
            className="p-1.5 sm:p-2 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
          >
            <Palette className="w-4 h-4" style={{ color: currentTheme.primary }} />
          </button>

          {showThemePicker && (
            <div
              id="theme-dropdown-menu"
              className="absolute right-0 mt-2 w-48 p-2 rounded-xl border border-slate-700/80 bg-[#0b101f] shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 px-2 py-1 mb-1">
                Accent Core
              </div>
              <div className="space-y-1">
                {(Object.keys(THEMES) as ThemeAccent[]).map((key) => {
                  const t = THEMES[key];
                  const isSelected = theme === key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        onSelectTheme(key);
                        setShowThemePicker(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-800/80 text-white font-semibold'
                          : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shadow-sm"
                          style={{ backgroundColor: t.primary }}
                        />
                        <span>{t.name}</span>
                      </div>
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.primary }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Lock Protocol Button */}
        {onLockSession && (
          <button
            id="lock-session-btn"
            type="button"
            onClick={onLockSession}
            title="Lock FRIDAY Core (Return to Login Portal)"
            className="p-1.5 sm:p-2 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-colors cursor-pointer"
          >
            <Lock className="w-4 h-4" />
          </button>
        )}

        {/* Info Modal Button */}
        <button
          id="info-modal-btn"
          type="button"
          onClick={() => setShowInfoModal(true)}
          aria-label="Assistant Info"
          className="p-1.5 sm:p-2 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-colors cursor-pointer"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      {/* Info Dialog */}
      {showInfoModal && (
        <div
          id="info-backdrop"
          className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in"
          onClick={() => setShowInfoModal(false)}
        >
          <div
            id="info-content-panel"
            className="w-full max-w-md bg-[#0a0f1d] border border-slate-700/80 rounded-2xl p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowInfoModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center border"
                style={{
                  borderColor: `${currentTheme.primary}66`,
                  background: `${currentTheme.primary}15`,
                  color: currentTheme.primaryLight,
                }}
              >
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-100 text-lg">FRIDAY AI Matrix</h3>
                <p className="text-xs font-mono text-slate-400">Gemini 3.1 Flash Live Protocol</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-300 font-sans leading-relaxed">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                  Omniglot Fluency (All World Languages)
                </div>
                <p>
                  Speak naturally in English, Spanish, French, German, Arabic, Hindi, Bengali, Japanese, Chinese, or any other global tongue. FRIDAY automatically detects your language and replies in kind.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                  PC File Access & Inspection
                </div>
                <p>
                  Click the hard drive icon in the header or drag-and-drop any file from your PC (code, logs, documents, spreadsheets). FRIDAY can read, summarize, debug, and explain your files over voice.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                  In-App Media Player & Vision
                </div>
                <p>
                  Ask FRIDAY to play YouTube videos or turn on your camera to stream real-time 1 FPS vision directly into the neural perception engine.
                </p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-mono font-medium transition-colors cursor-pointer"
                style={{
                  backgroundColor: currentTheme.primary,
                  color: '#020617',
                }}
              >
                Close Diagnostic
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
