import { PhoneService, PhoneContact } from './PhoneService';
import { DeviceControlService } from './DeviceControlService';
import { AppLauncherService } from './AppLauncherService';
import { PcBridgeService } from './PcBridgeService';
import { NotificationReaderService, NotificationData } from './NotificationReaderService';
import { TTSService } from './TTSService';
import { FridayLogger } from './FridayLogger';
import { globalTranscriptManager } from './TranscriptManager';
import { globalAuthManager } from './AuthManager';
import { parseVoiceSwitchCommand } from './DualVoiceManager';
import type { ActionResult } from './ActionResult';

export type CommandIntent =
  | 'call' | 'sms' | 'read_sms' | 'whatsapp' | 'whatsapp_message' | 'whatsapp_reels'
  | 'instagram' | 'instagram_reels' | 'instagram_messages'
  | 'notification_read' | 'notification_summary'
  | 'flashlight' | 'volume_up' | 'volume_down' | 'volume_set' | 'mute' | 'unmute'
  | 'brightness_up' | 'brightness_down' | 'brightness_set'
  | 'bluetooth_toggle' | 'bluetooth_status'
  | 'lock_screen' | 'wake_screen'
  | 'open_app' | 'open_settings' | 'go_home' | 'screenshot'
  | 'youtube' | 'website' | 'datetime'
  | 'gesture_mode' | 'pc_lock' | 'pc_shutdown' | 'pc_restart' | 'pc_sleep' | 'pc_cancel_shutdown'
  | 'pc_volume_up' | 'pc_volume_down' | 'pc_mute' | 'pc_zoom'
  | 'read_pdf' | 'explain_pdf' | 'file_search' | 'file_list'
  | 'weather' | 'search' | 'explain' | 'translate' | 'summarize'
  | 'camera_capture' | 'camera_open'
  | 'timer' | 'reminder'
  | 'open_share' | 'share_scan' | 'share_send' | 'share_cancel' | 'share_accept' | 'share_reject'
  | 'voice_switch' | 'unknown';

export interface ParsedCommand {
  intent: CommandIntent;
  rawText: string;
  contactName?: string;
  message?: string;
  appName?: string;
  setting?: string;
  number?: number;
  fileQuery?: string;
  language?: string;
  parameters: Record<string, string>;
  requiresAuth: boolean;
  requiresConfirmation: boolean;
}

export interface CommandResult {
  success: boolean;
  message: string;
  voiceResponse: string;
  data?: any;
}

export class CommandEngine {
  private static pendingConfirmation: { command: ParsedCommand; resolve: (confirm: boolean) => void } | null = null;

  /**
   * Split a spoken utterance into individual commands.
   * Handles English + Hindi/Hinglish conjunctions: "aur", "or", "then",
   * "phir", "fir", "uske baad", "ke baad", "tथा"? plus ";" and ",".
   * Never returns empty parts. Each part keeps its own raw text for honest reporting.
   */
  static splitCommands(text: string): string[] {
    const cleaned = (text || '').trim();
    if (!cleaned) return [];
    // Split on conjunctions with word boundaries (case-insensitive).
    const parts = cleaned
      .split(/\s*(?:;|\b(?:aur|or|and then|then|phir|fir|uske\s+baad|ke\s+baad|iske\s+baad|and)\b)\s*/gi)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    return parts.length ? parts : [cleaned];
  }

  /** Parse every sub-command in a multi-command utterance. */
  static parseMultiple(text: string): ParsedCommand[] {
    return this.splitCommands(text).map((part) => this.parse(part));
  }

  /**
   * Execute every sub-command sequentially and report each result honestly.
   * Returns per-command results; callers should speak the joined voiceResponses.
   * A failure in one command does NOT fake success for the others.
   */
  static async executeMultiple(text: string): Promise<CommandResult[]> {
    const cmds = this.parseMultiple(text);
    const results: CommandResult[] = [];
    for (const cmd of cmds) {
      try {
        results.push(await this.execute(cmd));
      } catch (e: any) {
        results.push({
          success: false,
          message: e?.message || 'Command failed',
          voiceResponse: 'Sir, ek command me error aa gaya.',
        });
      }
    }
    return results;
  }

  /** Detect user's language for response matching: 'hi' | 'hinglish' | 'en'. */
  static detectLanguage(text: string): 'hi' | 'hinglish' | 'en' {
    const t = text || '';
    if (/[\u0900-\u097F]/.test(t)) {
      // Devanagari present — if also has latin words, it's Hinglish.
      return /[a-zA-Z]/.test(t) ? 'hinglish' : 'hi';
    }
    const hinglishHints = ['kholo', 'khol', 'batao', 'karo', 'lagao', 'bhejo', 'padho', 'samjhao', 'matlab', 'kya', 'kaise', 'mujhe', 'meri', 'mera', 'aur', 'phir', 'waala', 'walla', 'chalu', 'band', 'tez', 'kam', 'zyada', 'badhado', 'ghatao', 'awaz', 'mausam', 'khojo'];
    const lower = t.toLowerCase();
    if (hinglishHints.some((h) => lower.includes(h))) return 'hinglish';
    return 'en';
  }

  static parse(text: string): ParsedCommand {
    // VOICE-SWITCH FIRST: explicit "activate/switch to Jarvis/Friday" changes
    // the real TTS voice and must never run as another unrelated command.
    // "Friday open YouTube" has no switch verb -> falls through to normal parse.
    const switchTarget = parseVoiceSwitchCommand(text);
    if (switchTarget) {
      return { intent: 'voice_switch', rawText: text, parameters: { target: switchTarget }, requiresAuth: false, requiresConfirmation: false };
    }
    // Strip a leading wake-word ("friday", "hey friday", "jarvis"...) so
    // "Friday YouTube kholo" parses as the real command, not unknown.
    const stripped = text.replace(/^\s*(hey\s+)?(friday|jarvis|myraa)[,\s]+/i, '').trim() || text;
    const lower = stripped.toLowerCase().trim();
    const rawForExtract = stripped;
    const params: Record<string, string> = {};

    // FRIDAY Share FIRST — specific phrases must win over generic matchers
    // ('open share' vs open_app, 'send this file to my phone' vs call, etc.)
    if (this.matchAny(lower, ['open share', 'share kholo', 'share open karo', 'friday share'])) {
      return { intent: 'open_share', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['find nearby', 'nearby devices', 'nearby dikhao', 'devices dhoondo', 'aas paas', 'show nearby', 'scan devices'])) {
      return { intent: 'share_scan', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['cancel transfer', 'transfer cancel', 'stop sharing', 'sharing band', 'transfer roko'])) {
      return { intent: 'share_cancel', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['accept the transfer', 'transfer accept', 'accept karo', 'accept transfer'])) {
      return { intent: 'share_accept', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['reject the transfer', 'transfer reject', 'reject karo', 'reject transfer', 'transfer mana karo'])) {
      return { intent: 'share_reject', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['send this file', 'send this to', 'share these files', 'share this file', 'file bhejo', 'ye file bhejo', 'phone ko bhejo', 'pc ko bhejo'])) {
      return { intent: 'share_send', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Date / time (English + Hindi/Hinglish) — always answerable locally.
    if (this.matchAny(lower, ['time batao', 'time kya', 'kitne baje', 'samay kya', 'what time', 'current time', 'time kya hai', 'date batao', 'date kya', 'aaj kaunsi date', 'aaj konsi date', 'aaj kya date', 'what date', 'today date', 'aaj ka din', 'kaunsa din', 'konsa din', 'what day'])) {
      return { intent: 'datetime', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // YouTube (English + Hindi/Hinglish verbs) — must actually open YouTube.
    if (lower.includes('youtube') || lower.includes('you tube') || lower.includes('yt ')) {
      // "youtube pe <query> chalao/search/kholo" -> query preserved for honest open.
      const q = this.extractAfter(rawForExtract, ['youtube pe', 'youtube par', 'youtube me', 'youtube mein', 'on youtube'])?.trim()
        || this.extractAfter(rawForExtract, ['search karo', 'search kar', 'chalao', 'chalado', 'play karo', 'play kar', 'kholo', 'khol'])?.trim();
      if (q) params['query'] = q;
      return { intent: 'youtube', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Generic website open ("<site> kholo", "open <site>.com")
    if (this.matchAny(lower, ['.com', '.in', '.org', '.net', 'website kholo', 'site kholo', 'web kholo', 'browser me kholo', 'chrome me kholo'])) {
      const site = this.extractAfter(rawForExtract, ['kholo', 'khol', 'open', 'launch'])?.trim() || rawForExtract.trim();
      if (site) params['site'] = site;
      return { intent: 'website', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Call commands
    if (this.matchAny(lower, ['call', 'phone', 'phone lagao', 'call karo', 'phone karo'])) {
      const contact = this.extractNameAfter(text, ['call', 'phone', 'ko phone', 'ko call']);
      return { intent: 'call', rawText: text, contactName: contact, parameters: params, requiresAuth: true, requiresConfirmation: true };
    }

    // SMS commands
    if (this.matchAny(lower, ['sms', 'text message', 'message bhejo', 'sms bhejo', 'message send'])) {
      const contact = this.extractNameAfter(text, ['sms', 'message', 'ko message', 'ko sms']);
      const message = this.extractAfter(text, ['bhejo', 'send', 'ki', 'mein', 'that']);
      return { intent: 'sms', rawText: text, contactName: contact, message, parameters: params, requiresAuth: true, requiresConfirmation: true };
    }

    // Read SMS
    if (this.matchAny(lower, ['read sms', 'read message', 'message padho', 'sms padho', 'kya message aaya', 'messages batao', 'recent messages', 'kya aaya hai'])) {
      const contact = this.extractNameAfter(text, ['of', 'from', 'ka', 'ki', 'ke']);
      return { intent: 'read_sms', rawText: text, contactName: contact, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // WhatsApp message
    if (this.matchAny(lower, ['whatsapp', 'whats app'])) {
      if (this.matchAny(lower, ['reels', 'reel'])) {
        return { intent: 'whatsapp_reels', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
      }
      if (this.matchAny(lower, ['message', 'bhejo', 'send', 'reply', 'karo', 'ki'])) {
        const contact = this.extractNameAfter(text, ['whatsapp', 'ko whatsapp']);
        const message = this.extractAfter(text, ['bhejo', 'send', 'ki', 'mein', 'that', 'reply', 'karo ki']);
        return { intent: 'whatsapp_message', rawText: text, contactName: contact, message, parameters: params, requiresAuth: true, requiresConfirmation: true };
      }
      if (this.matchAny(lower, ['open', 'kholo'])) {
        return { intent: 'open_app', rawText: text, appName: 'whatsapp', parameters: params, requiresAuth: false, requiresConfirmation: false };
      }
      return { intent: 'whatsapp', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Instagram
    if (this.matchAny(lower, ['instagram', 'insta'])) {
      if (this.matchAny(lower, ['reels', 'reel'])) {
        return { intent: 'instagram_reels', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
      }
      if (this.matchAny(lower, ['message', 'dm', 'inbox'])) {
        return { intent: 'instagram_messages', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
      }
      if (this.matchAny(lower, ['open', 'kholo'])) {
        return { intent: 'open_app', rawText: text, appName: 'instagram', parameters: params, requiresAuth: false, requiresConfirmation: false };
      }
      return { intent: 'instagram', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Notification commands
    if (this.matchAny(lower, ['notification', 'notifications', 'notify'])) {
      if (this.matchAny(lower, ['read', 'padho', 'batao', 'kya aaya', 'summary'])) {
        return { intent: 'notification_summary', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
      }
      return { intent: 'notification_read', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Flashlight
    if (this.matchAny(lower, ['flashlight', 'torch', 'light on', 'light off', 'flashlight on', 'flashlight off', 'light toggle'])) {
      return { intent: 'flashlight', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Mute / unmute (ringer mode — real, verified)
    if (this.matchAny(lower, ['mute kar', 'silent kar', 'mute mode', 'silent mode', 'phone silent', 'mute phone', 'silent phone', 'awaz band'])) {
      return { intent: 'mute', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['unmute', 'silent off', 'mute off', 'ringer on', 'sound on kar', 'awaz chalu'])) {
      return { intent: 'unmute', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    // Screenshot — Android allows no silent screenshot API; be honest.
    if (this.matchAny(lower, ['screenshot', 'screen shot', 'screen capture'])) {
      return { intent: 'screenshot', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    // Volume
    if (this.matchAny(lower, ['volume up', 'volume badhao', 'volume badao', 'volume increase', 'awaz badhao', 'awaz badao', 'awaz tez', 'volume tez', 'badhado volume'])) {
      return { intent: 'volume_up', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['volume down', 'volume ghatao', 'volume decrease', 'awaz kam karo', 'volume kam', 'awaz kam', 'awaz dheemi', 'volume dheema'])) {
      return { intent: 'volume_down', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['volume set', 'volume level', 'set volume'])) {
      const num = this.extractNumber(text);
      return { intent: 'volume_set', rawText: text, number: num, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Brightness (English + Hindi/Hinglish)
    if (this.matchAny(lower, ['brightness up', 'screen bright', 'brightness badhao', 'brightness badao', 'screen light', 'brightness tez', 'light badhao', 'roshni badhao', 'brightness zyada'])) {
      return { intent: 'brightness_up', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['brightness down', 'screen dim', 'brightness ghatao', 'brightness kam', 'screen dark', 'screen kam', 'light kam', 'roshni kam', 'brightness low', 'brightness dheemi'])) {
      return { intent: 'brightness_down', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Bluetooth
    if (this.matchAny(lower, ['bluetooth on', 'bluetooth off', 'bluetooth toggle', 'bluetooth enable', 'bluetooth disable'])) {
      return { intent: 'bluetooth_toggle', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['bluetooth status', 'bluetooth check'])) {
      return { intent: 'bluetooth_status', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // PC power (destructive ones always confirm; lock is instant via Windows)
    if (this.matchAny(lower, ['pc shutdown', 'computer shutdown', 'shutdown pc', 'shut down pc', 'pc band karo'])) {
      return { intent: 'pc_shutdown', rawText: text, parameters: params, requiresAuth: true, requiresConfirmation: true };
    }
    if (this.matchAny(lower, ['pc restart', 'computer restart', 'restart pc', 'reboot pc', 'pc reboot'])) {
      return { intent: 'pc_restart', rawText: text, parameters: params, requiresAuth: true, requiresConfirmation: true };
    }
    if (this.matchAny(lower, ['pc sleep', 'computer sleep', 'sleep pc', 'pc sulao', 'suspend pc'])) {
      return { intent: 'pc_sleep', rawText: text, parameters: params, requiresAuth: true, requiresConfirmation: true };
    }
    if (this.matchAny(lower, ['cancel shutdown', 'shutdown cancel', 'abort shutdown'])) {
      return { intent: 'pc_cancel_shutdown', rawText: text, parameters: params, requiresAuth: true, requiresConfirmation: false };
    }
    // PC volume (explicitly PC-qualified; bare "volume up" stays phone legacy)
    if (this.matchAny(lower, ['pc volume up', 'computer volume up', 'pc awaz badhao'])) {
      return { intent: 'pc_volume_up', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['pc volume down', 'computer volume down', 'pc awaz kam'])) {
      return { intent: 'pc_volume_down', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['pc mute', 'computer mute', 'pc silent', 'pc unmute', 'computer unmute'])) {
      return { intent: 'pc_mute', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    // PC document zoom (sends real keys to the active app; honest about scope)
    if (this.matchAny(lower, ['pc zoom in', 'computer zoom in', 'zoom in pc'])) {
      return { intent: 'pc_zoom', rawText: text, number: 1, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['pc zoom out', 'computer zoom out', 'zoom out pc'])) {
      return { intent: 'pc_zoom', rawText: text, number: -1, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    // Gesture modes (voice switching; the engine + UI confirm the switch)
    if (this.matchAny(lower, ['cursor mode', 'mouse mode'])) {
      return { intent: 'gesture_mode', rawText: text, appName: 'CURSOR', parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['orb mode'])) {
      return { intent: 'gesture_mode', rawText: text, appName: 'ORB', parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['file transfer mode', 'transfer mode'])) {
      return { intent: 'gesture_mode', rawText: text, appName: 'FILE_TRANSFER', parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['document mode'])) {
      return { intent: 'gesture_mode', rawText: text, appName: 'DOCUMENT', parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['presentation mode'])) {
      return { intent: 'gesture_mode', rawText: text, appName: 'PRESENTATION', parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['volume mode', 'brightness mode', 'general mode', 'normal mode'])) {
      const m = lower.includes('volume') ? 'VOLUME' : lower.includes('bright') ? 'BRIGHTNESS' : 'GENERAL';
      return { intent: 'gesture_mode', rawText: text, appName: m, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['lock', 'lock kar', 'screen lock', 'phone lock'])) {
      // "pc lock / computer lock" targets Windows; plain "lock" stays phone (legacy).
      if (this.matchAny(lower, ['pc lock', 'computer lock', 'windows lock', 'laptop lock'])) {
        return { intent: 'pc_lock', rawText: text, parameters: params, requiresAuth: true, requiresConfirmation: false };
      }
      return { intent: 'lock_screen', rawText: text, parameters: params, requiresAuth: true, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['wake', 'screen on', 'wake up', 'jagao'])) {
      return { intent: 'wake_screen', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Settings
    if (this.matchAny(lower, ['open settings', 'settings kholo', 'setting kholo'])) {
      const setting = this.extractSettingType(text);
      return { intent: 'open_settings', rawText: text, setting, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Go home
    if (this.matchAny(lower, ['go home', 'home', 'home screen', 'home pe jao'])) {
      return { intent: 'go_home', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Open app (English + Hinglish verbs)
    if (this.matchAny(lower, ['open', 'kholo', 'khol', 'launch', 'chalu karo', 'chalu kar', 'start karo', 'open karo'])) {
      const app = this.extractAppName(text);
      if (app) {
        return { intent: 'open_app', rawText: text, appName: app, parameters: params, requiresAuth: false, requiresConfirmation: false };
      }
    }

    // File commands
    if (this.matchAny(lower, ['file', 'folder', 'pdf', 'document', 'download'])) {
      return { intent: 'file_search', rawText: text, fileQuery: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Camera
    if (this.matchAny(lower, ['camera', 'photo', 'picture', 'snap', 'capture'])) {
      return { intent: 'camera_open', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Timer
    if (this.matchAny(lower, ['timer', 'countdown', 'set timer'])) {
      const num = this.extractNumber(text);
      return { intent: 'timer', rawText: text, number: num, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // AI commands - explain, translate, summarize, search
    if (this.matchAny(lower, ['explain', 'samjhao', 'samjha', 'meaning', 'matlab', 'kya hai'])) {
      return { intent: 'explain', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['translate', 'anuvad', 'translate karo'])) {
      return { intent: 'translate', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['summarize', 'summary', 'short me batao', 'brief'])) {
      return { intent: 'summarize', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }
    if (this.matchAny(lower, ['search', 'google', 'khojo', 'search karo', 'find'])) {
      return { intent: 'search', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    // Weather
    if (this.matchAny(lower, ['weather', 'mausam', 'temperature', 'forecast'])) {
      return { intent: 'weather', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
    }

    return { intent: 'unknown', rawText: text, parameters: params, requiresAuth: false, requiresConfirmation: false };
  }

  static async execute(command: ParsedCommand): Promise<CommandResult> {
    FridayLogger.info('Action', `COMMAND_RECEIVED intent=${command.intent} text="${command.rawText.slice(0, 80)}"`);
    try { globalTranscriptManager.addEntry('user', command.rawText); } catch { /* HUD feed only */ }
    const started = Date.now();
    const res = await this.dispatch(command);
    FridayLogger.info('Action', `${res.success ? 'ACTION_SUCCESS' : 'ACTION_FAILED'} intent=${command.intent} msg="${res.message.slice(0, 120)}" in=${Date.now() - started}ms`);
    try { globalTranscriptManager.addEntry('jarvis', res.voiceResponse || res.message); } catch { /* HUD feed only */ }
    return res;
  }

  /** Map a verified ActionResult to a user-facing result. Never invents success. */
  private static fromAction(r: ActionResult, successVoice?: string): CommandResult {
    switch (r.status) {
      case 'SUCCESS':
        return { success: true, message: r.message, voiceResponse: successVoice ?? r.message };
      case 'TIMEOUT':
        return { success: false, message: r.message, voiceResponse: 'Sir, phone se response nahi mila. Dobara try karo.' };
      case 'PERMISSION_REQUIRED':
        return { success: false, message: r.message, voiceResponse: `Sir, permission chahiye. ${r.message}` };
      case 'DEVICE_OFFLINE':
        return { success: false, message: r.message, voiceResponse: 'Sir, phone abhi offline hai.' };
      case 'NOT_SUPPORTED':
      case 'VERIFICATION_FAILED':
      case 'FAILED':
      default:
        return { success: false, message: r.message, voiceResponse: `Sir, ${r.message}` };
    }
  }

  private static async dispatch(command: ParsedCommand): Promise<CommandResult> {
    // Auth check
    if (command.requiresAuth) {
      const isAuth = globalAuthManager.getProfile().isAuthenticated;
      if (!isAuth) {
        return { success: false, message: 'Authorization required', voiceResponse: 'Sir, pehle authenticate ho jao.' };
      }
    }

    // Confirmation check
    if (command.requiresConfirmation) {
      const confirmed = await this.requestConfirmation(command);
      if (!confirmed) {
        return { success: false, message: 'Cancelled by user', voiceResponse: 'Theek hai, cancel kar diya.' };
      }
    }

    try {
      switch (command.intent) {
        case 'call': return this.executeCall(command);
        case 'sms': return this.executeSms(command);
        case 'read_sms': return this.executeReadSms(command);
        case 'whatsapp': return this.executeOpenWhatsApp(command);
        case 'whatsapp_message': return this.executeWhatsAppMessage(command);
        case 'whatsapp_reels': return this.executeWhatsAppReels();
        case 'instagram': return this.executeOpenInstagram(command);
        case 'instagram_reels': return this.executeInstagramReels();
        case 'instagram_messages': return this.executeInstagramMessages();
        case 'notification_read':
        case 'notification_summary': return this.executeNotificationSummary(command);
        case 'flashlight': return this.executeFlashlight(command);
        case 'volume_up': return this.executeVolumeUp();
        case 'volume_down': return this.executeVolumeDown();
        case 'volume_set': return this.executeVolumeSet(command);
        case 'mute': return this.executeMute();
        case 'unmute': return this.executeUnmute();
        case 'screenshot': return this.executeScreenshot();
        case 'brightness_up': return this.executeBrightnessUp();
        case 'brightness_down': return this.executeBrightnessDown();
        case 'bluetooth_toggle': return this.executeBluetoothToggle();
        case 'bluetooth_status': return this.executeBluetoothStatus();
        case 'lock_screen': return this.executeLockScreen();
        case 'wake_screen': return this.executeWakeScreen();
        case 'open_settings': return this.executeOpenSettings(command);
        case 'go_home': return this.executeGoHome();
        case 'open_app': return this.executeOpenApp(command);
        case 'youtube': return this.executeYouTube(command);
        case 'website': return this.executeWebsite(command);
        case 'datetime': return this.executeDateTime(command);
        case 'camera_open': return this.executeCameraOpen();
        case 'gesture_mode': return this.executeGestureMode(command);
        case 'pc_lock': return this.executePcLock();
        case 'pc_shutdown': return this.executePcPower('shutdown');
        case 'pc_restart': return this.executePcPower('restart');
        case 'pc_sleep': return this.executePcPower('sleep');
        case 'pc_cancel_shutdown': return this.executePcPower('cancel');
        case 'pc_volume_up': return this.executePcVolume('up');
        case 'pc_volume_down': return this.executePcVolume('down');
        case 'pc_mute': return this.executePcVolume('mute');
        case 'pc_zoom': return this.executePcZoom(command);
        case 'timer': return this.executeTimer(command);
        case 'explain':
        case 'translate':
        case 'summarize':
        case 'search':
          return this.executeAICommand(command);
        case 'weather': return this.executeWeather();
        case 'open_share': return this.executeOpenShare();
        case 'share_scan': return this.executeShareScan();
        case 'share_send': return this.executeShareSend();
        case 'share_cancel': return this.executeShareCancel();
        case 'share_accept': return this.executeShareAcceptReject(true);
        case 'share_reject': return this.executeShareAcceptReject(false);
        case 'voice_switch': return this.executeVoiceSwitch(command);
        default:
          return { success: false, message: 'Command not understood', voiceResponse: 'Sir, ye command samajh nahi aaya. Dobara bolo.' };
      }
    } catch (e: any) {
      return { success: false, message: e.message || 'Command failed', voiceResponse: `Sir, error aa gaya: ${e.message || 'unknown error'}` };
    }
  }

  private static async executeCall(cmd: ParsedCommand): Promise<CommandResult> {
    if (!cmd.contactName) {
      return { success: false, message: 'Contact name needed', voiceResponse: 'Sir, kisko call karna hai? Naam batao.' };
    }
    const contact = await PhoneService.findContactOrReject(cmd.contactName);
    const r = await PhoneService.makeCall(contact.number);
    if (r.status === 'SUCCESS' && (r.data as { dialed?: boolean } | undefined)?.dialed) {
      return { success: true, message: `Dialer opened for ${contact.name}`, voiceResponse: `${contact.name} ka number dialer me khol diya. Green button dabao.` };
    }
    return this.fromAction(r, `${contact.name} ko call laga raha hoon.`);
  }

  private static async executeSms(cmd: ParsedCommand): Promise<CommandResult> {
    if (!cmd.contactName) return { success: false, message: 'Contact needed', voiceResponse: 'Kisko SMS bhejna hai?' };
    if (!cmd.message) return { success: false, message: 'Message needed', voiceResponse: 'Kya likhe SMS me?' };
    const contact = await PhoneService.findContactOrReject(cmd.contactName);
    const r = await PhoneService.sendSms(contact.number, cmd.message);
    return this.fromAction(r, `${contact.name} ko SMS bhej diya.`);
  }

  private static async executeReadSms(cmd: ParsedCommand): Promise<CommandResult> {
    const messages = await PhoneService.getRecentSms(10, cmd.contactName);
    if (messages.length === 0) {
      return { success: true, message: 'No messages found', voiceResponse: 'Sir, koi message nahi mila.' };
    }
    const summary = messages.slice(0, 5).map(m => `From ${m.address}: ${m.body.substring(0, 100)}`).join('\n');
    return { success: true, message: `Found ${messages.length} messages`, voiceResponse: `Sir, ${messages.length} messages hain. Recent: ${messages[0]?.body?.substring(0, 80) || 'empty'}`, data: messages };
  }

  private static async executeOpenWhatsApp(cmd: ParsedCommand): Promise<CommandResult> {
    const r = await AppLauncherService.launchApp('com.whatsapp');
    return this.fromAction(r, 'WhatsApp khol diya.');
  }

  private static async executeWhatsAppMessage(cmd: ParsedCommand): Promise<CommandResult> {
    if (!cmd.contactName) return { success: false, message: 'Contact needed', voiceResponse: 'Kisko WhatsApp karna hai?' };
    if (cmd.message) {
      const r = await AppLauncherService.openWhatsApp(undefined, cmd.message);
      // openWhatsApp never claims the message was sent — only the chat opened.
      return this.fromAction(r);
    }
    const opened = await AppLauncherService.launchApp('com.whatsapp');
    if (opened.status === 'SUCCESS') return { success: true, message: 'WhatsApp opened', voiceResponse: 'WhatsApp khol diya. Message khud type karna hoga.' };
    return this.fromAction(opened);
  }

  private static async executeWhatsAppReels(): Promise<CommandResult> {
    const r = await AppLauncherService.launchApp('com.whatsapp');
    return this.fromAction(r, 'WhatsApp khol diya.');
  }

  private static async executeOpenInstagram(cmd: ParsedCommand): Promise<CommandResult> {
    const r = await AppLauncherService.openInstagram('main');
    return this.fromAction(r);
  }

  private static async executeInstagramReels(): Promise<CommandResult> {
    const r = await AppLauncherService.openInstagram('reels');
    return this.fromAction(r);
  }

  private static async executeInstagramMessages(): Promise<CommandResult> {
    const msgs = await NotificationReaderService.getInstagramMessages();
    if (msgs.length === 0) {
      const r = await AppLauncherService.openInstagram('messages');
      if (r.status === 'SUCCESS') return { success: true, message: 'No IG notifications, opening app', voiceResponse: 'Sir, Instagram ke koi notifications nahi hain. App khol raha hoon.', data: msgs };
      return this.fromAction(r);
    }
    const latest = msgs[0];
    return { success: true, message: `${msgs.length} IG messages`, voiceResponse: `Sir, Instagram pe ${msgs.length} messages hain. Latest from ${latest.title}: ${latest.text.substring(0, 80)}`, data: msgs };
  }

  private static async executeNotificationSummary(cmd: ParsedCommand): Promise<CommandResult> {
    const summary = await NotificationReaderService.getUnreadSummary();
    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    if (total === 0) {
      return { success: true, message: 'No unread notifications', voiceResponse: 'Sir, koi unread notification nahi hai.' };
    }
    const parts = Object.entries(summary).filter(([, v]) => v > 0).map(([k, v]) => `${this.getAppFriendlyName(k)}: ${v}`);
    return { success: true, message: `Unread: ${parts.join(', ')}`, voiceResponse: `Sir, ${total} unread notifications hain. ${parts.join(', ')}`, data: summary };
  }

  private static async executeFlashlight(cmd: ParsedCommand): Promise<CommandResult> {
    const on = cmd.rawText.toLowerCase().includes('on');
    const off = cmd.rawText.toLowerCase().includes('off');
    if (on) return this.fromAction(await DeviceControlService.setFlashlightExplicit(true));
    if (off) return this.fromAction(await DeviceControlService.setFlashlightExplicit(false));
    const r = await DeviceControlService.toggleFlashlight();
    return this.fromAction(r);
  }

  private static async executeVolumeUp(): Promise<CommandResult> {
    const r = await DeviceControlService.adjustVolume(1);
    if (r.status !== 'SUCCESS') return this.fromAction(r);
    return { success: true, message: `Volume: ${(r.data as number) ?? ''}`, voiceResponse: `Volume badha diya. Ab ${r.data} hai.` };
  }

  private static async executeVolumeDown(): Promise<CommandResult> {
    const r = await DeviceControlService.adjustVolume(-1);
    if (r.status !== 'SUCCESS') return this.fromAction(r);
    return { success: true, message: `Volume: ${(r.data as number) ?? ''}`, voiceResponse: `Volume kam kar diya. Ab ${r.data} hai.` };
  }

  private static async executeVolumeSet(cmd: ParsedCommand): Promise<CommandResult> {
    if (cmd.number == null) return { success: false, message: 'Level needed', voiceResponse: 'Kitna level karna hai?' };
    return this.fromAction(await DeviceControlService.setVolume(cmd.number));
  }

  private static async executeMute(): Promise<CommandResult> {
    return this.fromAction(await DeviceControlService.setMuted(true), 'Done Sir. Phone silent kar diya.');
  }

  private static async executeUnmute(): Promise<CommandResult> {
    return this.fromAction(await DeviceControlService.setMuted(false), 'Done Sir. Sound on kar diya.');
  }

  private static async executeScreenshot(): Promise<CommandResult> {
    // Android has no public API for silent screenshots — never fake it.
    return {
      success: false,
      message: 'Screenshot needs system buttons',
      voiceResponse: 'Sir, screenshot ke liye Power aur Volume-down button ek saath dabao. App se silent screenshot allowed nahi hai.',
    };
  }

  private static async executeBrightnessUp(): Promise<CommandResult> {
    let info: { brightness: number };
    try {
      info = await DeviceControlService.getBrightnessSafe();
    } catch {
      return { success: false, message: 'Brightness read failed', voiceResponse: 'Sir, brightness read nahi ho payi.' };
    }
    const newLevel = Math.min(255, info.brightness + 50);
    return this.fromAction(await DeviceControlService.setBrightness(newLevel));
  }

  private static async executeBrightnessDown(): Promise<CommandResult> {
    let info: { brightness: number };
    try {
      info = await DeviceControlService.getBrightnessSafe();
    } catch {
      return { success: false, message: 'Brightness read failed', voiceResponse: 'Sir, brightness read nahi ho payi.' };
    }
    const newLevel = Math.max(0, info.brightness - 50);
    return this.fromAction(await DeviceControlService.setBrightness(newLevel));
  }

  private static async executeBluetoothToggle(): Promise<CommandResult> {
    return this.fromAction(await DeviceControlService.toggleBluetooth());
  }

  private static async executeBluetoothStatus(): Promise<CommandResult> {
    const info = await DeviceControlService.getBluetoothStatus();
    return { success: true, message: `Bluetooth: ${info.enabled ? 'ON' : 'OFF'}`, voiceResponse: `Bluetooth ${info.enabled ? 'chalu hai' : 'band hai'}.`, data: info };
  }

  private static async executeLockScreen(): Promise<CommandResult> {
    return this.fromAction(await DeviceControlService.lockScreen());
  }

  private static async executeWakeScreen(): Promise<CommandResult> {
    return this.fromAction(await DeviceControlService.wakeUpScreen());
  }

  private static async executeOpenSettings(cmd: ParsedCommand): Promise<CommandResult> {
    const setting = cmd.setting || 'main';
    return this.fromAction(await DeviceControlService.openSettings(setting));
  }

  private static async executeGoHome(): Promise<CommandResult> {
    return this.fromAction(await AppLauncherService.goHome(), 'Home pe aa gaye.');
  }

  private static async executeOpenApp(cmd: ParsedCommand): Promise<CommandResult> {
    if (!cmd.appName) return { success: false, message: 'App name needed', voiceResponse: 'Kaun sa app kholna hai?' };
    const r = await AppLauncherService.launchApp(cmd.appName);
    return this.fromAction(r, `${cmd.appName} khol diya.`);
  }

  /** Open YouTube for real — HUD viewport + new tab. Success only if something actually opened. */
  private static async executeYouTube(cmd: ParsedCommand): Promise<CommandResult> {
    const query = (cmd.parameters?.['query'] || '').trim();
    const url = query
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      : 'https://www.youtube.com';
    // Prefer the native app on device; fall back to browser tab on PC/web.
    try {
      const r = await AppLauncherService.launchApp('com.google.android.youtube');
      if (r.status === 'SUCCESS') {
        return { success: true, message: `YouTube opened${query ? `: ${query}` : ''}`, voiceResponse: query ? `YouTube pe ${query} khol raha hoon.` : 'YouTube khol diya.' };
      }
    } catch { /* not on Android — use browser below */ }
    try {
      const win = typeof window !== 'undefined' ? window.open(url, '_blank', 'noopener,noreferrer') : null;
      if (win || typeof window === 'undefined') {
        return { success: true, message: `YouTube opened: ${url}`, voiceResponse: query ? `YouTube pe ${query} khol diya.` : 'YouTube khol diya.' };
      }
      return { success: false, message: 'Popup blocked', voiceResponse: 'Sir, browser ne YouTube popup block kar diya. Popup allow karo phir bolo.' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'YouTube open failed', voiceResponse: 'Sir, YouTube khol nahi paya.' };
    }
  }

  /** Open a website for real. Success only if the URL actually opened. */
  private static async executeWebsite(cmd: ParsedCommand): Promise<CommandResult> {
    let site = (cmd.parameters?.['site'] || '').trim();
    if (!site) {
      return { success: false, message: 'Website name needed', voiceResponse: 'Sir, kaunsi website kholna hai?' };
    }
    // Strip Hindi verbs accidentally captured ("kholo", "khol", "open").
    site = site.replace(/^(kholo|khol|open|launch)\s+/i, '').trim();
    if (!/^https?:\/\//i.test(site) && !/^[a-z0-9-]+\.[a-z]{2,}/i.test(site)) {
      return { success: false, message: 'Unclear website', voiceResponse: 'Sir, ye action abhi available nahi hai.' };
    }
    const url = /^https?:\/\//i.test(site) ? site : `https://${site}`;
    try {
      const win = typeof window !== 'undefined' ? window.open(url, '_blank', 'noopener,noreferrer') : null;
      if (win) {
        return { success: true, message: `Website opened: ${url}`, voiceResponse: `${site} khol diya.` };
      }
      return { success: false, message: 'Popup blocked', voiceResponse: 'Sir, browser ne popup block kar diya. Popup allow karo.' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Website open failed', voiceResponse: 'Sir, ye action abhi available nahi hai.' };
    }
  }

  /** Local date/time — always real, never needs network. */
  private static async executeDateTime(cmd: ParsedCommand): Promise<CommandResult> {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    const lang = this.detectLanguage(cmd.rawText);
    const voice = lang === 'en'
      ? `It's ${timeStr}, ${dateStr}.`
      : `Sir, time ${timeStr} hai, ${dateStr} hai.`;
    return { success: true, message: `${dateStr} ${timeStr}`, voiceResponse: voice, data: { iso: now.toISOString() } };
  }

  private static async executeCameraOpen(): Promise<CommandResult> {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      await Camera.getPhoto({ quality: 90, resultType: CameraResultType.DataUrl, source: CameraSource.Camera });
      return { success: true, message: 'Camera captured', voiceResponse: 'Photo le liya.' };
    } catch {
      return this.fromAction(await AppLauncherService.openCamera());
    }
  }

  // ---- PC + gesture intents (desktop shell bridge; honest when in browser) ----

  private static async executeGestureMode(cmd: ParsedCommand): Promise<CommandResult> {
    const m = (cmd.appName || 'GENERAL').toUpperCase();
    const valid = ['GENERAL', 'CURSOR', 'ORB', 'DOCUMENT', 'FILE_TRANSFER', 'PRESENTATION', 'VOLUME', 'BRIGHTNESS'];
    if (!valid.includes(m)) {
      return { success: false, message: 'Unknown gesture mode', voiceResponse: 'Sir, kaunsa mode? Cursor, Orb, Document, Transfer, Presentation, Volume ya Brightness.' };
    }
    try {
      const { globalGestureEngine } = await import('./GestureControlEngine');
      globalGestureEngine.setMode(m as import('./GestureControlEngine').GestureMode);
      return { success: true, message: `Gesture mode: ${m}`, voiceResponse: `${m} mode on hai. Haath dikhao.` };
    } catch (e: unknown) {
      return { success: false, message: 'Gesture engine unavailable', voiceResponse: 'Sir, gesture engine load nahi hua.' };
    }
  }

  private static async executePcLock(): Promise<CommandResult> {
    return this.fromAction(await PcBridgeService.lockPc(), 'PC lock kar diya.');
  }

  private static async executePcPower(kind: 'shutdown' | 'restart' | 'sleep' | 'cancel'): Promise<CommandResult> {
    // dispatch() already asked for voice confirmation for shutdown/restart/sleep.
    return this.fromAction(await PcBridgeService.powerPc(kind));
  }

  private static async executePcVolume(which: 'up' | 'down' | 'mute'): Promise<CommandResult> {
    if (which === 'mute') return this.fromAction(await PcBridgeService.mediaKey('MUTE', 'PC mute toggle'));
    return this.fromAction(await PcBridgeService.mediaKey(which === 'up' ? 'VOLUME_UP' : 'VOLUME_DOWN', which === 'up' ? 'PC volume up' : 'PC volume down'));
  }

  private static async executePcZoom(cmd: ParsedCommand): Promise<CommandResult> {
    // Real keys to the ACTIVE app (Ctrl + / Ctrl -). Scope stated honestly.
    const dir = (cmd.number ?? 1) >= 0 ? 'in' : 'out';
    const keys = dir === 'in' ? '^{ADD}' : '^{SUBTRACT}';
    const r = await PcBridgeService.sendKeys(keys, `PC zoom ${dir}`);
    if (r.status !== 'SUCCESS') return this.fromAction(r);
    return { success: true, message: `Zoom ${dir} keys sent`, voiceResponse: `Active app me zoom ${dir} keys bhej di. App support karegi to zoom hoga.` };
  }

  private static async executeTimer(cmd: ParsedCommand): Promise<CommandResult> {
    // This offline command path has no OS timer UI — never claim one was set.
    // The Live voice path (ToolManager.setCountdownTimer) owns real HUD timers.
    const minutes = cmd.number || 5;
    return {
      success: false,
      message: `No local timer scheduled (${minutes} min requested)`,
      voiceResponse: `Sir, ${minutes} minute ka timer yahan schedule nahi hota. Live voice mode me "timer lagao" bolo — wahan HUD timer lagega.`,
    };
  }

  /** Real weather via device location + open-meteo (no key). Honest on denial/failure. */
  private static async executeWeather(): Promise<CommandResult> {
    const pos = await new Promise<GeolocationPosition | null>((resolve) => {
      try {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
          timeout: 10000,
          maximumAge: 300000,
        });
        setTimeout(() => resolve(null), 11000);
      } catch {
        resolve(null);
      }
    });
    if (!pos) {
      return {
        success: false,
        message: 'Location unavailable',
        voiceResponse: 'Sir, location nahi mili — location permission do, phir mausam bataunga.',
      };
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude.toFixed(3)}&longitude=${pos.coords.longitude.toFixed(3)}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const cur = j?.current;
      if (!cur || typeof cur.temperature_2m !== 'number') throw new Error('bad-payload');
      const code = Number(cur.weather_code);
      const condition =
        code === 0 ? 'saaf aasmaan' : code <= 3 ? 'halke baadal' : code <= 48 ? 'kohra/dhund'
        : code <= 67 ? 'baarish' : code <= 77 ? 'barf' : code <= 82 ? 'tez baarish'
        : code <= 86 ? 'barfbaari' : 'toofaan';
      const temp = Math.round(cur.temperature_2m);
      return {
        success: true,
        message: `Weather: ${temp}°C ${condition}`,
        voiceResponse: `Sir, abhi ${temp} degree hai, ${condition} hai.`,
        data: { temp, condition, humidity: cur.relative_humidity_2m, wind: cur.wind_speed_10m },
      };
    } catch (e: unknown) {
      const aborted = (e as Error)?.name === 'AbortError';
      return {
        success: false,
        message: aborted ? 'Weather timeout' : 'Weather fetch failed',
        voiceResponse: aborted
          ? 'Sir, mausam server se jawab nahi aaya. Dobara try karo.'
          : 'Sir, mausam nahi nikal paya. Internet check karo.',
      };
    }
  }

  // ---- FRIDAY Share voice actions (call the real ShareManager; App opens the panel) ----

  private static openSharePanel(): void {
    try {
      window.dispatchEvent(new CustomEvent('friday:open-share'));
    } catch { /* UI-only */ }
  }

  private static async executeOpenShare(): Promise<CommandResult> {
    this.openSharePanel();
    return { success: true, message: 'Share panel opened', voiceResponse: 'FRIDAY Share khol diya.' };
  }

  private static async executeShareScan(): Promise<CommandResult> {
    this.openSharePanel();
    try {
      const { globalShareManager } = await import('./ShareManager');
      const r = await globalShareManager.discover();
      if (!r.devices.length) {
        return { success: false, message: r.note, voiceResponse: `Sir, ${r.note}` };
      }
      const names = r.devices.map((d) => d.label).join(', ');
      return { success: true, message: `Found: ${names}`, voiceResponse: `Sir, ${r.devices.length} device mila: ${names}.` };
    } catch (e: unknown) {
      return { success: false, message: 'Scan failed', voiceResponse: 'Sir, nearby devices scan nahi ho paya. Server check karo.' };
    }
  }

  private static async executeShareSend(): Promise<CommandResult> {
    // Voice cannot pick files — open the panel and say exactly that.
    this.openSharePanel();
    return { success: false, message: 'File picker needed', voiceResponse: 'Sir, Share panel khol diya. Wahan files select karke bhejo — voice se file select nahi hoti.' };
  }

  private static async executeShareCancel(): Promise<CommandResult> {
    try {
      const { globalShareManager } = await import('./ShareManager');
      globalShareManager.requestCancel();
      return { success: true, message: 'Cancel requested', voiceResponse: 'Transfer cancel kar diya.' };
    } catch {
      return { success: false, message: 'Cancel failed', voiceResponse: 'Sir, cancel nahi ho paya.' };
    }
  }

  private static async executeShareAcceptReject(accept: boolean): Promise<CommandResult> {
    // The actual Accept/Reject tap happens in the Share panel (per-transfer
    // approval must be explicit). Voice opens the panel to the incoming list.
    this.openSharePanel();
    return {
      success: false,
      message: accept ? 'Manual accept needed' : 'Manual reject needed',
      voiceResponse: accept
        ? 'Sir, Share panel khol diya — incoming transfer par Accept dabao.'
        : 'Sir, Share panel khol diya — incoming transfer par Reject dabao.',
    };
  }

  private static async executeVoiceSwitch(cmd: ParsedCommand): Promise<CommandResult> {
    // Real voice-switch: changes the actual TTS config (Live voice + offline
    // persona), verifies it, and only then confirms in the NEW voice.
    // Never recurses into parse/execute and never runs another command.
    // JARVIS voice is a PRO entitlement: FREE users are told honestly.
    const target = (cmd.parameters?.target === 'JARVIS' ? 'JARVIS' : 'FRIDAY') as 'FRIDAY' | 'JARVIS';
    if (target === 'JARVIS') {
      try {
        const { hasEntitlement } = await import('./EntitlementService');
        if (!hasEntitlement('JARVIS_VOICE')) {
          return {
            success: false,
            message: 'JARVIS voice requires FRIDAY Pro',
            voiceResponse: 'Sir, JARVIS voice FRIDAY Pro me available hai. Upgrade screen me dekh lo.',
          };
        }
      } catch { /* entitlement check unavailable — fail open to FRIDAY only */ }
    }
    try {
      const { requestVoiceSwitch } = await import('./DualVoiceManager');
      const result = await requestVoiceSwitch(target);
      // Speak confirmation in the NEW voice only after config changed.
      await TTSService.speak(result.confirmation);
      return {
        success: true,
        message: `Voice switched to ${result.activeVoice} (live=${result.liveVoice}${result.changed ? '' : ', already active'})`,
        voiceResponse: result.confirmation,
        data: { activeVoice: result.activeVoice, liveVoice: result.liveVoice, changed: result.changed },
      };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Voice switch failed', voiceResponse: 'Sir, voice switch nahi ho paya.' };
    }
  }

  private static async executeAICommand(cmd: ParsedCommand): Promise<CommandResult> {
    return { success: true, message: `AI: ${cmd.intent}`, voiceResponse: 'Sir, AI se pooch raha hoon.' };
  }

  private static async requestConfirmation(cmd: ParsedCommand): Promise<boolean> {
    const msg = this.getConfirmationMessage(cmd);
    await TTSService.speak(msg);
    return new Promise<boolean>((resolve) => {
      this.pendingConfirmation = { command: cmd, resolve };
      setTimeout(() => {
        if (this.pendingConfirmation) {
          this.pendingConfirmation.resolve(false);
          this.pendingConfirmation = null;
        }
      }, 15000);
    });
  }

  static confirmPending(confirmed: boolean): void {
    if (this.pendingConfirmation) {
      this.pendingConfirmation.resolve(confirmed);
      this.pendingConfirmation = null;
    }
  }

  private static getConfirmationMessage(cmd: ParsedCommand): string {
    switch (cmd.intent) {
      case 'call': return `Sir, ${cmd.contactName} ko call kar doon?`;
      case 'sms': return `Sir, ${cmd.contactName} ko ye SMS bhej doon: ${cmd.message}?`;
      case 'whatsapp_message': return `Sir, ${cmd.contactName} ko WhatsApp kar doon: ${cmd.message}?`;
      case 'lock_screen': return 'Sir, phone lock kar doon?';
      case 'pc_shutdown': return 'Sir, PC 30 second me shutdown ho jayega. Confirm karo?';
      case 'pc_restart': return 'Sir, PC 30 second me restart ho jayega. Confirm karo?';
      case 'pc_sleep': return 'Sir, PC sleep kar doon?';
      default: return 'Sir, ye kar doon?';
    }
  }

  private static matchAny(text: string, patterns: string[]): boolean {
    return patterns.some(p => text.includes(p));
  }

  private static extractNameAfter(text: string, after: string[]): string | undefined {
    for (const a of after) {
      const idx = text.toLowerCase().indexOf(a.toLowerCase());
      if (idx >= 0) {
        const rest = text.substring(idx + a.length).trim();
        const words = rest.split(/\s+/).slice(0, 3).join(' ');
        if (words) return words;
      }
    }
    return undefined;
  }

  private static extractAfter(text: string, markers: string[]): string | undefined {
    for (const m of markers) {
      const idx = text.toLowerCase().indexOf(m.toLowerCase());
      if (idx >= 0) {
        return text.substring(idx + m.length).trim();
      }
    }
    return undefined;
  }

  private static extractNumber(text: string): number | undefined {
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1]) : undefined;
  }

  private static extractAppName(text: string): string | undefined {
    const lower = text.toLowerCase();
    for (const [name, pkg] of Object.entries(AppLauncherService.APP_MAP)) {
      if (lower.includes(name)) return pkg;
    }
    const afterOpen = text.match(/(?:open|kholo|khol|launch|start|chalu)\s+(.+)/i);
    if (afterOpen) return afterOpen[1].trim();
    return undefined;
  }

  private static extractSettingType(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('wifi') || lower.includes('wi-fi')) return 'wifi';
    if (lower.includes('bluetooth')) return 'bluetooth';
    if (lower.includes('sound') || lower.includes('awaz')) return 'sound';
    if (lower.includes('display') || lower.includes('screen')) return 'display';
    if (lower.includes('battery')) return 'battery';
    if (lower.includes('security') || lower.includes('lock')) return 'security';
    if (lower.includes('accessibility')) return 'accessibility';
    if (lower.includes('developer')) return 'developer';
    if (lower.includes('app')) return 'app';
    if (lower.includes('location') || lower.includes('gps')) return 'location';
    if (lower.includes('nfc')) return 'nfc';
    return 'main';
  }

  private static getAppFriendlyName(pkg: string): string {
    const map: Record<string, string> = {
      'com.whatsapp': 'WhatsApp',
      'com.instagram.android': 'Instagram',
      'com.google.android.gm': 'Gmail',
      'org.telegram.messenger': 'Telegram',
      'com.android.mms': 'SMS',
      'com.android.incallui': 'Phone',
    };
    return map[pkg] || pkg;
  }
}
