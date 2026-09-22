import { registerPlugin } from '@capacitor/core';
import {
  ActionResult, actionFail, actionOk, classifyNativeError, fromVerification, withTimeout,
} from './ActionResult';

export interface AppInfo {
  name: string;
  packageName: string;
  system: boolean;
}

export interface LaunchNativeResult {
  launched: boolean;
  verified?: boolean;
  packageName?: string;
  currentPackage?: string;
  verifyReason?: string;
}

export interface AppLauncherPluginInterface {
  launchApp(options: { packageName?: string; appName?: string; verify?: boolean; verifyTimeoutMs?: number }): Promise<LaunchNativeResult>;
  getInstalledApps(): Promise<{ apps: AppInfo[] }>;
  searchApps(options: { query: string }): Promise<{ apps: AppInfo[] }>;
  openUrl(options: { url: string }): Promise<{ opened: string }>;
  goHome(): Promise<{ home: boolean; verified?: boolean; currentPackage?: string }>;
  openWhatsAppChat(options: { phone?: string; message?: string }): Promise<LaunchNativeResult>;
  openInstagram(options: { section?: string }): Promise<LaunchNativeResult & { section?: string; openedSection?: string }>;
  openTelegram(options: { username?: string }): Promise<{ launched: boolean }>;
  openGmail(): Promise<{ launched: boolean }>;
  openYouTube(options?: { query?: string }): Promise<{ launched: boolean }>;
  openFacebook(): Promise<{ launched: boolean }>;
  openMaps(): Promise<{ launched: boolean }>;
  openSpotify(): Promise<{ launched: boolean }>;
  openCamera(options?: Record<string, never>): Promise<{ launched: boolean }>;
}

const AppLauncher = registerPlugin<AppLauncherPluginInterface>('AppLauncher');

const LAUNCH_TIMEOUT_MS = 9000;
const QUICK_TIMEOUT_MS = 6000;

export class AppLauncherService {
  static APP_MAP: Record<string, string> = {
    'whatsapp': 'com.whatsapp',
    'instagram': 'com.instagram.android',
    'telegram': 'org.telegram.messenger',
    'youtube': 'com.google.android.youtube',
    'gmail': 'com.google.android.gm',
    'chrome': 'com.android.chrome',
    'maps': 'com.google.android.apps.maps',
    'camera': 'com.android.camera2',
    'settings': 'com.android.settings',
    'files': 'com.google.android.apps.nbu.files',
    'calendar': 'com.google.android.calendar',
    'clock': 'com.google.android.deskclock',
    'calculator': 'com.google.android.calculator',
    'photos': 'com.google.android.apps.photos',
    'music': 'com.google.android.apps.music',
    'play store': 'com.android.vending',
    'facebook': 'com.facebook.katana',
    'twitter': 'com.twitter.android',
    'snapchat': 'com.snapchat.android',
    'spotify': 'com.spotify.music',
    'netflix': 'com.netflix.mediaclient',
    'discord': 'com.discord',
  };

  private static resolvePackage(name: string): string | null {
    if (name.includes('.')) return name;
    return AppLauncherService.APP_MAP[name.toLowerCase()] ?? null;
  }

  /** Open an app by package or friendly name. SUCCESS only if the app is actually foreground. */
  static async launchApp(packageNameOrName: string): Promise<ActionResult> {
    const started = Date.now();
    const lat = () => Date.now() - started;
    try {
      const pkg = AppLauncherService.resolvePackage(packageNameOrName);
      let targetPkg = pkg;
      if (!pkg) {
        // Unknown name: search installed apps first (honest NOT_FOUND when absent).
        const found = await withTimeout('open_app', packageNameOrName, AppLauncher.searchApps({ query: packageNameOrName }), QUICK_TIMEOUT_MS);
        if (!found.apps || found.apps.length === 0) {
          return actionFail('FAILED', 'open_app', packageNameOrName, `${packageNameOrName} naam ka app phone me mila nahi.`, lat());
        }
        targetPkg = found.apps[0].packageName;
      }
      const res = await withTimeout('open_app', targetPkg!, AppLauncher.launchApp({ packageName: targetPkg!, verify: true }), LAUNCH_TIMEOUT_MS);
      return fromVerification('open_app', packageNameOrName, res.launched, res.verified === true, res.verifyReason, res.currentPackage, lat());
    } catch (e) {
      return classifyNativeError('open_app', packageNameOrName, e, lat());
    }
  }

  static async searchApps(query: string): Promise<AppInfo[]> {
    try {
      const result = await withTimeout('search_apps', query, AppLauncher.searchApps({ query }), QUICK_TIMEOUT_MS);
      return result.apps ?? [];
    } catch {
      return [];
    }
  }

  static async getInstalledApps(): Promise<AppInfo[]> {
    try {
      const result = await withTimeout('list_apps', 'apps', AppLauncher.getInstalledApps(), QUICK_TIMEOUT_MS);
      return result.apps ?? [];
    } catch {
      return [];
    }
  }

  static async openUrl(url: string): Promise<ActionResult> {
    const started = Date.now();
    try {
      await withTimeout('open_url', url, AppLauncher.openUrl({ url }), QUICK_TIMEOUT_MS);
      return actionOk('open_url', url, 'Link khol diya.', Date.now() - started);
    } catch (e) {
      return classifyNativeError('open_url', url, e, Date.now() - started);
    }
  }

  static async goHome(): Promise<ActionResult> {
    const started = Date.now();
    try {
      const res = await withTimeout('go_home', 'home', AppLauncher.goHome(), QUICK_TIMEOUT_MS);
      if (res.verified) return actionOk('go_home', 'home', 'Home screen par aa gaye.', Date.now() - started);
      return actionFail('VERIFICATION_FAILED', 'go_home', 'home', 'Home command bheja, par screen verify nahi ho payi.', Date.now() - started);
    } catch (e) {
      return classifyNativeError('go_home', 'home', e, Date.now() - started);
    }
  }

  /**
   * Opens a WhatsApp chat (optionally pre-filled). The chat screen opening
   * is verified — but the message is NOT auto-sent, and we never claim it was.
   */
  static async openWhatsApp(phone?: string, message?: string): Promise<ActionResult> {
    const started = Date.now();
    const lat = () => Date.now() - started;
    try {
      const res = await withTimeout('open_whatsapp', 'WhatsApp', AppLauncher.openWhatsAppChat({ phone, message }), LAUNCH_TIMEOUT_MS);
      const r = fromVerification('open_whatsapp', 'WhatsApp', res.launched, res.verified === true, res.verifyReason, res.currentPackage, lat());
      if (r.status === 'SUCCESS' && message) {
        return actionOk('open_whatsapp', 'WhatsApp', 'WhatsApp chat khol diya. Message type hai — send tumhe dabana hoga.', lat());
      }
      return r;
    } catch (e) {
      return classifyNativeError('open_whatsapp', 'WhatsApp', e, lat());
    }
  }

  static async openInstagram(section?: string): Promise<ActionResult> {
    const started = Date.now();
    const lat = () => Date.now() - started;
    const sec = section || 'main';
    try {
      const res = await withTimeout('open_instagram', 'Instagram', AppLauncher.openInstagram({ section: sec }), LAUNCH_TIMEOUT_MS);
      const base = fromVerification('open_instagram', 'Instagram', res.launched, res.verified === true, res.verifyReason, res.currentPackage, lat());
      if (base.status !== 'SUCCESS') return base;
      // Honest section: deep link may have fallen back to main feed.
      if (res.openedSection && res.openedSection !== sec && res.openedSection === 'main-fallback') {
        return actionOk('open_instagram', 'Instagram', `Instagram khul gaya, par ${sec} section nahi khula — main feed dikh raha hai.`, lat());
      }
      return actionOk('open_instagram', 'Instagram', sec === 'main' ? 'Instagram khol diya.' : `Instagram ${sec} khol diya.`, lat());
    } catch (e) {
      return classifyNativeError('open_instagram', 'Instagram', e, lat());
    }
  }

  /** Package openers below verify via foreground check through launchApp(). */
  static async openTelegram(username?: string): Promise<ActionResult> {
    void username;
    return AppLauncherService.launchApp('org.telegram.messenger');
  }
  static async openGmail(): Promise<ActionResult> {
    return AppLauncherService.launchApp('com.google.android.gm');
  }
  static async openYouTube(): Promise<ActionResult> {
    return AppLauncherService.launchApp('com.google.android.youtube');
  }
  static async openFacebook(): Promise<ActionResult> {
    return AppLauncherService.launchApp('com.facebook.katana');
  }
  static async openMaps(): Promise<ActionResult> {
    return AppLauncherService.launchApp('com.google.android.apps.maps');
  }
  static async openSpotify(): Promise<ActionResult> {
    return AppLauncherService.launchApp('com.spotify.music');
  }
  static async openCamera(): Promise<ActionResult> {
    const started = Date.now();
    try {
      const res = await withTimeout('open_camera', 'Camera', AppLauncher.openCamera({}), QUICK_TIMEOUT_MS);
      if (res.launched) return actionOk('open_camera', 'Camera', 'Camera khol diya.', Date.now() - started);
      return actionFail('FAILED', 'open_camera', 'Camera', 'Camera kholne me fail hua.', Date.now() - started);
    } catch (e) {
      return classifyNativeError('open_camera', 'Camera', e, Date.now() - started);
    }
  }
}
