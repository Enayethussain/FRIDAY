import { ORB_GESTURE, ORB_HAND } from './orbConfig';
import { voicePerfEnabled } from '../../services/VoiceLatency';

/** Development-only gesture diagnostics (structure counts only, never images). */
function gestureDiag(...args: unknown[]): void {
  if (!voicePerfEnabled()) return;
  try {
    // eslint-disable-next-line no-console
    console.log('[GESTURE]', ...args);
  } catch { /* diagnostics never break tracking */ }
}

/**
 * REAL webcam hand tracking via MediaPipe Tasks Vision (HandLandmarker).
 * Nothing is simulated: without camera + model load, gestures stay OFF
 * and the caller must keep mouse/touch working.
 *
 * ONE hand: palm movement = rotate orb; hand openness (fist<->open,
 * EMA-smoothed) = expand/compact orb layers.
 * TWO hands: midpoint movement = rotate; inter-hand distance = zoom;
 * average openness = expand.
 *
 * All failures (denied camera, blocked CDN, weak device) are reported
 * through onStatus/onError — never thrown.
 */
export interface RawHand {
  /** normalized landmarks (MediaPipe coords) */
  points: Array<{ x: number; y: number }>;
  cx: number;
  cy: number;
  /** 0 = fist, 1 = fully open */
  openness: number;
}

export interface HandGestureCallbacks {
  onRotate: (dxRad: number, dyRad: number) => void;
  onZoom: (next: number) => void;
  getZoom: () => number;
  onExpand: (v: number) => void;
  /** fast directional palm flick; wired by the host to a REAL action */
  onSwipe?: (dir: 'up' | 'down' | 'left' | 'right') => void;
  /** raw per-frame hands for advanced engines (cursor/modes); optional */
  onFrame?: (hands: RawHand[]) => void;
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
  /** structured lifecycle (UNINITIALIZED → INITIALIZING → READY …); optional */
  onState?: (s: GestureStage) => void;
}

interface TrackedHand {
  cx: number;
  cy: number;
  /** 0 = fist, 1 = fully open */
  openness: number;
}

const TIPS = [8, 12, 16, 20];

export type GestureStage =
  | 'UNINITIALIZED' | 'INITIALIZING' | 'READY'
  | 'NO_CAMERA_PERMISSION' | 'CAMERA_ERROR'
  | 'MODEL_LOADING' | 'MODEL_ERROR'
  | 'TRACKING' | 'NO_HAND' | 'PROCESSING_ERROR';

const LANDMARK_COUNT = 21;

/** A hand is usable only with 21 finite landmarks — never fabricate. */
export function isValidHand(p: unknown): p is Array<{ x: number; y: number }> {
  if (!Array.isArray(p) || p.length < LANDMARK_COUNT) return false;
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const pt = (p as Array<any>)[i];
    if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number') return false;
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return false;
  }
  return true;
}

export class HandGestureControl {
  private cb: HandGestureCallbacks;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => unknown } | null = null;
  private raf = 0;
  private running = false;
  private lastSingle: { x: number; y: number } | null = null;
  private lastMid: { x: number; y: number } | null = null;
  private lastSpread = 0;
  private expandSm = 0;
  private lastVideoT = -1;
  /** swipe tracking: trail of recent single-palm positions */
  private trail: Array<{ x: number; y: number; t: number }> = [];
  private lastSwipeAt = 0;
  /** when true, an external engine owns rotate/zoom/expand; this class still tracks swipe + raw frames */
  private externalDriven = false;
  private stage: GestureStage = 'UNINITIALIZED';
  /**
   * Single controlled model lifecycle: the landmarker loads ONCE and is kept
   * while the feature exists (fast re-enable, no re-init race). Camera and
   * frame loop start/stop per toggle. Full release happens in dispose().
   */
  private modelReady = false;
  private loopGen = 0;
  private loggedStructure = false;

  constructor(cb: HandGestureCallbacks) {
    this.cb = cb;
  }

  get active() { return this.running; }

  get gestureStage(): GestureStage { return this.stage; }

  private setStage(s: GestureStage) {
    this.stage = s;
    try { this.cb.onState?.(s); } catch { /* observability only */ }
  }

  setExternalDriven(on: boolean) { this.externalDriven = on; }

  async start(): Promise<void> {
    if (this.running) return;
    this.setStage('INITIALIZING');
    // Model loads exactly once per instance (READY gate below); camera
    // (re)starts on every enable. No inference runs before READY.
    if (!this.modelReady) {
      // Phase 1 — SDK import (bundled chunk must exist).
      let mod: any;
      try {
        this.cb.onStatus('Camera starting…');
        mod = await import('@mediapipe/tasks-vision');
        if (!mod || !mod.FilesetResolver || !mod.HandLandmarker) {
          throw new Error('gesture SDK module incomplete');
        }
      } catch (e: unknown) {
        this.setStage('MODEL_ERROR');
        const msg = e instanceof Error ? e.message : String(e);
        this.cb.onError(`Hand model failed to load (offline?) — gestures OFF. [${msg.slice(0, 80)}]`);
        return;
      }
      // Phase 2 — WASM + model (CDN fetch; GPU first, CPU fallback).
      this.setStage('MODEL_LOADING');
      try {
        this.cb.onStatus('Loading hand model…');
        const vision = await mod.FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
        );
        if (!vision) throw new Error('vision runtime unavailable');
        try {
          this.landmarker = await mod.HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }) as unknown as HandGestureControl['landmarker'];
        } catch {
          // Weak iGPU / blocked GPU delegate — fall back to CPU instead of giving up.
          this.cb.onStatus('GPU hand model failed — trying CPU fallback…');
          this.landmarker = await mod.HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }) as unknown as HandGestureControl['landmarker'];
        }
        if (!this.landmarker || typeof (this.landmarker as any).detectForVideo !== 'function') {
          throw new Error('hand landmarker unavailable');
        }
        this.modelReady = true;
      } catch (e: unknown) {
        this.setStage('MODEL_ERROR');
        const msg = e instanceof Error ? e.message : String(e);
        if (/fetch|network|cdn|model/i.test(msg)) this.cb.onError('Hand model failed to load (offline?) — gestures OFF.');
        else this.cb.onError(`Gesture model error — ${msg.slice(0, 120)}`);
        return;
      }
    }
    // Phase 3 — camera (fresh stream every enable; old one was released).
    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', 'true');
    this.video.muted = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
    } catch (e: unknown) {
      this.setStage('NO_CAMERA_PERMISSION');
      const msg = e instanceof Error ? e.message : String(e);
      if (/denied|permission|NotAllowed/i.test(msg)) {
        this.cb.onStatus('HAND CONTROL — CAMERA ACCESS REQUIRED. Voice, orb and phone control keep working.');
        this.cb.onError('Camera blocked — gestures OFF, mouse/touch still works.');
      } else {
        this.setStage('CAMERA_ERROR');
        this.cb.onError(`Camera error — ${msg.slice(0, 120)}`);
      }
      return;
    }
    // Phase 4 — playback must yield real pixels before tracking starts.
    try {
      this.video.srcObject = this.stream;
      await this.video.play();
      if (this.video.readyState < 2 || this.video.videoWidth === 0) {
        throw new Error('camera frame not ready');
      }
    } catch (e: unknown) {
      this.stopTracks();
      this.setStage('CAMERA_ERROR');
      const msg = e instanceof Error ? e.message : String(e);
      this.cb.onError(`Camera error — ${msg.slice(0, 120)}`);
      return;
    }

    this.running = true;
    this.loggedStructure = false;
    this.loopGen++;
    this.setStage('READY');
    this.cb.onStatus('Gestures ON — move to orbit, open/close to expand, two hands to zoom, flick ↑ for voice');
    this.loop(this.loopGen);
  }

  private loop = (gen: number) => {
    // Generation guard: a stale loop from a previous enable can never
    // process frames (exactly one active loop exists).
    if (!this.running || gen !== this.loopGen) return;
    this.raf = requestAnimationFrame(() => this.loop(gen));
    const v = this.video;
    const lm = this.landmarker;
    // No inference before READY: landmarker must exist (model gate).
    if (!v || !lm || v.readyState < 2 || v.videoWidth === 0) return;
    if (v.currentTime === this.lastVideoT) return;
    this.lastVideoT = v.currentTime;
    let res: { landmarks?: Array<Array<{ x: number; y: number }>>; handedness?: unknown };
    try {
      res = lm.detectForVideo(v, performance.now()) as unknown as typeof res;
    } catch {
      return;
    }
    if (!this.loggedStructure) {
      this.loggedStructure = true;
      const keys = res && typeof res === 'object' ? Object.keys(res) : [];
      const counts = Array.isArray(res.landmarks) ? res.landmarks.map((h) => (Array.isArray(h) ? h.length : -1)) : [];
      gestureDiag('model result', `keys=[${keys.join(',')}] hands=${counts.length} lmCounts=[${counts.join(',')}] handedness=${res.handedness !== undefined ? 'present' : 'absent'}`);
    }
    // Validate every hand: incomplete landmark sets are skipped, never
    // fabricated. Zero valid hands == NO_HAND (resets transient state).
    const raw = Array.isArray(res.landmarks) ? res.landmarks.slice(0, 2) : [];
    const valid = raw.filter(isValidHand);
    const hands = valid.map((p) => this.classify(p));
    try {
      this.cb.onFrame?.(valid.map((p) => ({ ...this.classify(p), points: p })) as RawHand[]);
    } catch { /* engine-only */ }
    try {
      this.apply(hands);
      this.setStage(hands.length > 0 ? 'TRACKING' : 'NO_HAND');
    } catch {
      // One bad frame must never kill the loop or crash the app.
      this.setStage('PROCESSING_ERROR');
    }
  };

  /**
   * Openness = avg fingertip-to-wrist distance / hand scale (wrist to
   * middle knuckle). ~1.2 closed fist, ~2.2+ fully open. Continuous 0..1.
   */
  private classify(p: Array<{ x: number; y: number }>): TrackedHand {
    // Defensive: only validated 21-point hands reach here (see isValidHand).
    if (!isValidHand(p)) throw new Error('invalid hand landmarks');
    const w = p[0];
    const sx = w.x - p[9].x;
    const sy = w.y - p[9].y;
    const scale = Math.max(0.05, Math.hypot(sx, sy));
    let sum = 0;
    for (const t of TIPS) sum += Math.hypot(p[t].x - w.x, p[t].y - w.y) / scale;
    const norm = sum / TIPS.length;
    const openness = Math.max(0, Math.min(1, (norm - ORB_HAND.openMin) / (ORB_HAND.openMax - ORB_HAND.openMin)));
    return { cx: p[9].x, cy: p[9].y, openness };
  }

  private pushExpand(raw: number) {
    this.expandSm += (raw - this.expandSm) * ORB_HAND.ema;
    this.cb.onExpand(Math.max(0, Math.min(1, this.expandSm)));
  }

  private apply(hands: TrackedHand[]) {
    if (hands.length === 1) {
      const h = hands[0];
      if (!this.externalDriven) {
        const prev = this.lastSingle;
        if (prev) {
          // mirror X so hand motion matches orb motion on screen
          this.cb.onRotate(-(h.cx - prev.x) * ORB_HAND.moveGain, -(h.cy - prev.y) * ORB_HAND.moveGain);
        }
      }
      this.lastSingle = { x: h.cx, y: h.cy };
      this.lastMid = null;
      this.lastSpread = 0;
      if (!this.externalDriven) this.pushExpand(h.openness);
      this.trackSwipe(h.cx, h.cy);
      return;
    }
    if (hands.length === 2) {
      const mid = { x: (hands[0].cx + hands[1].cx) / 2, y: (hands[0].cy + hands[1].cy) / 2 };
      if (!this.externalDriven) {
        if (this.lastMid) {
          this.cb.onRotate(-(mid.x - this.lastMid.x) * ORB_HAND.moveGain, -(mid.y - this.lastMid.y) * ORB_HAND.moveGain);
        }
      }
      this.lastMid = mid;
      this.lastSingle = null;
      const spread = Math.hypot(hands[0].cx - hands[1].cx, hands[0].cy - hands[1].cy);
      if (!this.externalDriven) {
        if (this.lastSpread > 0) {
          this.cb.onZoom(this.cb.getZoom() + (spread - this.lastSpread) * ORB_HAND.spreadGain);
        }
        this.pushExpand((hands[0].openness + hands[1].openness) / 2);
      }
      this.lastSpread = spread;
      return;
    }
    this.lastSingle = null;
    this.lastMid = null;
    this.lastSpread = 0;
  }

  /** fast palm flick in one direction = swipe (single hand only, cooldown guarded) */
  private trackSwipe(x: number, y: number) {
    const now = performance.now();
    this.trail.push({ x, y, t: now });
    while (this.trail.length > 0 && now - this.trail[0].t > 450) this.trail.shift();
    if (!this.cb.onSwipe || now - this.lastSwipeAt < 1500 || this.trail.length < 3) return;
    const a = this.trail[0];
    const b = this.trail[this.trail.length - 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.3 || b.t - a.t > 450) return;
    this.lastSwipeAt = now;
    this.trail = [];
    this.cb.onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }

  /** Release camera + video element only; the loaded model stays READY. */
  private stopTracks() {
    try { this.video?.pause(); } catch { /* noop */ }
    try {
      const s = this.video?.srcObject as MediaStream | null;
      s?.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
    } catch { /* noop */ }
    if (this.video) {
      try { (this.video as any).srcObject = null; } catch { /* noop */ }
    }
    if (this.stream) { try { this.stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ } }
    this.stream = null;
    this.video = null;
  }

  stop() {
    // Invalidate any in-flight loop generation first: a stale loop can never
    // process another frame even if its rAF already fired.
    this.loopGen++;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stopTracks();
    this.lastSingle = null;
    this.lastMid = null;
    this.lastSpread = 0;
    this.trail = [];
    this.expandSm = 0;
    try { this.cb.onExpand(0); } catch { /* noop */ }
    this.setStage('UNINITIALIZED');
  }

  dispose() {
    this.stop();
    try { (this.landmarker as unknown as { close?: () => void })?.close?.(); } catch { /* noop */ }
    this.landmarker = null;
    this.modelReady = false;
  }

  /** True once the model loaded (READY gate for inference). */
  get isModelReady() { return this.modelReady; }
}

export { ORB_GESTURE };
