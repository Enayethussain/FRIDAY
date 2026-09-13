import React, { useEffect, useState } from 'react';
import { HelpCircle, Sparkles, Mic, Radio, Terminal } from 'lucide-react';
import { AssistantState, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface HUDFooterProps {
  state: AssistantState;
  theme: ThemeAccent;
}

const VOICE_PROMPTS = [
  'Hey FRIDAY, where did we leave off yesterday?',
  'FRIDAY, watch my screen and teach me step-by-step.',
  'What topic did we leave for tomorrow?',
  'FRIDAY, teach me React from beginner to advanced.',
  'FRIDAY, what’s on your mind today?',
  'FRIDAY, open YouTube for me.',
  'FRIDAY, mark this topic as mastered.',
  'Search Google for latest quantum computing discoveries.',
  'FRIDAY, remember that my favorite language is TypeScript.',
  'How are you feeling right now?',
];

export const HUDFooter: React.FC<HUDFooterProps> = ({ state, theme }) => {
  const [promptIndex, setPromptIndex] = useState(0);
  const currentTheme = THEMES[theme] || THEMES.cyan;

  useEffect(() => {
    const interval = setInterval(() => {
      setPromptIndex((prev) => (prev + 1) % VOICE_PROMPTS.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer
      id="hud-footer"
      className="w-full px-4 sm:px-6 py-3 border-t border-slate-800/60 bg-[#05070f]/80 backdrop-blur-md z-20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono"
    >
      {/* Dynamic Voice Prompt Rotation */}
      <div className="flex items-center gap-2 max-w-md w-full truncate">
        <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: currentTheme.primaryLight }} />
        <span className="text-slate-500 shrink-0">Try saying:</span>
        <span
          className="text-slate-300 truncate tracking-wide transition-all duration-300"
          style={{ textShadow: `0 0 10px ${currentTheme.primary}33` }}
        >
          "{VOICE_PROMPTS[promptIndex]}"
        </span>
      </div>

      {/* Protocol Telemetry Indicators */}
      <div className="flex items-center gap-3 shrink-0 text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>IN: 16kHz PCM</span>
        </div>
        <span className="text-slate-700">|</span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: currentTheme.primary }} />
          <span>OUT: 24kHz LIVE</span>
        </div>
        <span className="text-slate-700">|</span>
        <div className="flex items-center gap-1">
          <Radio className="w-3 h-3 text-slate-500" />
          <span>ZERO-LATENCY</span>
        </div>
      </div>
    </footer>
  );
};
