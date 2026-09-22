import type { ThemeAccent } from '../../types';

/**
 * Centralized orb configuration.
 * Colors / quality / motion targets live HERE so the look can be
 * changed later without touching any Three.js rendering code.
 */

export interface OrbPalette {
  name: string;
  /** deep background energy */
  deep: string;
  /** main mid energy */
  mid: string;
  /** white-hot highlight */
  bright: string;
  /** glass shell tint */
  shell: string;
  /** particle tint */
  particle: string;
  /** error flash tint (only used during real errors) */
  alert: string;
}

export const ORB_PALETTES: Record<ThemeAccent, OrbPalette> = {
  cyan:     { name: 'Cyan',    deep: '#001433', mid: '#0084ff', bright: '#00ffe1', shell: '#0066ff', particle: '#ffffff', alert: '#ff5a3c' },
  violet:   { name: 'Violet',  deep: '#1a0533', mid: '#7c3aed', bright: '#e879f9', shell: '#8b5cf6', particle: '#f5d0fe', alert: '#ff5a3c' },
  emerald:  { name: 'Emerald', deep: '#001a14', mid: '#059669', bright: '#6ee7b7', shell: '#10b981', particle: '#d1fae5', alert: '#ff5a3c' },
  amber:    { name: 'Amber Reactor', deep: '#0a0600', mid: '#FFB000', bright: '#FFE600', shell: '#FFC400', particle: '#FFE600', alert: '#ff5a3c' },
  rose:     { name: 'Crimson', deep: '#1a0505', mid: '#dc2626', bright: '#fca5a5', shell: '#ef4444', particle: '#fee2e2', alert: '#ffb03c' },
};

export type OrbQuality = 'low' | 'medium' | 'high';

export interface OrbQualityProfile {
  particles: number;
  debris: number;
  hudTicks: number;
  shellSegments: number;
  plasmaSegments: number;
  pixelRatioCap: number;
}

export const ORB_QUALITY: Record<OrbQuality, OrbQualityProfile> = {
  low:    { particles: 220, debris: 60,  hudTicks: 40, shellSegments: 40, plasmaSegments: 56, pixelRatioCap: 1 },
  medium: { particles: 500, debris: 120, hudTicks: 64, shellSegments: 56, plasmaSegments: 80, pixelRatioCap: 1.5 },
  high:   { particles: 900, debris: 170, hudTicks: 96, shellSegments: 64, plasmaSegments: 96, pixelRatioCap: 2 },
};

/** Pick a reasonable default from device capability. */
export function autoQuality(): OrbQuality {
  try {
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    const cores = navigator.hardwareConcurrency || 4;
    const small = Math.min(window.innerWidth, window.innerHeight) < 500;
    if ((mem && mem <= 4) || cores <= 4 || small) return 'low';
    if ((mem && mem <= 6) || cores <= 6) return 'medium';
    return 'high';
  } catch {
    return 'medium';
  }
}

export interface OrbMotionTarget {
  rotY: number;
  rotX: number;
  timeScale: number;
  brightness: number;
  shell: number;
  pulse: number;
  ringSpeed: number;
  trail: number;
}

/**
 * Per-state motion/energy targets. Values are intensities, not fake
 * content — the resolver only selects states backed by real signals.
 */
export const ORB_STATE_TARGETS: Record<string, OrbMotionTarget> = {
  sleep:      { rotY: 0.002, rotX: 0.001, timeScale: 0.35, brightness: 0.55, shell: 0.22, pulse: 0.0, ringSpeed: 0.3, trail: 0.0 },
  idle:       { rotY: 0.005, rotX: 0.002, timeScale: 0.7,  brightness: 0.95, shell: 0.35, pulse: 0.0, ringSpeed: 1.0, trail: 0.0 },
  wake:       { rotY: 0.02,  rotX: 0.006, timeScale: 1.8,  brightness: 1.5,  shell: 0.6,  pulse: 0.8, ringSpeed: 2.4, trail: 0.5 },
  listening:  { rotY: 0.03,  rotX: 0.006, timeScale: 2.4,  brightness: 1.55, shell: 0.55, pulse: 0.0, ringSpeed: 1.8, trail: 0.25 },
  thinking:   { rotY: 0.045, rotX: 0.01,  timeScale: 3.0,  brightness: 1.7,  shell: 0.65, pulse: 0.6, ringSpeed: 3.2, trail: 0.9 },
  processing: { rotY: 0.05,  rotX: 0.012, timeScale: 3.2,  brightness: 1.85, shell: 0.7,  pulse: 0.8, ringSpeed: 3.8, trail: 1.0 },
  speaking:   { rotY: 0.05,  rotX: 0.01,  timeScale: 3.2,  brightness: 1.95, shell: 0.7,  pulse: 1.0, ringSpeed: 2.2, trail: 0.4 },
  executing:  { rotY: 0.055, rotX: 0.013, timeScale: 3.4,  brightness: 1.9,  shell: 0.72, pulse: 0.9, ringSpeed: 4.0, trail: 1.0 },
  gesture:    { rotY: 0.025, rotX: 0.005, timeScale: 1.8,  brightness: 1.35, shell: 0.5,  pulse: 0.3, ringSpeed: 1.6, trail: 0.3 },
  success:    { rotY: 0.02,  rotX: 0.005, timeScale: 1.6,  brightness: 1.8,  shell: 0.7,  pulse: 1.0, ringSpeed: 2.6, trail: 0.6 },
  error:      { rotY: 0.012, rotX: 0.004, timeScale: 1.1,  brightness: 1.2,  shell: 0.5,  pulse: 0.7, ringSpeed: 1.2, trail: 0.2 },
};

export const ORB_TIMING = {
  /** wake activation cinematic length (ms) */
  wakeMs: 2500,
  /** success pulse length (ms) */
  successMs: 1400,
  /** error accent length (ms) — orb returns to palette after */
  errorMs: 1600,
  /** tool-active below this age reads as "processing", then "executing" */
  processingMs: 1200,
};

export const ORB_GESTURE = {
  /** pinch thresholds kept for reference; hand control uses openness (see ORB_HAND) */
  pinchEnter: 0.32,
  pinchExit: 0.42,
  /** px of pointer travel mapped to one radian of orb rotation */
  rotatePxPerRad: 160,
  /** zoom clamp mirrors mouse-wheel clamp */
  minZoom: 1.8,
  maxZoom: 4.2,
};

export const ORB_HAND = {
  /** hand-openness hysteresis (avg fingertip spread / hand scale) */
  openEnter: 1.9,
  openExit: 1.6,
  /** openness value mapping range */
  openMin: 1.3,
  openMax: 2.1,
  /** EMA smoothing for expansion (0..1, higher = snappier) */
  ema: 0.25,
  /** normalized palm travel mapped to radians */
  moveGain: 6,
  /** inter-hand spread delta mapped to zoom units */
  spreadGain: 3,
};
