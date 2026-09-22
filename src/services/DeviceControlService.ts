import { registerPlugin } from '@capacitor/core';
import {
  ActionResult, actionFail, actionOk, classifyNativeError, withTimeout,
} from './ActionResult';

export interface VolumeInfo {
  current: number;
  max: number;
  ring: number;
  ringMax: number;
  alarm: number;
}

export interface BrightnessInfo {
  brightness: number;
  max: number;
  percentage: number;
}

export interface BluetoothInfo {
  available: boolean;
  enabled: boolean;
  name?: string;
}

export interface DeviceControlPluginInterface {
  toggleFlashlight(): Promise<{ flashlightOn: boolean }>;
  setFlashlight(options: { on: boolean }): Promise<{ flashlightOn: boolean }>;
  getVolume(): Promise<VolumeInfo>;
  setVolume(options: { level: number; stream?: string }): Promise<{ level: number; max: number; stream: string; requested?: number; applied?: boolean }>;
  adjustVolume(options?: { delta?: number; stream?: string }): Promise<{ newVolume: number; stream: string }>;
  setRingerMode(options: { mode: string }): Promise<{ mode: string; muted: boolean }>;
  getRingerMode(): Promise<{ mode: string; muted: boolean }>;
  getBrightness(): Promise<BrightnessInfo>;
  setBrightness(options: { level: number }): Promise<{ brightness: number; percentage: number; requested?: number; applied?: boolean }>;
  lockScreen(): Promise<{ locked: boolean; method?: string }>;
  wakeUpScreen(): Promise<{ awake: boolean; wasAlreadyOn?: boolean }>;
  getBluetoothStatus(): Promise<BluetoothInfo>;
  toggleBluetooth(): Promise<{ enabled: boolean; changed?: boolean; note?: string }>;
  openSettings(options: { setting: string }): Promise<{ opened: string }>;
  checkPermission(options: { name: string }): Promise<{ name: string; granted: boolean }>;
  canWriteSettings(): Promise<{ canWrite: boolean }>;
  openWriteSettings(): Promise<{ opened: boolean }>;
  openAppSettings(): Promise<{ opened: boolean }>;
  isDeviceAdmin(): Promise<{ active: boolean }>;
  enableDeviceAdmin(): Promise<{ opened: boolean }>;
}

const DeviceControl = registerPlugin<DeviceControlPluginInterface>('DeviceControl');
const T = 6000;

export class DeviceControlService {
  static async setFlashlightExplicit(on: boolean): Promise<ActionResult> {
    const started = Date.now();
    try {
      const r = await withTimeout('flashlight', 'Flashlight', DeviceControl.setFlashlight({ on }), T);
      if (r.flashlightOn === on) return actionOk('flashlight', 'Flashlight', `Flashlight ${on ? 'on' : 'off'} kar diya.`, Date.now() - started, r.flashlightOn);
      return actionFail('FAILED', 'flashlight', 'Flashlight', 'Flashlight state verify nahi hua.', Date.now() - started);
    } catch (e) {
      return classifyNativeError('flashlight', 'Flashlight', e, Date.now() - started);
    }
  }

  static async toggleFlashlight(): Promise<ActionResult> {
    const started = Date.now();
    try {
      const r = await withTimeout('flashlight', 'Flashlight', DeviceControl.toggleFlashlight(), T);
      return actionOk('flashlight', 'Flashlight', `Flashlight ${r.flashlightOn ? 'on' : 'off'} hai.`, Date.now() - started, r.flashlightOn);
    } catch (e) {
      return classifyNativeError('flashlight', 'Flashlight', e, Date.now() - started);
    }
  }

  static async getVolume(): Promise<VolumeInfo> {
    try {
      return await withTimeout('get_volume', 'Volume', DeviceControl.getVolume(), T);
    } catch {
      throw new Error('Volume read nahi ho paya.');
    }
  }

  static async adjustVolume(delta: number, stream?: string): Promise<ActionResult> {
    const started = Date.now();
    try {
      const r = await withTimeout('volume', 'Volume', DeviceControl.adjustVolume({ delta, stream }), T);
      return actionOk('volume', 'Volume', `Volume ab ${r.newVolume} hai.`, Date.now() - started, r.newVolume);
    } catch (e) {
      return classifyNativeError('volume', 'Volume', e, Date.now() - started);
    }
  }

  static async setVolume(level: number, stream?: string): Promise<ActionResult> {
    const started = Date.now();
    try {
      const r = await withTimeout('volume', 'Volume', DeviceControl.setVolume({ level, stream }), T);
      if (r.applied === false) return actionFail('FAILED', 'volume', 'Volume', 'Volume set nahi ho paya.', Date.now() - started);
      return actionOk('volume', 'Volume', `Volume ${r.level} kar diya.`, Date.now() - started, r.level);
    } catch (e) {
      return classifyNativeError('volume', 'Volume', e, Date.now() - started);
    }
  }

  static async setMuted(muted: boolean): Promise<ActionResult> {
    const started = Date.now();
    try {
      const r = await withTimeout('ringer', 'Ringer', DeviceControl.setRingerMode({ mode: muted ? 'silent' : 'normal' }), T);
      if (r.muted === muted) return actionOk('ringer', 'Ringer', muted ? 'Phone silent kar diya.' : 'Sound on kar diya.', Date.now() - started);
      return actionFail('FAILED', 'ringer', 'Ringer', 'Ringer mode verify nahi hua.', Date.now() - started);
    } catch (e) {
      return classifyNativeError('ringer', 'Ringer', e, Date.now() - started);
    }
  }

  static async getBrightnessSafe(): Promise<BrightnessInfo> {
    try {
      return await withTimeout('get_brightness', 'Brightness', DeviceControl.getBrightness(), T);
    } catch {
      throw new Error('Brightness read nahi ho payi.');
    }
  }

  static async setBrightness(level: number): Promise<ActionResult> {
    const started = Date.now();
    try {
      const r = await withTimeout('brightness', 'Brightness', DeviceControl.setBrightness({ level }), T);
      if (r.applied === false) {
        return actionFail('PERMISSION_REQUIRED', 'brightness', 'Brightness',
          'Brightness change ke liye Write Settings permission chahiye.', Date.now() - started);
      }
      return actionOk('brightness', 'Brightness', `Brightness ${r.percentage}% kar diya.`, Date.now() - started);
    } catch (e) {
      return classifyNativeError('brightness', 'Brightness', e, Date.now() - started);
    }
  }

  static async lockScreen(): Promise<ActionResult> {
    const started = Date.now();
    try {
      await withTimeout('lock', 'Lock', DeviceControl.lockScreen(), T);
      return actionOk('lock', 'Lock', 'Phone lock kar diya.', Date.now() - started);
    } catch (e) {
      return classifyNativeError('lock', 'Lock', e, Date.now() - started);
    }
  }

  static async wakeUpScreen(): Promise<ActionResult> {
    const started = Date.now();
    try {
      const r = await withTimeout('wake', 'Screen', DeviceControl.wakeUpScreen(), T);
      if (r.awake) return actionOk('wake', 'Screen', r.wasAlreadyOn ? 'Screen pehle se on thi.' : 'Screen on kar diya.', Date.now() - started);
      return actionFail('FAILED', 'wake', 'Screen', 'Screen on nahi ho payi.', Date.now() - started);
    } catch (e) {
      return classifyNativeError('wake', 'Screen', e, Date.now() - started);
    }
  }

  static async getBluetoothStatus(): Promise<BluetoothInfo> {
    try {
      return await withTimeout('bt_status', 'Bluetooth', DeviceControl.getBluetoothStatus(), T);
    } catch {
      return { available: false, enabled: false };
    }
  }

  /**
   * Honest toggle: Android 13+ often ignores programmatic toggle.
   * changed=false => settings opened, user flips manually. Never claims a flip.
   */
  static async toggleBluetooth(): Promise<ActionResult> {
    const started = Date.now();
    try {
      const r = await withTimeout('bluetooth', 'Bluetooth', DeviceControl.toggleBluetooth(), T + 4000);
      if (r.changed) return actionOk('bluetooth', 'Bluetooth', `Bluetooth ${r.enabled ? 'on' : 'off'} kar diya.`, Date.now() - started);
      try { await DeviceControl.openSettings({ setting: 'bluetooth' }); } catch { /* best effort */ }
      return actionFail('NOT_SUPPORTED', 'bluetooth', 'Bluetooth',
        'Android ne direct toggle allow nahi kiya. Bluetooth settings khol diya hai — wahan se on/off karo.', Date.now() - started);
    } catch (e) {
      return classifyNativeError('bluetooth', 'Bluetooth', e, Date.now() - started);
    }
  }

  static async openSettings(setting: string): Promise<ActionResult> {
    const started = Date.now();
    try {
      await withTimeout('open_settings', setting, DeviceControl.openSettings({ setting }), T);
      return actionOk('open_settings', setting, `${setting} settings khol diye.`, Date.now() - started);
    } catch (e) {
      return classifyNativeError('open_settings', setting, e, Date.now() - started);
    }
  }

  // ---- Permission Center support (real checks, never assumed) ----

  static async checkPermission(name: string): Promise<boolean> {
    try {
      const r = await withTimeout('perm_check', name, DeviceControl.checkPermission({ name }), T);
      return r.granted;
    } catch {
      return false;
    }
  }

  static async canWriteSettings(): Promise<boolean> {
    try {
      const r = await withTimeout('perm_check', 'write-settings', DeviceControl.canWriteSettings(), T);
      return r.canWrite;
    } catch {
      return false;
    }
  }

  static async openWriteSettings(): Promise<boolean> {
    try { await DeviceControl.openWriteSettings(); return true; } catch { return false; }
  }

  static async openAppSettings(): Promise<boolean> {
    try { await DeviceControl.openAppSettings(); return true; } catch { return false; }
  }

  static async isDeviceAdmin(): Promise<boolean> {
    try {
      const r = await withTimeout('perm_check', 'device-admin', DeviceControl.isDeviceAdmin(), T);
      return r.active;
    } catch {
      return false;
    }
  }

  static async enableDeviceAdmin(): Promise<boolean> {
    try { await DeviceControl.enableDeviceAdmin(); return true; } catch { return false; }
  }

  // ---- Backwards-compatible shim (boolean API used by old UI paths) ----
  /** @deprecated use setFlashlightExplicit */
  static async setFlashlight(on: boolean): Promise<boolean> {
    const r = await DeviceControlService.setFlashlightExplicit(on);
    return r.status === 'SUCCESS';
  }
}
