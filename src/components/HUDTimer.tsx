import React, { useEffect, useState } from 'react';
import { Play, Pause, X, Bell } from 'lucide-react';
import { CountdownTimer, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface HUDTimerProps {
  timer: CountdownTimer;
  theme: ThemeAccent;
  onDismiss: (id: string) => void;
}

export const HUDTimer: React.FC<HUDTimerProps> = ({
  timer,
  theme,
  onDismiss,
}) => {
  const [remaining, setRemaining] = useState(timer.remainingSeconds);
  const [isRunning, setIsRunning] = useState(timer.isRunning);
  const [hasFinished, setHasFinished] = useState(false);
  const currentTheme = THEMES[theme] || THEMES.amber;

  useEffect(() => {
    if (!isRunning || remaining <= 0) {
      if (remaining <= 0 && !hasFinished) {
        setHasFinished(true);
        // Play futuristic subtle alert chime using Web Audio API
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.3);
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.4);
        } catch {}
      }
      return;
    }

    const interval = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, remaining, hasFinished]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const progress = timer.totalSeconds > 0 ? ((timer.totalSeconds - remaining) / timer.totalSeconds) * 100 : 100;

  return (
    <div
      id={`hud-timer-${timer.id}`}
      className={`flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl border bg-[#0b1220]/90 backdrop-blur-xl shadow-xl transition-all ${
        hasFinished ? 'border-red-500/60 bg-red-950/30 animate-pulse' : ''
      }`}
      style={{
        borderColor: hasFinished ? undefined : `${currentTheme.primary}44`,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center border text-xs font-mono font-bold"
          style={{
            borderColor: `${currentTheme.primary}66`,
            color: currentTheme.primaryLight,
          }}
        >
          {hasFinished ? <Bell className="w-4 h-4 text-red-400 animate-bounce" /> : 'T'}
        </div>

        <div>
          <div className="text-xs font-mono font-bold text-slate-100 flex items-center gap-2">
            <span>{timer.label || 'Countdown'}</span>
            <span
              className="text-xs font-mono font-bold tracking-wider"
              style={{ color: hasFinished ? '#ef4444' : currentTheme.primaryLight }}
            >
              {hasFinished ? 'EXPIRED' : formattedTime}
            </span>
          </div>

          {/* Mini progress bar */}
          <div className="w-28 sm:w-36 h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
            <div
              className="h-full transition-all duration-1000 rounded-full"
              style={{
                width: `${progress}%`,
                backgroundColor: hasFinished ? '#ef4444' : currentTheme.primary,
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {!hasFinished && (
          <button
            type="button"
            onClick={() => setIsRunning(!isRunning)}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
            aria-label={isRunning ? 'Pause timer' : 'Resume timer'}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => onDismiss(timer.id)}
          className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          aria-label="Dismiss timer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
