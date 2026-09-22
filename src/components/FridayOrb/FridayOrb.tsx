import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import type { AssistantState, ThemeAccent } from '../../types';
import { ORB_PALETTES, ORB_QUALITY, ORB_STATE_TARGETS, ORB_TIMING, autoQuality, type OrbQuality } from './orbConfig';
import { resolveOrbState, ORB_STATE_LABEL, type OrbSignals, type OrbVisualState } from './orbState';
import { sampleLevel } from './orbAudio';
import { OrbPointerControl } from './orbInteraction';
import { HandGestureControl } from './handTracking';
import { globalGestureEngine, type GestureMode } from '../../services/GestureControlEngine';
import { createOrbScene, type OrbSceneHandle } from './OrbScene';

/**
 * FridayOrb — ULTRON-style holographic AI core.
 * Main visual identity of FRIDAY. Drop-in compatible with the old
 * FridayPlasmaOrb props (state/theme/onToggle/typingText/analyser).
 *
 * STATE API — AI-driven visuals flow ONLY through props, all real signals:
 *   assistant   AssistantState from StateManager (sleep/think/listen/speak)
 *   toolActive  true while ToolManager.executeCalls runs (processing/executing)
 *   wakeAt      performance.now() of wake-word/connect (wake cinematic)
 *   lastResult  {ok, at} of last finished tool burst (success/error pulse)
 *   errorAt     performance.now() of last real error (alert accent)
 *   analyser    live AnalyserNode (mic while listening, TTS while speaking)
 *
 * IMPERATIVE API (renderer-only, exposed via ref — never AI state):
 *   setQuality('low'|'medium'|'high'|'auto'), setNoise(on), setGestures(on)
 */

export interface FridayOrbControl {
  setQuality: (q: OrbQuality | 'auto') => void;
  setNoise: (on: boolean) => void;
  setGestures: (on: boolean) => void;
  /** alias of setGestures (spec §18 naming) */
  setHandInteraction: (enabled: boolean) => void;
}

export interface FridayOrbProps {
  state: AssistantState;
  theme: ThemeAccent;
  onToggle: () => void;
  typingText?: string;
  analyser?: AnalyserNode | null;
  toolActive?: boolean;
  toolStartAt?: number | null;
  wakeAt?: number | null;
  lastResult?: { ok: boolean; at: number } | null;
  errorAt?: number | null;
  quality?: OrbQuality | 'auto';
  gesturesDefaultOn?: boolean;
  /** accessibility: hard-disable camera gestures */
  disableGestures?: boolean;
  /** accessibility: hard-disable audio reactivity */
  disableAudio?: boolean;
  /** accessibility: hard-disable holographic grain */
  disableNoise?: boolean;
  /** immersive wallpaper-style mode: orb fills, chrome hidden */
  immersive?: boolean;
}

const STATIC_LINE: Record<OrbVisualState, string> = {
  sleep: 'Good day, Sir. I am Friday. Tap the orb to awaken me.',
  idle: 'Friday online, Sir. Tap the orb to talk.',
  wake: 'Neural core awakening…',
  listening: 'Friday is listening. Speak, Commander.',
  thinking: 'Consulting the neural core…',
  processing: 'Processing request…',
  speaking: 'Friday is speaking. Interrupt anytime.',
  executing: 'Executing command on device…',
  gesture: 'Gesture camera live. Move your hand.',
  success: 'Command complete.',
  error: 'Something failed — check the message above.',
};

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export const FridayOrb = forwardRef<FridayOrbControl, FridayOrbProps>(function FridayOrb(props, ref) {
  const { state, theme, onToggle, typingText, analyser } = props;
  const mountRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OrbSceneHandle | null>(null);
  const gestureRef = useRef<HandGestureControl | null>(null);
  const audioBarRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(2.7);
  const explodeRef = useRef(0);
  const noiseRef = useRef(0);

  // live signals -> refs (no re-render per frame)
  const sigRef = useRef<OrbSignals>({
    assistant: state, toolActive: false, wakeAt: null,
    toolStartAt: null, lastResult: null, errorAt: null, gestureActive: false,
  });
  sigRef.current.assistant = state;
  sigRef.current.toolActive = props.toolActive ?? false;
  sigRef.current.wakeAt = props.wakeAt ?? null;
  sigRef.current.toolStartAt = props.toolStartAt ?? null;
  sigRef.current.lastResult = props.lastResult ?? null;
  sigRef.current.errorAt = props.errorAt ?? null;
  const analyserRef = useRef<AnalyserNode | null>(null);
  analyserRef.current = props.disableAudio ? null : (analyser ?? null);
  const reducedRef = useRef(prefersReducedMotion());

  const [visual, setVisual] = useState<OrbVisualState>('sleep');
  const [webglError, setWebglError] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [sceneEpoch, setSceneEpoch] = useState(0);
  const [qualitySel, setQualitySel] = useState<OrbQuality | 'auto'>(props.quality ?? 'auto');
  const [noiseOn, setNoiseOn] = useState(() => !props.disableNoise && autoQuality() === 'high');
  const [gesturesOn, setGesturesOn] = useState(false);
  const [gestureMsg, setGestureMsg] = useState<string | null>(null);
  const [gestureBusy, setGestureBusy] = useState(false);
  const [gestureMode, setGestureMode] = useState<GestureMode>('ORB');
  const [gesturePaused, setGesturePaused] = useState(false);
  const palette = ORB_PALETTES[theme] ?? ORB_PALETTES.amber;
  noiseRef.current = props.disableNoise ? 0 : (noiseOn ? 1 : 0);
  sigRef.current.gestureActive = gesturesOn;

  const toggleGestures = async (force?: boolean) => {
    if (props.disableGestures) return;
    // Single model instance for the component lifetime: created once, then
    // start/stop only toggles camera+loop (model stays READY). This kills the
    // enable→disable→enable re-init race class entirely.
    if (!gestureRef.current) {
      gestureRef.current = new HandGestureControl({
        onRotate: (dx, dy) => {
          const grp = sceneRef.current?.group;
          if (!grp) return;
          grp.rotation.y += dx;
          grp.rotation.x = Math.max(-0.9, Math.min(0.9, grp.rotation.x + dy));
        },
        onZoom: (next) => { zoomRef.current = Math.max(1.8, Math.min(4.2, next)); },
        getZoom: () => zoomRef.current,
        onExpand: (v) => { explodeRef.current = v; },
        onSwipe: (dir) => {
          // swipe UP = toggle voice session (same real action as tapping the orb)
          if (dir === 'up') { setGestureMsg('Swipe ↑ — voice toggle'); onToggle(); }
          else setGestureMsg(`Swipe ${dir} — only ↑ is wired (voice toggle)`);
        },
        onStatus: (m) => setGestureMsg(m),
        onError: (m) => { setGestureMsg(m); setGesturesOn(false); setGestureBusy(false); },
        onFrame: (hands) => { try { globalGestureEngine.onFrame(hands); } catch { /* engine-only */ } },
      });
    }
    const want = force ?? !gestureRef.current.active;
    if (!want) {
      gestureRef.current?.stop();
      gestureRef.current?.setExternalDriven(false);
      setGesturesOn(false);
      setGestureMsg('Gestures OFF');
      return;
    }
    setGestureBusy(true);
    // central engine owns per-mode mapping; the orb's own apply-path yields when driven
    globalGestureEngine.configure({
      onMode: (m) => {
        setGestureMode(m);
        gestureRef.current?.setExternalDriven(m !== 'ORB' && m !== 'GENERAL');
      },
      onPause: (p) => setGesturePaused(p),
      onOrbRotate: (dx, dy) => {
        const grp = sceneRef.current?.group;
        if (!grp) return;
        grp.rotation.y += dx;
        grp.rotation.x = Math.max(-0.9, Math.min(0.9, grp.rotation.x + dy));
      },
      onOrbZoom: (delta) => { zoomRef.current = Math.max(1.8, Math.min(4.2, zoomRef.current + delta * 3)); },
      onOrbExpand: (v) => { explodeRef.current = v; },
    });
    globalGestureEngine.setPaused(false);
    const g = gestureRef.current!;
    await g.start();
    setGestureBusy(false);
    if (g.active) setGesturesOn(true);
  };

  useImperativeHandle(ref, () => ({
    setQuality: (q) => setQualitySel(q),
    setNoise: (on) => { if (!props.disableNoise) setNoiseOn(on); },
    setGestures: (on) => { void toggleGestures(on); },
    setHandInteraction: (enabled) => { void toggleGestures(enabled); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  useEffect(() => {
    if (props.gesturesDefaultOn && !props.disableGestures) void toggleGestures(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fn = () => { reducedRef.current = mq.matches; };
    try { mq.addEventListener('change', fn); } catch { /* older webviews */ }
    return () => { try { mq.removeEventListener('change', fn); } catch { /* noop */ } };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    setWebglError(null);
    setContextLost(false);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e: unknown) {
      setWebglError(e instanceof Error ? e.message : 'WebGL unavailable');
      return;
    }
    const onLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
      setWebglError('GPU context lost');
    };
    renderer.domElement.addEventListener('webglcontextlost', onLost);

    const quality: OrbQuality = qualitySel !== 'auto' ? qualitySel : autoQuality();
    const qp = ORB_QUALITY[quality];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = zoomRef.current;

    let fitW = 0;
    let fitH = 0;
    const fit = () => {
      let w = mount.clientWidth || mount.parentElement?.clientWidth || 0;
      const h = mount.clientHeight || 300;
      if (w === 0) w = Math.max(280, Math.min(560, window.innerWidth - 32));
      if (w !== fitW || h !== fitH) {
        fitW = w; fitH = h;
        camera.aspect = Math.max(0.01, w / h);
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    };
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qp.pixelRatioCap));
    fit();
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);

    const orb = createOrbScene(palette, qp);
    scene.add(orb.group);
    sceneRef.current = orb;

    const pointer = new OrbPointerControl(renderer.domElement, {
      onRotate: (dx, dy) => {
        orb.group.rotation.y += dx;
        orb.group.rotation.x = Math.max(-0.9, Math.min(0.9, orb.group.rotation.x + dy));
      },
      onZoom: (next) => { zoomRef.current = Math.max(1.8, Math.min(4.2, next)); },
      getZoom: () => zoomRef.current,
    });

    // smoothed motion targets (no pops between states)
    let cur = { ...ORB_STATE_TARGETS.sleep };
    let elapsed = 0;
    let last = performance.now();
    let level = 0;
    let lastVisual: OrbVisualState = 'sleep';
    let raf = 0;
    let alive = true;
    let visible = true;
    const scratch = new Uint8Array(1024);

    const frame = () => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.0005, (now - last) / 1000));
      last = now;
      elapsed += dt;
      fit();

      const v = resolveOrbState(sigRef.current, now);
      if (v !== lastVisual) {
        lastVisual = v;
        setVisual(v); // label only — scene reads targets below
      }
      const reduced = reducedRef.current;
      const tgt = ORB_STATE_TARGETS[v] ?? ORB_STATE_TARGETS.idle;
      const k = 1 - Math.exp(-dt * 4);
      cur.rotY += ((reduced ? tgt.rotY * 0.15 : tgt.rotY) - cur.rotY) * k;
      cur.rotX += ((reduced ? 0 : tgt.rotX) - cur.rotX) * k;
      cur.timeScale += ((reduced ? 0.4 : tgt.timeScale) - cur.timeScale) * k;
      cur.brightness += (tgt.brightness - cur.brightness) * k;
      cur.shell += (tgt.shell - cur.shell) * k;
      cur.pulse += ((reduced ? 0 : tgt.pulse) - cur.pulse) * k;
      cur.ringSpeed += ((reduced ? 0.15 : tgt.ringSpeed) - cur.ringSpeed) * k;
      cur.trail += ((reduced ? 0 : tgt.trail) - cur.trail) * k;

      // real audio only; otherwise decay to calm (no fake voice)
      const an = analyserRef.current;
      const wantAudio = an && (v === 'listening' || v === 'speaking');
      const raw = wantAudio ? sampleLevel(an, scratch) : 0;
      level += (raw - level) * (raw > level ? 0.5 : 0.12);
      if (audioBarRef.current) {
        audioBarRef.current.style.width = `${Math.round(Math.min(1, level) * 100)}%`;
      }

      const err = sigRef.current.errorAt !== null && now - sigRef.current.errorAt < ORB_TIMING.errorMs
        ? 0.55 + 0.45 * Math.sin(now * 0.02) : 0;
      const wakeExpand = v === 'wake' && sigRef.current.wakeAt !== null
        ? Math.max(0, 1 - (now - sigRef.current.wakeAt) / ORB_TIMING.wakeMs) : 0;

      if (!reduced) {
        orb.group.rotation.y += cur.rotY;
        orb.group.rotation.x += cur.rotX * 0.4;
      }
      orb.update(dt, elapsed, {
        timeScale: cur.timeScale,
        brightness: cur.brightness,
        shellOpacity: cur.shell,
        pulse: cur.pulse,
        ringSpeed: cur.ringSpeed,
        trailOpacity: cur.trail,
        level,
        errorFlash: err,
        wakeExpand,
        explode: explodeRef.current,
        noise: reduced ? 0 : noiseRef.current,
      });
      camera.position.z += (zoomRef.current - camera.position.z) * 0.08;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      last = performance.now();
    });
    io.observe(mount);
    const onVis = () => { last = performance.now(); };
    document.addEventListener('visibilitychange', onVis);
    const ro = new ResizeObserver(() => fit());
    ro.observe(mount);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      pointer.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      sceneRef.current = null;
      orb.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneEpoch, qualitySel]);

  // palette follows FRIDAY theme (centralized config — no renderer edits needed)
  useEffect(() => {
    sceneRef.current?.setPalette(palette);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
  useEffect(() => () => { gestureRef.current?.dispose(); gestureRef.current = null; }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const grp = sceneRef.current?.group;
    if (!grp) return;
    const step = 0.15;
    if (e.key === 'ArrowLeft') grp.rotation.y -= step;
    else if (e.key === 'ArrowRight') grp.rotation.y += step;
    else if (e.key === 'ArrowUp') grp.rotation.x = Math.max(-0.9, Math.min(0.9, grp.rotation.x - step));
    else if (e.key === 'ArrowDown') grp.rotation.x = Math.max(-0.9, Math.min(0.9, grp.rotation.x + step));
    else if (e.key === '+' || e.key === '=') zoomRef.current = Math.max(1.8, Math.min(4.2, zoomRef.current - 0.2));
    else if (e.key === '-' || e.key === '_') zoomRef.current = Math.max(1.8, Math.min(4.2, zoomRef.current + 0.2));
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
    else return;
    e.preventDefault();
  };

  const cycleQuality = () => {
    setQualitySel((q) => (q === 'auto' ? 'low' : q === 'low' ? 'medium' : q === 'medium' ? 'high' : 'auto'));
  };
  const qualityLabel = qualitySel === 'auto' ? `AUTO/${autoQuality().toUpperCase()}` : qualitySel.toUpperCase();

  const line = typingText ?? STATIC_LINE[visual];
  const accent = palette.shell;
  const linked = state !== 'disconnected';

  return (
    <div
      ref={rootRef}
      className="fpo-root"
      style={{ ['--fpo-accent' as string]: accent }}
      tabIndex={0}
      role="application"
      aria-label={`Friday holographic core, state ${ORB_STATE_LABEL[visual]}. Arrow keys rotate, plus and minus zoom, Enter toggles voice.`}
      onKeyDown={onKeyDown}
    >
      <style>{`
        .fpo-root { position: relative; width: 100%; min-width: 100%; flex: 1 1 auto; align-self: stretch; height: ${props.immersive ? '70dvh' : '300px'}; min-height: ${props.immersive ? '70dvh' : '300px'}; display: flex; align-items: center; justify-content: center; overflow: hidden; background: transparent; padding-bottom: env(safe-area-inset-bottom); outline: none; }
        .fpo-root:focus-visible { box-shadow: inset 0 0 0 2px var(--fpo-accent); border-radius: 12px; }
        @media (min-width: 640px) { .fpo-root { height: ${props.immersive ? '78dvh' : '360px'}; min-height: ${props.immersive ? '78dvh' : '360px'}; } }
        .fpo-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
        .fpo-canvas canvas { display: block; width: 100% !important; height: 100% !important; }
        .fpo-aura { position: absolute; width: 260px; height: 260px; border-radius: 50%; pointer-events: none;
          background: radial-gradient(circle, var(--fpo-accent) 0%, transparent 65%);
          opacity: 0.22; filter: blur(10px); animation: fpoPulse 3s ease-in-out infinite; }
        .fpo-fallback { position: absolute; width: 190px; height: 190px; border-radius: 50%;
          background: radial-gradient(circle, #fff 0%, var(--fpo-accent) 45%, transparent 72%);
          box-shadow: 0 0 60px var(--fpo-accent), 0 0 120px var(--fpo-accent);
          animation: fpoPulse 2.4s ease-in-out infinite; }
        @keyframes fpoPulse { 0%,100% { transform: scale(0.96); opacity: 0.85; } 50% { transform: scale(1.05); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .fpo-aura, .fpo-fallback { animation: none; } }
        .fpo-hit { position: absolute; inset: 0; z-index: 5; background: transparent; border: none; cursor: pointer; }
        .fpo-label { position: absolute; bottom: 34px; z-index: 6; font-family: monospace; font-size: 10px; letter-spacing: 4px; text-indent: 4px; color: var(--fpo-accent); text-shadow: 0 0 12px var(--fpo-accent); pointer-events: none; }
        .fpo-name { position: absolute; bottom: 8px; z-index: 6; font-family: monospace; font-size: 1.4rem; letter-spacing: 8px; text-indent: 8px; color: #fff; text-shadow: 0 0 10px var(--fpo-accent), 0 0 34px var(--fpo-accent); pointer-events: none; }
        .fpo-status { position: absolute; bottom: -22px; width: 100%; text-align: center; color: var(--fpo-accent); opacity: 0.9; font-size: 12px; font-family: monospace; z-index: 6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 12px; pointer-events: none; }
        .fpo-ctrl { position: absolute; top: calc(6px + env(safe-area-inset-top)); right: 8px; z-index: 7; display: flex; gap: 6px; align-items: center; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.12); padding: 5px 8px; border-radius: 20px; backdrop-filter: blur(6px); font-family: monospace; font-size: 10px; color: #cbd5e1; max-width: calc(100% - 16px); flex-wrap: wrap; justify-content: flex-end; }
        .fpo-ctrl button { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); color: #fff; border-radius: 14px; padding: 3px 10px; font-size: 10px; font-family: monospace; cursor: pointer; min-height: 44px; min-width: 44px; }
        .fpo-ctrl button:disabled { opacity: 0.5; cursor: default; }
        .fpo-ctrl button.on { border-color: var(--fpo-accent); color: var(--fpo-accent); }
        .fpo-ctrl button:focus-visible { outline: 2px solid var(--fpo-accent); outline-offset: 2px; }
        .fpo-panel { position: absolute; top: 50%; transform: translateY(-50%); z-index: 6; min-width: 132px; max-width: 170px; background: rgba(3,4,5,0.6); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 8px 10px; font-family: monospace; pointer-events: none; backdrop-filter: blur(4px); }
        .fpo-panel.left { left: 10px; } .fpo-panel.right { right: 10px; }
        .fpo-panel::before, .fpo-panel::after { content: ''; position: absolute; width: 10px; height: 10px; border-color: var(--fpo-accent); border-style: solid; opacity: 0.9; }
        .fpo-panel::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
        .fpo-panel::after { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }
        .fpo-row { display: flex; justify-content: space-between; gap: 8px; font-size: 9px; letter-spacing: 1px; color: #94a3b8; padding: 2px 0; }
        .fpo-row b { color: var(--fpo-accent); font-weight: bold; }
        .fpo-bar { height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-top: 4px; overflow: hidden; }
        .fpo-bar > div { height: 100%; width: 0%; background: var(--fpo-accent); box-shadow: 0 0 8px var(--fpo-accent); }
        @media (max-width: 639px) { .fpo-panel { display: none; } }
      `}</style>
      <div className="fpo-aura" />
      <div ref={mountRef} className="fpo-canvas" />
      {webglError && (
        <>
          <div className="fpo-fallback" />
          <div style={{ position: 'absolute', top: 34, zIndex: 8, fontFamily: 'monospace', fontSize: 10, color: '#f87171', background: 'rgba(0,0,0,0.7)', padding: '4px 10px', borderRadius: 8, border: '1px solid #ef4444', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>FRIDAY VISUAL SYSTEM — {contextLost ? 'WEBGL CONTEXT LOST' : 'WEBGL UNAVAILABLE'} — FALLBACK ACTIVE</span>
            {contextLost && (
              <button
                type="button"
                onClick={() => setSceneEpoch((e) => e + 1)}
                style={{ minHeight: 44, padding: '4px 12px', borderRadius: 8, border: '1px solid #f87171', background: 'transparent', color: '#fff', fontFamily: 'monospace', fontSize: 10, cursor: 'pointer' }}
              >
                RETRY 3D
              </button>
            )}
          </div>
        </>
      )}
      <button type="button" className="fpo-hit" onClick={onToggle} aria-label="Toggle Friday voice session" title="Tap the orb to awaken Friday" />
      {/* side HUD panels: every value below is a LIVE app signal, no invented numbers */}
      <div className="fpo-panel left" aria-hidden="true">
        <div className="fpo-row"><span>FRIDAY CORE</span><b>{ORB_STATE_LABEL[visual]}</b></div>
        <div className="fpo-row"><span>VOICE LINK</span><b>{linked ? 'LINKED' : 'OFFLINE'}</b></div>
        <div className="fpo-row"><span>TASK</span><b>{props.toolActive ? 'ACTIVE' : '—'}</b></div>
      </div>
      <div className="fpo-panel right" aria-hidden="true">
        <div className="fpo-row"><span>AUDIO INPUT</span><b>{analyser && !props.disableAudio ? 'LIVE' : 'OFF'}</b></div>
        <div className="fpo-bar"><div ref={audioBarRef} /></div>
        <div className="fpo-row"><span>QUALITY</span><b>{qualityLabel}</b></div>
        <div className="fpo-row"><span>GESTURES</span><b>{gesturesOn ? 'ON' : 'OFF'}</b></div>
      </div>
      <div className="fpo-ctrl">
        {!props.disableGestures && (
          <button type="button" onClick={() => void toggleGestures()} disabled={gestureBusy} className={gesturesOn ? 'on' : ''} aria-label="Toggle hand gesture control" aria-pressed={gesturesOn}>
            {gestureBusy ? '…' : gesturesOn ? '✋ ON' : '✋ Gestures'}
          </button>
        )}
        {!props.disableNoise && (
          <button type="button" onClick={() => setNoiseOn((n) => !n)} className={noiseOn ? 'on' : ''} aria-label="Toggle holographic grain" aria-pressed={noiseOn}>
            {noiseOn ? '◉ Grain' : '◎ Grain'}
          </button>
        )}
        <button type="button" onClick={cycleQuality} aria-label={`Render quality ${qualityLabel}, activate to change`}>
          {qualityLabel}
        </button>
      </div>
      {gestureMsg && (
        <div style={{ position: 'absolute', top: 52, right: 8, zIndex: 7, fontFamily: 'monospace', fontSize: 10, color: '#cbd5e1', background: 'rgba(0,0,0,0.55)', padding: '4px 10px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {gestureMsg}
        </div>
      )}
      {gesturesOn && (
        <div style={{ position: 'absolute', top: 52, left: 8, zIndex: 7, fontFamily: 'monospace', fontSize: 10, color: 'var(--fpo-accent)', background: 'rgba(0,0,0,0.55)', padding: '4px 10px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)' }}>
          MODE: {gestureMode}{gesturePaused ? ' • PAUSED' : ''}
        </div>
      )}
      {gesturePaused && (
        <div style={{ position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 8, textAlign: 'center' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 12, letterSpacing: 3, color: '#fbbf24', background: 'rgba(0,0,0,0.7)', padding: '8px 16px', borderRadius: 12, border: '1px solid #f59e0b' }}>
            GESTURE CONTROL PAUSED
          </div>
          <button type="button" onClick={() => globalGestureEngine.setPaused(false)}
            style={{ marginTop: 8, minHeight: 44, padding: '6px 18px', borderRadius: 12, border: '1px solid var(--fpo-accent)', background: 'rgba(0,0,0,0.7)', color: '#fff', fontFamily: 'monospace', fontSize: 11, cursor: 'pointer' }}>
            RESUME
          </button>
        </div>
      )}
      <div className="fpo-label">{ORB_STATE_LABEL[visual]}</div>
      <div className="fpo-name">FRIDAY</div>
      <div className="fpo-status">{line}</div>
    </div>
  );
});
