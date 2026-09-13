import React, { useEffect, useState } from 'react';
import { AssistantState, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface FridayNexusCoreProps {
  state: AssistantState;
  theme: ThemeAccent;
  onToggle: () => void;
  typingText?: string;
  title?: string;
}

/**
 * FridayNexusCore — JARVIS NEXUS UI ported to FRIDAY.
 * Names: JARVIS -> FRIDAY, NEXUS AI -> FRIDAY NEXUS, MATAKAL -> FRIDAY.
 * No eel.js / three.js CDN — pure SVG + CSS core wired to FRIDAY state.
 */
export const FridayNexusCore: React.FC<FridayNexusCoreProps> = ({
  state,
  theme,
  onToggle,
  typingText,
  title = 'FRIDAY',
}) => {
  const currentTheme = THEMES[theme] || THEMES.cyan;
  const accent = currentTheme.primary;
  const isActive = state === 'listening' || state === 'speaking';
  const isSpeaking = state === 'speaking';

  const defaultLine =
    state === 'disconnected'
      ? 'Hello Commander, I am Friday. Tap the core to awaken me.'
      : state === 'connecting'
        ? 'Initializing quantum speech channel...'
        : state === 'listening'
          ? 'Friday is listening. Speak, Commander.'
          : 'Friday is speaking. Interrupt anytime.';

  const [typed, setTyped] = useState('');
  useEffect(() => {
    const full = typingText ?? defaultLine;
    let i = 0;
    setTyped('');
    const t = setInterval(() => {
      i++;
      setTyped(full.slice(0, i));
      if (i >= full.length) clearInterval(t);
    }, 35);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typingText, state]);

  return (
    <div className="fnx-root" style={{ ['--fnx-accent' as string]: accent }}>
      <style>{`
        .fnx-root { position: relative; width: 100%; height: 300px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: transparent; }
        @media (min-width: 640px) { .fnx-root { height: 360px; } }
        .fnx-blobs { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
        .fnx-blob { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.35; animation: fnxFloat 24s infinite alternate ease-in-out; will-change: transform; }
        .fnx-b1 { width: 60vmin; height: 60vmin; background: radial-gradient(circle at 30% 30%, #0a6c9c, #021a2b); top: -15%; left: -10%; animation-duration: 28s; }
        .fnx-b2 { width: 70vmin; height: 70vmin; background: radial-gradient(circle at 70% 60%, #3a0a6e, #0f0220); bottom: -15%; right: -10%; animation-duration: 32s; animation-delay: -7s; }
        .fnx-b3 { width: 50vmin; height: 50vmin; background: radial-gradient(circle at 40% 40%, #0f7a6a, #001a14); top: 50%; left: 50%; animation-duration: 26s; animation-delay: -14s; }
        @keyframes fnxFloat {
          0% { transform: translate(0,0) scale(1); }
          50% { transform: translate(6%,10%) scale(1.12); }
          100% { transform: translate(10%,-6%) scale(1.2); }
        }
        .fnx-stage { position: relative; width: 300px; height: 300px; display: flex; align-items: center; justify-content: center; }
        .fnx-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
        .fnx-blue-light { position: absolute; width: 150px; height: 150px; background: radial-gradient(circle, var(--fnx-accent) 0%, rgba(0,0,0,0) 70%); border-radius: 50%; opacity: 0; animation: fnxLight 3s ease-in-out infinite; }
        @keyframes fnxLight { 0% { opacity: 0; transform: scale(0); } 50% { opacity: 1; transform: scale(1.5); } 100% { opacity: 0; transform: scale(2); } }
        .fnx-circle { position: absolute; width: 250px; height: 250px; border: 4px solid var(--fnx-accent); border-radius: 50%; opacity: 0; animation: fnxAppear 3s 1s forwards; box-shadow: 0 0 20px rgb(106,0,255), 0 0 40px var(--fnx-accent); }
        @keyframes fnxAppear { 0% { opacity: 0; transform: scale(0.5); } 100% { opacity: 1; transform: scale(1); } }
        .fnx-ring { position: absolute; width: 300px; height: 300px; border: 4px solid var(--fnx-accent); border-radius: 50%; animation: fnxSpin 6s linear infinite; box-shadow: 0 0 20px rgb(43,0,255), 0 0 40px var(--fnx-accent); }
        .fnx-ring.r2 { animation-direction: reverse; }
        @keyframes fnxSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .fnx-water { position: absolute; width: 340px; height: 340px; border-radius: 50%; border: 4px solid var(--fnx-accent); opacity: 0; box-shadow: 0 0 20px var(--fnx-accent), 0 0 40px var(--fnx-accent); animation: fnxRipple 3s infinite ease-in-out; }
        @keyframes fnxRipple { 0% { opacity: 0; transform: scale(0.8); } 50% { opacity: 0.6; transform: scale(1.1); } 100% { opacity: 0; transform: scale(1.5); } }
        .fnx-final { position: absolute; width: 290px; height: 290px; border: 4px solid var(--fnx-accent); border-radius: 50%; animation: fnxFinal 8s infinite alternate ease-in-out; box-shadow: 0 0 20px var(--fnx-accent), 0 0 40px var(--fnx-accent); }
        @keyframes fnxFinal { 0% { transform: rotateY(0deg) rotateX(0deg); } 100% { transform: rotateY(360deg) rotateX(360deg); } }
        .fnx-orbit { position: absolute; width: 168px; height: 168px; border-radius: 50%; border: 1px dashed color-mix(in srgb, var(--fnx-accent) 55%, transparent); z-index: 4; animation: fnxSpin 14s linear infinite; pointer-events: none; }
        .fnx-orbit::after { content: ''; position: absolute; top: -3px; left: 50%; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: var(--fnx-accent); box-shadow: 0 0 10px var(--fnx-accent); }
        .fnx-core-btn { position: relative; z-index: 5; width: 128px; height: 128px; border-radius: 50%; border: 2px solid var(--fnx-accent); background: radial-gradient(circle, #ffffff 0%, var(--fnx-accent) 55%, #0e1628 100%); cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; box-shadow: 0 0 35px var(--fnx-accent), inset 0 0 22px rgba(255,255,255,0.25); transition: transform 0.2s, box-shadow 0.3s; }
        .fnx-core-btn:hover { transform: scale(1.04); box-shadow: 0 0 55px var(--fnx-accent), inset 0 0 26px rgba(255,255,255,0.35); }
        .fnx-core-btn:active { transform: scale(0.96); }
        .fnx-core-btn span { font-family: 'Orbitron', sans-serif; font-size: 11px; letter-spacing: 3px; color: #02141a; font-weight: 900; text-indent: 3px; }
        .fnx-core-btn small { font-family: 'Orbitron', sans-serif; font-size: 8px; letter-spacing: 2px; color: #02141a; opacity: 0.75; }
        .fnx-glow-text { position: absolute; bottom: 6px; color: var(--fnx-accent); font-family: 'Orbitron', sans-serif; font-size: 1.6rem; letter-spacing: 8px; text-indent: 8px; text-shadow: 0 0 10px var(--fnx-accent), 0 0 30px var(--fnx-accent), 0 0 60px var(--fnx-accent); animation: fnxFloatText 4s infinite ease-in-out; z-index: 6; }
        @keyframes fnxFloatText { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .fnx-typing { position: absolute; bottom: -24px; width: 100%; text-align: center; color: rgba(7,216,216,0.85); font-size: 12px; font-family: 'Orbitron', monospace; text-shadow: 0 0 10px rgba(9,162,222,0.7); z-index: 6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 12px; }
        .fnx-particles { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
        .fnx-p { position: absolute; width: 8px; height: 8px; background: var(--fnx-accent); border-radius: 50%; opacity: 0; animation: fnxP 5s infinite ease-in-out; box-shadow: 0 0 10px var(--fnx-accent); }
        @keyframes fnxP { 0% { opacity: 0; transform: translate(0,0); } 50% { opacity: 1; transform: translate(60px,-80px); } 100% { opacity: 0; transform: translate(120px,-160px); } }
      `}</style>

      <div className="fnx-blobs">
        <div className="fnx-blob fnx-b1" />
        <div className="fnx-blob fnx-b2" />
        <div className="fnx-blob fnx-b3" />
      </div>

      <div className="fnx-stage">
        <svg className="fnx-svg" viewBox="0 0 1800 1280">
          <defs>
            <filter id="fnx-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="10" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx="900" cy="640" r="270" fill="transparent" stroke="#1b0bf4" strokeWidth="1" />
          <circle cx="900" cy="640" r="260" fill="transparent" stroke={accent} strokeWidth="6" strokeDasharray="100">
            <animateTransform attributeName="transform" type="rotate" values="0 900 640; 360 900 640" dur="12s" repeatCount="indefinite" />
          </circle>
          <circle cx="900" cy="640" r="235" fill="transparent" stroke={accent} strokeWidth="20" strokeDasharray="4, 4">
            <animateTransform attributeName="transform" type="rotate" values="0 900 640; -360 900 640" dur="10s" repeatCount="indefinite" />
          </circle>
          <circle cx="900" cy="640" r="200" fill="transparent" stroke="#B4F6FB" strokeWidth="3" strokeDasharray="10, 15">
            <animateTransform attributeName="transform" type="rotate" values="0 900 640; 360 900 640" dur="8s" repeatCount="indefinite" />
          </circle>
          <circle cx="900" cy="640" r="90" fill="#04a3f2" filter="url(#fnx-glow)" opacity="0.5">
            <animate attributeName="r" values="85; 90; 85" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle cx="900" cy="640" r="40" fill="#03bbf8" filter="url(#fnx-glow)" opacity="0.7">
            <animate attributeName="r" values="35; 40; 35" dur={isSpeaking ? '0.8s' : '2s'} repeatCount="indefinite" />
          </circle>
          <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="#ebdfe9da" fontFamily="Orbitron, sans-serif" fontSize="35" fontWeight="bold" letterSpacing="1">
            FRIDAY
          </text>
        </svg>

        <div className="fnx-blue-light" style={{ opacity: isActive ? undefined : 0 }} />
        <div className="fnx-circle" />
        <div className="fnx-ring" />
        <div className="fnx-ring r2" />
        <div className="fnx-water" />
        <div className="fnx-final" />
        <div className="fnx-particles">
          <div className="fnx-p" style={{ top: '10%', left: '20%' }} />
          <div className="fnx-p" style={{ top: '30%', left: '50%', animationDelay: '1s' }} />
          <div className="fnx-p" style={{ top: '70%', left: '80%', animationDelay: '2s' }} />
        </div>

        <div className="fnx-orbit" />
        <button type="button" className="fnx-core-btn" onClick={onToggle} aria-label="Toggle Friday voice session" title="Touch reactor core to awaken Friday">
          <span>{title}</span>
          <small>{state === 'connecting' ? 'SYNCING' : isSpeaking ? 'TALKING' : state === 'listening' ? 'ONLINE' : 'ACTIVATE'}</small>
        </button>

        <div className="fnx-glow-text">Friday</div>
        <div className="fnx-typing">{typed}</div>
      </div>
    </div>
  );
};
