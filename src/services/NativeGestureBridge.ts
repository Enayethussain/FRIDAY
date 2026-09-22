import { Capacitor, registerPlugin } from '@capacitor/core';
import { FridayLogger } from './FridayLogger';

export type NativeGestureId =
  | 'open_palm' | 'pinch_out' | 'pinch_in'
  | 'swipe_left' | 'swipe_right'
  | 'thumb_up' | 'thumb_down' | 'fist'
  | 'two_finger_up' | 'two_finger_left' | 'two_finger_right';

export type NativeGestureAction =
  | 'wake_hud' | 'zoom_in' | 'zoom_out'
  | 'swipe_prev' | 'swipe_next'
  | 'volume_up' | 'volume_down'
  | 'lock_hud' | 'lock_device' | 'open_panel' | 'none';

export interface NativeGestureSettings {
  enabled: boolean;
  camera: 'front' | 'back';
  sensitivity: 'low' | 'medium' | 'high';
  cooldownMs: number;
  showFeedback: boolean;
  haptic: boolean;
  testMode: boolean;
  actions: Record<string, string>;
  calibrated: Record<string, boolean>;
  availableGestures: string[];
}

export interface NativeGestureEvent {
  eventId?: string;
  gesture: string;
  confidence: number;
  action: string;
  success: boolean;
  message: string;
  needsHudAction: boolean;
}

export interface NativeGestureStatus {
  running: boolean;
  enabled: boolean;
  state: string;
  handPresent: boolean;
  fps: number;
  lastGesture: string;
  lastConfidence: number;
  cooldownRemainingMs: number;
  lastActionOk: boolean;
  lastActionResult: string;
  testMode: boolean;
  code?: string;
  message?: string;
  landmarks?: Array<[number, number]>;
  landmarkCount?: number;
}

export interface HudActionHandlers {
  /** Show/wake the Orb. Return message spoken/shown. */
  onWakeHud?: () => { ok: boolean; message: string };
  onOpenPanel?: () => { ok: boolean; message: string };
  onSwipe?: (dir: 'prev' | 'next') => { ok: boolean; message: string };
  onZoom?: (dir: 'in' | 'out') => { ok: boolean; message: string };
  onLockHud?: () => { ok: boolean; message: string };
}

interface GestureControlPlugin {
  start(options?: Record<string, never>): Promise<{ started: boolean; camera?: string; alreadyRunning?: boolean }>;
  stop(): Promise<{ stopped: boolean }>;
  getSettings(): Promise<NativeGestureSettings>;
  updateSettings(options: Partial<NativeGestureSettings>): Promise<NativeGestureSettings>;
  setAction(options: { gesture: string; action: string }): Promise<{ gesture: string; action: string }>;
  getStatus(): Promise<NativeGestureStatus>;
  reportHudResult(options: { eventId: string; success: boolean; message: string }): Promise<{ recorded: boolean }>;
  openAppSettings(): Promise<{ opened: boolean }>;
  setCalibrated(options: { gesture: string; detected: boolean }): Promise<unknown>;
  addListener(event: 'gestureEvent', cb: (e: NativeGestureEvent) => void): Promise<{ remove: () => void }> & { remove: () => void };
  addListener(event: 'gestureStatus', cb: (s: NativeGestureStatus) => void): Promise<{ remove: () => void }> & { remove: () => void };
}

let plugin: GestureControlPlugin | null = null;

function getPlugin(): GestureControlPlugin | null {
  if (!isNativeGestureSupported()) return null;
  if (!plugin) {
    try {
      plugin = registerPlugin<GestureControlPlugin>('GestureControl');
    } catch {
      return null;
    }
  }
  return plugin;
}

/** True only on the Android app build (native plugin registered in MainActivity). */
export function isNativeGestureSupported(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export class NativeGestureBridge {
  private handlers: HudActionHandlers = {};
  private eventSub: { remove: () => void } | null = null;
  private statusSub: { remove: () => void } | null = null;
  private listening = false;

  setHandlers(handlers: HudActionHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /** Attach gestureEvent/gestureStatus listeners (idempotent). */
  async attach(): Promise<boolean> {
    const p = getPlugin();
    if (!p || this.listening) return this.listening;
    try {
      this.eventSub = await p.addListener('gestureEvent', (e) => void this.onEvent(e));
      this.statusSub = await p.addListener('gestureStatus', (s) => {
        try {
          this.lastStatus = s;
          this.statusListeners.forEach((fn) => {
            try {
              fn(s);
            } catch { /* noop */ }
          });
        } catch { /* noop */ }
      });
      this.listening = true;
      return true;
    } catch (e) {
      FridayLogger.error('Gesture', `native attach failed: ${(e as Error)?.message || e}`);
      return false;
    }
  }

  detach(): void {
    try {
      this.eventSub?.remove();
    } catch { /* noop */ }
    try {
      this.statusSub?.remove();
    } catch { /* noop */ }
    this.eventSub = null;
    this.statusSub = null;
    this.listening = false;
  }

  private lastStatus: NativeGestureStatus | null = null;
  private statusListeners = new Set<(s: NativeGestureStatus) => void>();
  private eventListeners = new Set<(e: NativeGestureEvent) => void>();

  onStatus(fn: (s: NativeGestureStatus) => void): () => void {
    this.statusListeners.add(fn);
    if (this.lastStatus) {
      try {
        fn(this.lastStatus);
      } catch { /* noop */ }
    }
    return () => {
      this.statusListeners.delete(fn);
    };
  }

  onEventExternal(fn: (e: NativeGestureEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => {
      this.eventListeners.delete(fn);
    };
  }

  private async onEvent(e: NativeGestureEvent): Promise<void> {
    this.eventListeners.forEach((fn) => {
      try {
        fn(e);
      } catch { /* noop */ }
    });
    if (!e.needsHudAction || !e.eventId) return;
    // HUD-side action: execute for real, then report the HONEST result.
    const result = this.executeHudAction(e.action);
    try {
      await getPlugin()?.reportHudResult({
        eventId: e.eventId,
        success: result.ok,
        message: result.message,
      });
    } catch (err) {
      FridayLogger.error('Gesture', `reportHudResult failed: ${(err as Error)?.message || err}`);
    }
  }

  private executeHudAction(action: string): { ok: boolean; message: string } {
    const h = this.handlers;
    try {
      switch (action) {
        case 'wake_hud':
          if (h.onWakeHud) return h.onWakeHud();
          return { ok: false, message: "Wake action ke liye HUD handler nahi mila." };
        case 'open_panel':
          if (h.onOpenPanel) return h.onOpenPanel();
          return { ok: false, message: "Control panel yahan available nahi hai." };
        case 'swipe_prev':
          if (h.onSwipe) return h.onSwipe('prev');
          return { ok: false, message: "Yahan swipe karne layak kuch nahi hai." };
        case 'swipe_next':
          if (h.onSwipe) return h.onSwipe('next');
          return { ok: false, message: "Yahan swipe karne layak kuch nahi hai." };
        case 'zoom_in':
          if (h.onZoom) return h.onZoom('in');
          return { ok: false, message: "Zoom isn't available here, sir." };
        case 'zoom_out':
          if (h.onZoom) return h.onZoom('out');
          return { ok: false, message: "Zoom isn't available here, sir." };
        case 'lock_hud':
          if (h.onLockHud) return h.onLockHud();
          return { ok: false, message: "HUD lock yahan available nahi hai." };
        case 'lock_device':
          // Native layer already rejected this without device-admin; reaching
          // here means admin IS active but the web was asked — be honest.
          return { ok: false, message: "Sir, Android doesn't allow this action with the current permission." };
        default:
          return { ok: false, message: "Sir, ye action abhi available nahi hai." };
      }
    } catch (err) {
      return { ok: false, message: `Action me error: ${(err as Error)?.message || 'unknown'}` };
    }
  }

  async start(): Promise<{ ok: boolean; message: string }> {
    const p = getPlugin();
    if (!p) return { ok: false, message: "Gesture camera sirf Android app me hai." };
    await this.attach();
    try {
      await p.start();
      return { ok: true, message: "Gesture camera live. Haath dikhao." };
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      return { ok: false, message: err?.message || "Camera start nahi hui." };
    }
  }

  async stop(): Promise<void> {
    try {
      await getPlugin()?.stop();
    } catch { /* already stopped */ }
  }

  async getSettings(): Promise<NativeGestureSettings | null> {
    try {
      return (await getPlugin()?.getSettings()) ?? null;
    } catch {
      return null;
    }
  }

  async updateSettings(patch: Partial<NativeGestureSettings>): Promise<NativeGestureSettings | null> {
    try {
      return (await getPlugin()?.updateSettings(patch)) ?? null;
    } catch {
      return null;
    }
  }

  async setAction(gesture: string, action: string): Promise<boolean> {
    try {
      await getPlugin()?.setAction({ gesture, action });
      return true;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<NativeGestureStatus | null> {
    try {
      return (await getPlugin()?.getStatus()) ?? null;
    } catch {
      return null;
    }
  }

  async openAppSettings(): Promise<boolean> {
    try {
      await getPlugin()?.openAppSettings();
      return true;
    } catch {
      return false;
    }
  }

  async setTestMode(on: boolean): Promise<void> {
    await this.updateSettings({ testMode: on });
  }

  async setCalibrated(gesture: string, detected: boolean): Promise<void> {
    try {
      await getPlugin()?.setCalibrated({ gesture, detected });
    } catch { /* non-fatal */ }
  }
}

export const globalNativeGestureBridge = new NativeGestureBridge();
