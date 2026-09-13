import { ThemeAccent } from '../types';

export interface ThemeConfig {
  name: string;
  primary: string;
  primaryLight: string;
  border: string;
  bgGlow: string;
  shadow: string;
  textGlow: string;
  badgeBg: string;
}

export const THEMES: Record<ThemeAccent, ThemeConfig> = {
  cyan: {
    name: 'Arc Cyan',
    primary: '#06b6d4',
    primaryLight: '#67e8f9',
    border: 'border-cyan-500/30',
    bgGlow: 'from-cyan-500/20 via-sky-500/10 to-transparent',
    shadow: 'shadow-[0_0_50px_rgba(6,182,212,0.35)]',
    textGlow: 'drop-shadow-[0_0_12px_rgba(6,182,212,0.8)]',
    badgeBg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  },
  amber: {
    name: 'Jarvis Gold',
    primary: '#f59e0b',
    primaryLight: '#fde68a',
    border: 'border-amber-500/30',
    bgGlow: 'from-amber-500/20 via-orange-500/10 to-transparent',
    shadow: 'shadow-[0_0_50px_rgba(245,158,11,0.35)]',
    textGlow: 'drop-shadow-[0_0_12px_rgba(245,158,11,0.8)]',
    badgeBg: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  },
  emerald: {
    name: 'Vision Emerald',
    primary: '#10b981',
    primaryLight: '#6ee7b7',
    border: 'border-emerald-500/30',
    bgGlow: 'from-emerald-500/20 via-teal-500/10 to-transparent',
    shadow: 'shadow-[0_0_50px_rgba(16,185,129,0.35)]',
    textGlow: 'drop-shadow-[0_0_12px_rgba(16,185,129,0.8)]',
    badgeBg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  },
  violet: {
    name: 'Quantum Violet',
    primary: '#a855f7',
    primaryLight: '#d8b4fe',
    border: 'border-purple-500/30',
    bgGlow: 'from-purple-500/20 via-indigo-500/10 to-transparent',
    shadow: 'shadow-[0_0_50px_rgba(168,85,247,0.35)]',
    textGlow: 'drop-shadow-[0_0_12px_rgba(168,85,247,0.8)]',
    badgeBg: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  },
  rose: {
    name: 'Crimson Protocol',
    primary: '#f43f5e',
    primaryLight: '#fda4af',
    border: 'border-rose-500/30',
    bgGlow: 'from-rose-500/20 via-pink-500/10 to-transparent',
    shadow: 'shadow-[0_0_50px_rgba(244,63,94,0.35)]',
    textGlow: 'drop-shadow-[0_0_12px_rgba(244,63,94,0.8)]',
    badgeBg: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  },
};
