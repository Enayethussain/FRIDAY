import type { RawHand } from '../components/FridayOrb/handTracking';
import { isValidHand } from '../components/FridayOrb/handTracking';
import { PcBridgeService } from './PcBridgeService';
import { FridayLogger } from './FridayLogger';

/**
 * GestureControlEngine — central gesture brain (§9).
 * Consumes raw MediaPipe hands and maps them per MODE. Every output calls a
 * REAL action (OS cursor via PC bridge, orb transforms, volume/brightness,
 * pause). Confidence thresholds + EMA smoothing + debouncing + cooldowns
 * throughout; ambiguous input produces NOTHING (never a fake action).
 */
export type GestureMode =
  | 'GENERAL' | 'CURSOR' | 'ORB' | 'DOCUMENT'
  | 'FILE_TRANSFER' | 'PRESENTATION' | 'VOLUME' | 'BRIGHTNESS';

export interface GestureEngineEvents {
  onMode?: (m: GestureMode) => void;
  onPause?: (paused: boolean) => void;
  /** orb transforms (host applies) */
  onOrbRotate?: (dx: number, dy: number) => void;
  onOrbZoom?: (next: number) => void;
  onOrbExpand?: (v: number) => void;
  /** file-transfer flow positions (normalized 0..1), host owns file logic */
  onFtEvent?: (e: { type: 'acquire' | 'hold' | 'move' | 'release'; x: number; y: number }) => void;
  onSwipeUp?: () => void;
}

interface Settings {
  sensitivity: number; // cursor multiplier
  deadzonePx: number;
  smooth: number; // EMA alpha 0..1 (higher = snappier)
}

const PINCH_ENTER = 0.5;
const PINCH_EXIT = 0.65;
const HOLD_MS = 500;
const PALM_HOLD_MS = 1200;
const STEP_COOLDOWN_MS = 350;

function fingerExtended(p: Array<{ x: number; y: number }>, tip: number, pip: number, wrist: number): boolean {
  if (!isValidHand(p) || tip >= 21 || pip >= 21 || wrist >= 21) return false;
  const dt = Math.hypot(p[tip].x - p[wrist].x, p[tip].y - p[wrist].y);
  const dp = Math.hypot(p[pip].x - p[wrist].x, p[pip].y - p[wrist].y);
  return dt > dp * 1.15;
}

class GestureControlEngine {
  private ev: GestureEngineEvents = {};
  private mode: GestureMode = 'ORB';
  private paused = false;
  private settings: Settings = { sensitivity: 2.2, deadzonePx: 2, smooth: 0.35 };
  private lastPt: { x: number; y: number } | null = null;
  private ema = { x: 0, y: 0 };
  private pinched = false;
  private pinchSince = 0;
  private dragging = false;
  private palmOpenSince = 0;
  private lastStep = 0;
  private lastMid: { x: number; y: number } | null = null;
  private lastSpread = 0;

  configure(ev: GestureEngineEvents) { this.ev = { ...this.ev, ...ev }; }
  setMode(m: GestureMode) {
    if (this.mode === m) return;
    this.mode = m;
    this.resetTransient();
    FridayLogger.info('Gesture', `MODE=${m}`);
    try { this.ev.onMode?.(m); } catch { /* noop */ }
  }
  getMode(): GestureMode { return this.mode; }
  setPaused(p: boolean) {
    if (this.paused === p) return;
    this.paused = p;
    this.resetTransient();
    FridayLogger.info('Gesture', p ? 'PAUSED (open-palm hold)' : 'RESUMED');
    try { this.ev.onPause?.(p); } catch { /* noop */ }
  }
  isPaused(): boolean { return this.paused; }
  setSettings(s: Partial<Settings>) { this.settings = { ...this.settings, ...s }; }

  private resetTransient() {
    this.lastPt = null;
    this.lastMid = null;
    this.lastSpread = 0;
    this.pinched = false;
    this.dragging = false;
    this.palmOpenSince = 0;
  }

  private pinchGap(p: Array<{ x: number; y: number }>): number {
    // Invalid landmarks must never produce a pinch: return a wide gap.
    if (!isValidHand(p)) return 1;
    const s = Math.max(0.05, Math.hypot(p[0].x - p[9].x, p[0].y - p[9].y));
    return Math.hypot(p[4].x - p[8].x, p[4].y - p[8].y) / s;
  }

  /** called per camera frame with raw hands */
  onFrame(hands: RawHand[]) {
    if (!Array.isArray(hands) || hands.length === 0) { this.resetTransient(); return; }
    // Drop entries with incomplete landmarks (never fabricate missing points).
    // 0 valid hands == NO_HAND; 1 valid hand == single-hand mapping only —
    // two-hand math requires BOTH hands valid.
    const valid = hands.filter((h) => h && isValidHand(h.points)
      && Number.isFinite(h.cx) && Number.isFinite(h.cy) && Number.isFinite(h.openness));
    if (valid.length === 0) { this.resetTransient(); return; }
    hands = valid;
    const now = performance.now();
    const h = hands[0];
    const pts = h.points;

    // emergency pause: open palm held still (any mode, single hand)
    if (hands.length === 1 && h.openness > 0.85) {
      if (!this.palmOpenSince) this.palmOpenSince = now;
      if (now - this.palmOpenSince > PALM_HOLD_MS) {
        this.palmOpenSince = 0;
        this.setPaused(!this.paused);
        return;
      }
    } else {
      this.palmOpenSince = 0;
    }
    if (this.paused) return;

    if (this.mode === 'CURSOR') { this.cursorFrame(h); return; }
    if (this.mode === 'VOLUME' || this.mode === 'BRIGHTNESS') { this.levelFrame(h, now); return; }
    if (this.mode === 'FILE_TRANSFER') { this.transferFrame(h, hands.length, now); return; }
    // ORB / GENERAL / DOCUMENT / PRESENTATION: spatial mapping
    if (hands.length === 1) {
      if (this.lastPt) {
        const dx = -(h.cx - this.lastPt.x) * 6;
        const dy = -(h.cy - this.lastPt.y) * 6;
        try { this.ev.onOrbRotate?.(dx, dy); } catch { /* noop */ }
      }
      this.lastPt = { x: h.cx, y: h.cy };
      this.lastMid = null;
      this.lastSpread = 0;
      try { this.ev.onOrbExpand?.(h.openness); } catch { /* noop */ }
      void pts;
    } else if (hands.length === 2) {
      const mid = { x: (hands[0].cx + hands[1].cx) / 2, y: (hands[0].cy + hands[1].cy) / 2 };
      if (this.lastMid) {
        try { this.ev.onOrbRotate?.(-(mid.x - this.lastMid.x) * 6, -(mid.y - this.lastMid.y) * 6); } catch { /* noop */ }
      }
      this.lastMid = mid;
      this.lastPt = null;
      const spread = Math.hypot(hands[0].cx - hands[1].cx, hands[0].cy - hands[1].cy);
      if (this.lastSpread > 0) {
        // zoom handled by host via onOrbZoom(next) — host owns zoomRef
        try { this.ev.onOrbZoom?.(spread - this.lastSpread); } catch { /* noop */ }
      }
      this.lastSpread = spread;
      try { this.ev.onOrbExpand?.((hands[0].openness + hands[1].openness) / 2); } catch { /* noop */ }
    }
  }

  private cursorFrame(h: RawHand) {
    const pts = h.points;
    const gap = this.pinchGap(pts);
    if (!this.pinched && gap < PINCH_ENTER) {
      this.pinched = true;
      this.pinchSince = performance.now();
    } else if (this.pinched && gap > PINCH_EXIT) {
      // release: click (short) or drop (was dragging)
      const held = performance.now() - this.pinchSince;
      this.pinched = false;
      if (this.dragging) {
        this.dragging = false;
        void PcBridgeService.mouseUp();
        FridayLogger.info('Gesture', 'CURSOR drop');
      } else if (held < 600) {
        void PcBridgeService.click('left').then((r) => FridayLogger.info('Gesture', `CURSOR click ${r.status}`));
      }
    }
    if (this.pinched && !this.dragging && performance.now() - this.pinchSince > HOLD_MS) {
      this.dragging = true;
      void PcBridgeService.mouseDown();
      FridayLogger.info('Gesture', 'CURSOR grab');
    }
    // relative cursor: smoothed palm delta -> screen delta (speed acceleration).
    // No window/screen (tests, SSR) => mapping skipped, pinch logic above still runs.
    if (typeof window === 'undefined' || !window.screen) return;
    const px = h.cx * window.screen.width;
    const py = h.cy * window.screen.height;
    if (this.lastPt === null) {
      this.ema.x = px;
      this.ema.y = py;
      this.cursorX = px;
      this.cursorY = py;
      this.lastPt = { x: px, y: py };
      return;
    }
    const speed = Math.hypot(px - this.lastPt.x, py - this.lastPt.y);
    this.ema.x += (px - this.ema.x) * this.settings.smooth;
    this.ema.y += (py - this.ema.y) * this.settings.smooth;
    const accel = 1 + Math.min(2, speed / 60);
    const mx = (this.ema.x - this.cursorX) * this.settings.sensitivity * accel;
    const my = (this.ema.y - this.cursorY) * this.settings.sensitivity * accel;
    this.lastPt = { x: px, y: py };
    if (Math.hypot(mx, my) < this.settings.deadzonePx) return;
    const nx = this.cursorX + mx;
    const ny = this.cursorY + my;
    this.cursorX = nx;
    this.cursorY = ny;
    void PcBridgeService.moveCursor(nx, ny);
  }
  private cursorX = 0;
  private cursorY = 0;

  private levelFrame(h: RawHand, now: number) {
    // sustained vertical palm motion = steps (volume or brightness by mode)
    if (!this.lastPt) { this.lastPt = { x: h.cx, y: h.cy }; return; }
    const dy = h.cy - this.lastPt.y;
    this.lastPt = { x: h.cx, y: h.cy };
    if (Math.abs(dy) < 0.02 || now - this.lastStep < STEP_COOLDOWN_MS) return;
    this.lastStep = now;
    const dir = dy < 0 ? 1 : -1; // up = increase
    if (this.mode === 'VOLUME') {
      void PcBridgeService.mediaKey(dir > 0 ? 'VOLUME_UP' : 'VOLUME_DOWN', dir > 0 ? 'Volume up' : 'Volume down')
        .then((r) => FridayLogger.info('Gesture', `VOLUME step ${r.status}`));
    } else {
      this.levelVal = Math.max(0, Math.min(1, this.levelVal + dir * 0.08));
      const target = Math.round(this.levelVal * 100);
      void PcBridgeService.setBrightnessPc(target)
        .then((r) => FridayLogger.info('Gesture', `BRIGHTNESS ${r.status} ${r.message}`));
      try { this.ev.onOrbExpand?.(this.levelVal); } catch { /* noop */ }
    }
  }
  private levelVal = 0.5;

  private transferFrame(h: RawHand, count: number, now: number) {
    void now;
    if (count !== 1) { this.lastPt = null; return; }
    const gap = this.pinchGap(h.points);
    if (!this.pinched && gap < PINCH_ENTER) {
      this.pinched = true;
      this.pinchSince = now;
      try { this.ev.onFtEvent?.({ type: 'acquire', x: h.cx, y: h.cy }); } catch { /* noop */ }
    } else if (this.pinched && gap > PINCH_EXIT) {
      this.pinched = false;
      try { this.ev.onFtEvent?.({ type: 'release', x: h.cx, y: h.cy }); } catch { /* noop */ }
    } else if (this.pinched) {
      try { this.ev.onFtEvent?.({ type: this.dragging ? 'move' : 'hold', x: h.cx, y: h.cy }); } catch { /* noop */ }
      if (!this.dragging && now - this.pinchSince > HOLD_MS) this.dragging = true;
    }
  }
}

export const globalGestureEngine = new GestureControlEngine();
