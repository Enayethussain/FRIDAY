import { registerPlugin } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

export interface SphereOverlayPluginInterface {
  startOverlay(options?: { state?: number }): Promise<{ started: boolean }>;
  updateState(options: { state: number }): Promise<{ updated: boolean }>;
  stopOverlay(): Promise<{ stopped: boolean }>;
  checkOverlayPermission(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<{ granted: boolean }>;
}

const SphereOverlay = registerPlugin<SphereOverlayPluginInterface>('SphereOverlay');

export type SphereState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export class SphereOverlayService {
  private static stateMap: Record<SphereState, number> = {
    idle: 0,
    listening: 1,
    processing: 2,
    speaking: 3,
    error: 4,
  };

  static async start(state: SphereState = 'idle'): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') return false;
    try {
      const hasPermission = await this.hasPermission();
      if (!hasPermission) {
        await this.requestPermission();
      }
      await SphereOverlay.startOverlay({ state: this.stateMap[state] });
      return true;
    } catch {
      return false;
    }
  }

  static async setState(state: SphereState): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') return false;
    try {
      await SphereOverlay.updateState({ state: this.stateMap[state] });
      return true;
    } catch {
      return false;
    }
  }

  static async stop(): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') return false;
    try {
      await SphereOverlay.stopOverlay();
      return true;
    } catch {
      return false;
    }
  }

  static async hasPermission(): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') return false;
    try {
      const result = await SphereOverlay.checkOverlayPermission();
      return result.granted;
    } catch {
      return false;
    }
  }

  static async requestPermission(): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') return false;
    try {
      const result = await SphereOverlay.requestOverlayPermission();
      return result.granted;
    } catch {
      return false;
    }
  }
}
