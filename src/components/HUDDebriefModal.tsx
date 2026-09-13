import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Copy,
  Check,
  Printer,
  Trash2,
  Clock,
  MessageSquare,
  Wrench,
  GraduationCap,
  Sparkles,
  X,
  Send,
  Bot,
  User,
  Terminal,
} from 'lucide-react';
import { TranscriptEntry, SessionDebriefStats, ThemeAccent } from '../types';
import { globalTranscriptManager } from '../services/TranscriptManager';
import { globalAuthManager } from '../services/AuthManager';
import { THEMES } from '../utils/theme';
import { SoundEffects } from '../utils/SoundEffects';
import { HapticFeedback } from '../utils/HapticFeedback';

interface HUDDebriefModalProps {
  isOpen: boolean;
  theme: ThemeAccent;
  onClose: () => void;
}

export const HUDDebriefModal: React.FC<HUDDebriefModalProps> = ({
  isOpen,
  theme,
  onClose,
}) => {
  const currentTheme = THEMES[theme] || THEMES.cyan;
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [stats, setStats] = useState<SessionDebriefStats>(globalTranscriptManager.getStats());
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = globalTranscriptManager.subscribe((newEntries) => {
      setEntries(newEntries);
      setStats(globalTranscriptManager.getStats());
    });
    return unsub;
  }, [isOpen]);

  if (!isOpen) return null;

  const profile = globalAuthManager.getProfile();
  const durationMin = Math.floor(stats.sessionDurationSeconds / 60);
  const durationSec = stats.sessionDurationSeconds % 60;

  const handleCopyMarkdown = () => {
    const md = globalTranscriptManager.generateMarkdownReport();
    navigator.clipboard.writeText(md);
    setCopied(true);
    SoundEffects.playSubtleBeep();
    HapticFeedback.tap();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    globalTranscriptManager.downloadMarkdown();
    SoundEffects.playCurriculumUpdated();
    HapticFeedback.success();
  };

  const handleDownloadJSON = () => {
    globalTranscriptManager.downloadJSON();
    SoundEffects.playCurriculumUpdated();
    HapticFeedback.success();
  };

  const handlePrint = () => {
    window.print();
    HapticFeedback.tap();
  };

  const handleClear = () => {
    if (confirm('Reboot transcript buffer and start fresh debrief log?')) {
      globalTranscriptManager.clearSession();
      SoundEffects.playSubtleBeep();
      HapticFeedback.warning();
    }
  };

  return (
    <div
      id="hud-debrief-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border bg-slate-950/95 shadow-2xl overflow-hidden text-slate-100"
        style={{
          borderColor: `${currentTheme.primary}77`,
          boxShadow: `0 0 50px rgba(0,0,0,0.9), 0 0 30px ${currentTheme.primary}33`,
        }}
      >
        {/* Header Bar */}
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
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-white">
                  Mission Debrief & Audio Transcript Log
                </h3>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase"
                  style={{
                    backgroundColor: `${currentTheme.primary}20`,
                    color: currentTheme.primary,
                    border: `1px solid ${currentTheme.primary}40`,
                  }}
                >
                  CLASSIFIED // AAR REPORT
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400">
                Complete Chronological Record of Commander Directives & Socratic AI Responses
              </p>
            </div>
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="px-2.5 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 bg-slate-800/50 text-xs font-mono text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy MD'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
              style={{
                backgroundColor: currentTheme.primary,
                color: '#020617',
              }}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .MD</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadJSON}
              className="px-2.5 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 bg-slate-800/50 text-xs font-mono text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>.JSON</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="p-1.5 rounded-lg border border-slate-700 hover:border-slate-600 bg-slate-800/50 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Print Mission Report"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors ml-2 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Telemetry Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-slate-800/80 bg-black/40">
          <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/30">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono mb-1">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Session Duration</span>
            </div>
            <strong className="text-base font-mono text-white">
              {durationMin}m {durationSec}s
            </strong>
          </div>

          <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/30">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono mb-1">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span>Voice Exchanges</span>
            </div>
            <strong className="text-base font-mono text-white">
              {stats.userTurns} user / {stats.assistantTurns} FRIDAY
            </strong>
          </div>

          <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/30">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono mb-1">
              <Wrench className="w-3.5 h-3.5 text-amber-400" />
              <span>Subsystem Tools</span>
            </div>
            <strong className="text-base font-mono text-white">
              {stats.toolsInvokedCount} executed
            </strong>
          </div>

          <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/30">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono mb-1">
              <GraduationCap className="w-3.5 h-3.5 text-violet-400" />
              <span>Mastered Concepts</span>
            </div>
            <strong className="text-base font-mono text-white">
              {stats.conceptsReviewedCount} concepts
            </strong>
          </div>
        </div>

        {/* Chronological Transcript Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[#070b14]">
          {entries.length === 0 ? (
            <div className="text-center py-12 text-slate-500 font-mono text-xs">
              No entries recorded yet in this session.
            </div>
          ) : (
            entries.map((entry) => {
              const isUser = entry.sender === 'user';
              const isFriday = entry.sender === 'friday';
              const isTool = entry.sender === 'tool';
              const isSystem = entry.sender === 'system';

              return (
                <div
                  key={entry.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isUser
                      ? 'bg-cyan-950/20 border-cyan-500/40 ml-6 sm:ml-16'
                      : isFriday
                      ? 'bg-slate-900/60 border-slate-800 mr-6 sm:mr-16'
                      : isTool
                      ? 'bg-amber-950/20 border-amber-500/40'
                      : 'bg-black/50 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      {isUser && (
                        <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-cyan-300 uppercase">
                          <User className="w-3.5 h-3.5" />
                          <span>{profile.callSign || 'COMMANDER'}</span>
                        </span>
                      )}
                      {isFriday && (
                        <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-amber-300 uppercase">
                          <Bot className="w-3.5 h-3.5" />
                          <span>FRIDAY // NEURAL CORE</span>
                        </span>
                      )}
                      {isTool && (
                        <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-amber-400 uppercase">
                          <Terminal className="w-3.5 h-3.5" />
                          <span>TOOL EXECUTION // {entry.toolName || 'ACTION'}</span>
                        </span>
                      )}
                      {isSystem && (
                        <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-slate-400 uppercase">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>SYSTEM TELEMETRY</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm font-mono text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {entry.text}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-900/60 text-xs font-mono">
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset Mission Transcript</span>
          </button>

          <span className="text-[10px] text-slate-500 uppercase tracking-widest">
            F.R.I.D.A.Y. DEBRIEF SUBSYSTEM // READY
          </span>
        </div>
      </div>
    </div>
  );
};
