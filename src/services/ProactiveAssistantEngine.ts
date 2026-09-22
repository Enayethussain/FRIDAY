import { ScreenContextService, CurrentApp } from './ScreenContextService';
import { TTSService } from './TTSService';

export interface ProactiveConfig {
  enabled: boolean;
  proactiveVoice: boolean;
  screenAwareness: 'off' | 'app' | 'smart' | 'full';
  cooldownMs: number;
  excludedApps: string[];
  quietHoursStart: number;
  quietHoursEnd: number;
}

export interface ContextState {
  currentApp: CurrentApp | null;
  recentApps: CurrentApp[];
  lastSpokeAt: number;
  lastAppName: string;
  confidence: number;
  isQuiet: boolean;
}

export class ProactiveAssistantEngine {
  private static config: ProactiveConfig = {
    enabled: false,
    proactiveVoice: true,
    screenAwareness: 'off',
    cooldownMs: 30000,
    excludedApps: ['com.android.systemui', 'com.friday.ai'],
    quietHoursStart: 23,
    quietHoursEnd: 7,
  };

  private static state: ContextState = {
    currentApp: null,
    recentApps: [],
    lastSpokeAt: 0,
    lastAppName: '',
    confidence: 0,
    isQuiet: false,
  };

  private static appAnnouncements: Record<string, string> = {
    'com.whatsapp': 'WhatsApp khul gaya.',
    'com.instagram.android': 'Instagram open hai.',
    'org.telegram.messenger': 'Telegram khul gaya.',
    'com.google.android.gm': 'Gmail khul gaya.',
    'com.google.android.youtube': 'YouTube khul gaya.',
    'com.android.chrome': 'Chrome browser khul gaya.',
    'com.google.android.apps.maps': 'Maps khul gaya.',
    'com.android.camera2': 'Camera khul gaya.',
    'com.android.camera': 'Camera khul gaya.',
  };

  private static categoryHelp: Record<string, string> = {
    'messaging': 'Aap message likh rahe hain. Bolein to help kar doon?',
    'social': 'Aap social media dekh rahe hain.',
    'video': 'Aap video dekh rahe hain.',
    'email': 'Aap email check kar rahe hain. Bolein to padhkar samjha doon?',
    'document': 'Aap document padh rahe hain. Bolein to explain kar doon?',
    'browser': 'Aap browsing kar rahe hain. Koi sawaal ho to poochho.',
  };

  static async init() {
    // Subscribe only. Polling starts ONLY after explicit user opt-in via setAssistEnabled(true).
    ScreenContextService.onAppChange((app) => this.onAppChanged(app));
    if (ScreenContextService.isAssistEnabled()) {
      const ok = await ScreenContextService.startAssist(4000);
      if (ok) {
        this.config.enabled = true;
        if (this.config.screenAwareness === 'off') this.config.screenAwareness = 'smart';
      }
    }
  }

  /** Explicit Screen Assist toggle. Stops all watching when turned off. */
  static async setAssistEnabled(on: boolean, mode?: 'app' | 'smart'): Promise<boolean> {
    if (on) {
      const ok = await ScreenContextService.startAssist(4000);
      if (!ok) return false;
      this.config.enabled = true;
      this.config.screenAwareness = mode || (this.config.screenAwareness === 'off' ? 'smart' : this.config.screenAwareness);
      this.state.lastSpokeAt = 0;
      this.state.lastAppName = '';
      return true;
    }
    this.config.enabled = false;
    this.config.screenAwareness = 'off';
    ScreenContextService.stopAssist();
    this.state.currentApp = null;
    this.state.confidence = 0;
    return true;
  }

  static isAssistOn(): boolean {
    return this.config.enabled && ScreenContextService.isAssistActive();
  }

  static getConfig(): ProactiveConfig {
    return { ...this.config };
  }

  static updateConfig(updates: Partial<ProactiveConfig>) {
    this.config = { ...this.config, ...updates };
    if (updates.excludedApps) {
      updates.excludedApps.forEach(app => ScreenContextService.addExcludedApp(app));
    }
  }

  static getState(): ContextState {
    return { ...this.state };
  }

  static getCurrentContext(): string {
    if (!this.state.currentApp) return 'unknown';
    const app = this.state.currentApp;
    return `${app.appName} (${app.category}) - ${app.activity}`;
  }

  private static async onAppChanged(app: CurrentApp) {
    if (!this.config.enabled) return;
    if (this.config.excludedApps.includes(app.package)) return;
    if (this.isQuietHours()) return;

    this.state.currentApp = app;
    this.state.confidence = 0.8;

    // Check cooldown
    const now = Date.now();
    if (now - this.state.lastSpokeAt < this.config.cooldownMs) return;

    // Don't announce same app repeatedly
    if (app.package === this.state.lastAppName) return;

    this.state.lastAppName = app.package;

    if (this.config.proactiveVoice && this.config.screenAwareness !== 'off') {
      const shouldSpeak = this.shouldAnnounce(app);
      if (shouldSpeak) {
        const msg = this.getAnnouncement(app);
        if (msg) {
          this.state.lastSpokeAt = now;
          await TTSService.speak(msg, { lang: 'hi-IN', rate: 1.1 });
        }
      }
    }
  }

  private static shouldAnnounce(app: CurrentApp): boolean {
    // Always announce first time opening a new app
    if (app.package !== this.state.lastAppName) return true;
    // For smart mode, check category changes
    if (this.config.screenAwareness === 'smart') {
      return true;
    }
    return false;
  }

  private static getAnnouncement(app: CurrentApp): string | null {
    // Check for specific app announcements
    if (this.appAnnouncements[app.package]) {
      return this.appAnnouncements[app.package];
    }
    // Check for category-based help
    if (this.config.screenAwareness === 'smart' && this.categoryHelp[app.category]) {
      return `Sir, ${this.categoryHelp[app.category]}`;
    }
    // For app mode, just announce the app name
    if (this.config.screenAwareness === 'app') {
      return `${app.appName} khul gaya.`;
    }
    return null;
  }

  private static isQuietHours(): boolean {
    const hour = new Date().getHours();
    if (this.config.quietHoursStart > this.config.quietHoursEnd) {
      return hour >= this.config.quietHoursStart || hour < this.config.quietHoursEnd;
    }
    return hour >= this.config.quietHoursStart && hour < this.config.quietHoursEnd;
  }

  static async handleCommand(command: string): Promise<string | null> {
    const lower = command.toLowerCase();

    if (lower.includes('kya kar raha hoon') || lower.includes('what am i doing') || lower.includes('main kya dekh')) {
      const ctx = this.state.currentApp;
      if (!ctx) return 'Sir, mujhe current screen ka context nahi mil raha.';
      return `Sir, aap ${ctx.appName} use kar rahe hain. ${ctx.category === 'messaging' ? 'Lag raha hai message likh rahe hain.' : ctx.category === 'video' ? 'Video dekh rahe hain.' : ''}`;
    }

    if (lower.includes('screen') && (lower.includes('kya') || lower.includes('context') || lower.includes('status'))) {
      const ctx = this.state.currentApp;
      if (!ctx) return 'Screen context available nahi hai.';
      return `Current: ${ctx.appName}, Category: ${ctx.category}, Activity: ${ctx.activity}`;
    }

    return null;
  }
}
