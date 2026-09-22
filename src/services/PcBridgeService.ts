import { ActionResult, actionFail, actionOk, classifyNativeError, withTimeout } from './ActionResult';

declare global {
  interface Window {
    fridayDesktop?: {
      isDesktop: boolean;
      pc: (cmd: Record<string, unknown>) => Promise<Record<string, unknown>>;
      openPath: (p: string) => Promise<boolean>;
      ftSendPath: (filePath: string, token: string, toDeviceId?: string) => Promise<{ name: string; size: number }>;
      pathForFile: (file: File) => string;
      onFtProgress: (cb: (p: { sent: number; total: number }) => void) => () => void;
      on: (channel: string, cb: (...a: unknown[]) => void) => () => void;
      shellInfo: () => Promise<{ serverUrl: string; hudOverlay: boolean; isDesktop: boolean; supervisorState?: string; autostart?: boolean }>;
    };
  }
}

const T = 10000;

function needDesktop(action: string, target: string): ActionResult | null {
  try {
    if (typeof window !== 'undefined' && window.fridayDesktop?.isDesktop) return null;
  } catch { /* noop */ }
  return actionFail('NOT_SUPPORTED', action, target, 'Ye action sirf JARVIS desktop app me chalta hai (browser me nahi).', 0);
}

/**
 * PcBridgeService — real Windows actions through the desktop shell's
 * PowerShell helper. Every method verifies the OS result; the bridge
 * throws the REAL reason on failure (mapped honestly below).
 */
export class PcBridgeService {
  static get isDesktop(): boolean {
    try { return typeof window !== 'undefined' && !!window.fridayDesktop?.isDesktop; }
    catch { return false; }
  }

  static onShellEvent(channel: string, cb: (...a: unknown[]) => void): () => void {
    try { return window.fridayDesktop?.on(channel, cb) ?? (() => {}); }
    catch { return () => {}; }
  }

  /** Desktop shell info (server URL, supervisor state, autostart flag). Null in browser. */
  static async shellInfo(): Promise<{ serverUrl: string; hudOverlay: boolean; isDesktop: boolean; supervisorState?: string; autostart?: boolean } | null> {
    try {
      if (typeof window === 'undefined' || !window.fridayDesktop?.isDesktop) return null;
      return await window.fridayDesktop.shellInfo();
    } catch { return null; }
  }

  private static async call(action: string, target: string, cmd: Record<string, unknown>, ms = T): Promise<Record<string, unknown>> {
    const nd = needDesktop(action, target);
    if (nd) throw new Error(`__NOTDESKTOP__${nd.message}`);
    try {
      return await withTimeout(action, target, window.fridayDesktop!.pc(cmd), ms);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m.startsWith('__NOTDESKTOP__')) throw new Error(m.slice('__NOTDESKTOP__'.length));
      throw e;
    }
  }

  static async moveCursor(x: number, y: number): Promise<void> {
    await PcBridgeService.call('pc_cursor', 'cursor', { cmd: 'move', x: Math.round(x), y: Math.round(y) }, 3000).catch(() => {});
  }

  static async click(button: 'left' | 'right' | 'middle' = 'left'): Promise<ActionResult> {
    const started = Date.now();
    try {
      await PcBridgeService.call('pc_click', 'mouse', { cmd: 'click', button });
      return actionOk('pc_click', 'mouse', `${button} click ho gaya.`, Date.now() - started);
    } catch (e) { return classifyNativeError('pc_click', 'mouse', e, Date.now() - started); }
  }

  static async mouseDown(): Promise<void> {
    await PcBridgeService.call('pc_drag', 'mouse', { cmd: 'down' }, 3000).catch(() => {});
  }
  static async mouseUp(): Promise<void> {
    await PcBridgeService.call('pc_drag', 'mouse', { cmd: 'up' }, 3000).catch(() => {});
  }
  static async scroll(delta: number): Promise<void> {
    await PcBridgeService.call('pc_scroll', 'scroll', { cmd: 'scroll', delta: Math.round(delta) }, 3000).catch(() => {});
  }
  static async sendKeys(keys: string, label: string): Promise<ActionResult> {
    const started = Date.now();
    try {
      await PcBridgeService.call('pc_key', label, { cmd: 'key', sendkeys: keys });
      return actionOk('pc_key', label, `${label} keys active app ko bhej di.`, Date.now() - started);
    } catch (e) { return classifyNativeError('pc_key', label, e, Date.now() - started); }
  }
  static async mediaKey(key: 'VOLUME_UP' | 'VOLUME_DOWN' | 'MUTE' | 'PLAY_PAUSE' | 'NEXT' | 'PREV', label: string): Promise<ActionResult> {
    const started = Date.now();
    try {
      await PcBridgeService.call('pc_volume', label, { cmd: 'key', key });
      return actionOk('pc_volume', label, `${label} ho gaya.`, Date.now() - started);
    } catch (e) { return classifyNativeError('pc_volume', label, e, Date.now() - started); }
  }

  static async setBrightnessPc(level: number): Promise<ActionResult> {
    const started = Date.now();
    try {
      const r = await PcBridgeService.call('pc_brightness', 'Brightness', { cmd: 'bright', level: Math.max(0, Math.min(100, Math.round(level))) });
      return actionOk('pc_brightness', 'Brightness', `Brightness ${r.level}% hai.`, Date.now() - started, r.level);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/BRIGHTNESS_UNAVAILABLE/i.test(m)) {
        return actionFail('NOT_SUPPORTED', 'pc_brightness', 'Brightness', 'Brightness control unavailable on this display.', Date.now() - started, m);
      }
      return classifyNativeError('pc_brightness', 'Brightness', e, Date.now() - started);
    }
  }

  static async lockPc(): Promise<ActionResult> {
    const started = Date.now();
    try {
      await PcBridgeService.call('pc_lock', 'PC', { cmd: 'lock' });
      return actionOk('pc_lock', 'PC', 'PC lock ho gaya.', Date.now() - started);
    } catch (e) { return classifyNativeError('pc_lock', 'PC', e, Date.now() - started); }
  }

  static async powerPc(kind: 'shutdown' | 'restart' | 'sleep' | 'cancel', secs = 30): Promise<ActionResult> {
    const started = Date.now();
    const target = kind === 'cancel' ? 'Shutdown timer' : `PC ${kind}`;
    try {
      await PcBridgeService.call('pc_power', target, { cmd: kind, secs });
      const msg = kind === 'cancel' ? 'Shutdown cancel ho gaya.'
        : kind === 'sleep' ? 'PC sleep ho raha hai.'
        : `PC ${kind} in ${secs}s schedule ho gaya.`;
      return actionOk('pc_power', target, msg, Date.now() - started);
    } catch (e) { return classifyNativeError('pc_power', target, e, Date.now() - started); }
  }

  static async openOsPath(p: string): Promise<ActionResult> {
    const started = Date.now();
    const nd = needDesktop('pc_open', p);
    if (nd) return nd;
    try {
      await withTimeout('pc_open', p, window.fridayDesktop!.openPath(p), T);
      return actionOk('pc_open', p, 'File OS me khol di.', Date.now() - started);
    } catch (e) { return classifyNativeError('pc_open', p, e, Date.now() - started); }
  }
}
