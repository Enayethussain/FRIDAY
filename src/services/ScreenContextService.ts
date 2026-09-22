import { registerPlugin } from '@capacitor/core';

export interface CurrentApp {
  package: string;
  appName: string;
  activity: string;
  category: string;
  timestamp: number;
}

export interface ScreenContextPluginInterface {
  checkUsagePermission(): Promise<{ granted: boolean }>;
  openUsageSettings(): Promise<{ opened: boolean }>;
  getCurrentApp(): Promise<CurrentApp>;
  getRecentApps(options?: { limit?: number }): Promise<{ apps: CurrentApp[] }>;
  isExcludedApp(options: { package: string }): Promise<{ excluded: boolean }>;
}

const ScreenContext = registerPlugin<ScreenContextPluginInterface>('ScreenContext');

const ASSIST_KEY = 'friday_screen_assist_enabled';

export class ScreenContextService {
  private static lastContext: CurrentApp | null = null;
  private static pollingInterval: ReturnType<typeof setInterval> | null = null;
  private static listeners: ((app: CurrentApp) => void)[] = [];
  private static assistActive = false;
  private static excludedApps = new Set<string>([
    'com.android.systemui',
    'com.friday.ai',
    // Banking / payment / auth apps are never watched
    'com.phonepe.app',
    'com.google.android.apps.nbu.paisa.user',
    'net.one97.paytm',
    'com.whatsapp',
  ]);

  static async hasPermission(): Promise<boolean> {
    try {
      const result = await ScreenContext.checkUsagePermission();
      return result.granted;
    } catch {
      return false;
    }
  }

  static async openSettings(): Promise<boolean> {
    try {
      await ScreenContext.openUsageSettings();
      return true;
    } catch {
      return false;
    }
  }

  static async getCurrentApp(): Promise<CurrentApp | null> {
    try {
      return await ScreenContext.getCurrentApp();
    } catch {
      return null;
    }
  }

  static async getRecentApps(limit = 10): Promise<CurrentApp[]> {
    try {
      const result = await ScreenContext.getRecentApps({ limit });
      return result.apps;
    } catch {
      return [];
    }
  }

  static async isExcluded(packageName: string): Promise<boolean> {
    try {
      const result = await ScreenContext.isExcludedApp({ package: packageName });
      return result.excluded || this.excludedApps.has(packageName);
    } catch {
      return this.excludedApps.has(packageName);
    }
  }

  static addExcludedApp(packageName: string) {
    this.excludedApps.add(packageName);
  }

  static removeExcludedApp(packageName: string) {
    this.excludedApps.delete(packageName);
  }

  static getExcludedApps(): string[] {
    return Array.from(this.excludedApps);
  }

  static onAppChange(listener: (app: CurrentApp) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  static isAssistEnabled(): boolean {
    try {
      return localStorage.getItem(ASSIST_KEY) === '1';
    } catch {
      return false;
    }
  }

  /** Explicit user opt-in. Starts app polling only after permission check. */
  static async startAssist(intervalMs = 4000): Promise<boolean> {
    const granted = await this.hasPermission();
    if (!granted) return false;
    try { localStorage.setItem(ASSIST_KEY, '1'); } catch {}
    this.assistActive = true;
    this.startPolling(intervalMs);
    return true;
  }

  /** Explicit user opt-out. Stops all polling immediately and clears context. */
  static stopAssist() {
    try { localStorage.setItem(ASSIST_KEY, '0'); } catch {}
    this.assistActive = false;
    this.stopPolling();
    this.lastContext = null;
  }

  static isAssistActive(): boolean {
    return this.assistActive && this.pollingInterval !== null;
  }

  static startPolling(intervalMs = 3000) {
    this.stopPolling();
    this.pollingInterval = setInterval(async () => {
      const app = await this.getCurrentApp();
      if (app && app.package && !this.excludedApps.has(app.package)) {
        if (!this.lastContext || this.lastContext.package !== app.package) {
          this.lastContext = app;
          this.listeners.forEach(l => l(app));
        }
        this.lastContext = app;
      }
    }, intervalMs);
  }

  static stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  static getLastContext(): CurrentApp | null {
    return this.lastContext;
  }
}
