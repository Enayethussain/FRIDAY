import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Capacitor } from '@capacitor/core';
import { FridayLogger } from './FridayLogger';

export type TTSState = 'idle' | 'speaking' | 'stopped' | 'error';

const TAG = 'TTS';
const isAndroid = () => {
  try { return Capacitor.getPlatform() === 'android'; } catch { return false; }
};

/** Rough speech duration estimate so native completion can be detected. */
function estimateMs(text: string, rate: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const clampedRate = Math.max(0.5, Math.min(2.0, rate));
  return Math.min(120000, Math.max(1200, (words / (2.4 * clampedRate)) * 1000 + 600));
}

const VOICE_OVERRIDE_KEY = 'jarvis_tts_voice';

/** Offline fallback persona: 'friday' (female-first) or 'jarvis' (male-first). */
export type TTSPersona = 'friday' | 'jarvis';
const PERSONA_KEY = 'friday_tts_persona';

/** Last voice actually used for synthesis (honest verification, not a claim). */
let lastUsedVoiceName = '';
let lastUsedVoiceLang = '';

export function getTTSPersona(): TTSPersona {
  try {
    return localStorage.getItem(PERSONA_KEY) === 'jarvis' ? 'jarvis' : 'friday';
  } catch {
    return 'friday';
  }
}

export function setTTSPersona(persona: TTSPersona): void {
  try {
    localStorage.setItem(PERSONA_KEY, persona);
  } catch { /* storage unavailable */ }
  // Persona changes pitch/rate defaults so the generated audio really differs.
  if (persona === 'jarvis') {
    TTSService.setRate(1.0);
    TTSService.setPitch(0.85);
    TTSService.setLang('en-US');
  } else {
    TTSService.setRate(1.0);
    TTSService.setPitch(1.1);
    TTSService.setLang('en-US');
  }
}

export function getLastUsedVoiceInfo(): { name: string; lang: string } | null {
  if (!lastUsedVoiceName) return null;
  return { name: lastUsedVoiceName, lang: lastUsedVoiceLang };
}

/** Configured voice override (exact voice name). Empty = automatic male-voice selection. */
export function getConfiguredVoiceName(): string {
  try { return localStorage.getItem(VOICE_OVERRIDE_KEY) || ''; } catch { return ''; }
}
export function setConfiguredVoiceName(name: string): void {
  try {
    if (name) localStorage.setItem(VOICE_OVERRIDE_KEY, name);
    else localStorage.removeItem(VOICE_OVERRIDE_KEY);
  } catch { /* storage unavailable */ }
}

/**
 * FRIDAY female-voice-first selection (no EdgeTTS dependency — pure Web Speech).
 * Order: exact configured override -> female Hindi (hi-IN) -> female English
 * (en-IN/en-US) -> same-language default -> any female -> first available.
 * Never throws, never crashes when a voice is missing — falls back and logs
 * what is actually used. NOTE: which voices exist depends on the OS/browser;
 * desktop Chrome ships Google US English + eSpeak Hindi, Android ships
 * Google TTS (Hindi female available when Google TTS + Hindi voice data
 * installed). If the OS has no female voice, the fallback speaks honestly.
 *
 * JARVIS persona uses pickMaleVoice() below (male-first, same engine).
 * Persona comes from DualVoiceManager (FRIDAY default); the exact-name
 * override in 'jarvis_tts_voice' is still honored first when available.
 */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (getTTSPersona() === 'jarvis') return pickMaleVoice(lang);
  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const override = getConfiguredVoiceName().toLowerCase();
    if (override) {
      const exact = voices.find((v) => v.name.toLowerCase() === override);
      if (exact) {
        FridayLogger.info(TAG, `using configured voice: ${exact.name} (${exact.lang})`);
        return exact;
      }
      FridayLogger.info(TAG, `configured voice "${override}" unavailable — falling back`);
    }
    const isFeminine = (v: SpeechSynthesisVoice) => {
      const n = v.name.toLowerCase();
      if (/\bmale\b/.test(n) && !/\bfemale\b/.test(n)) return false;
      return /\bfemale\b|swara|veena|kalpana|lekha|meera|zira|samantha|aria|jenny|sonia|neerja|divya/.test(n);
    };
    const hindi = voices.filter((v) => v.lang.toLowerCase().startsWith('hi'));
    const hindiFemale = hindi.find(isFeminine);
    if (hindiFemale) {
      FridayLogger.info(TAG, `using Hindi female voice: ${hindiFemale.name} (${hindiFemale.lang})`);
      return hindiFemale;
    }
    const langPrefix = lang.split('-')[0].toLowerCase();
    const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
    const sameFemale = sameLang.find(isFeminine);
    if (sameFemale) {
      FridayLogger.info(TAG, `using voice: ${sameFemale.name} (${sameFemale.lang})`);
      return sameFemale;
    }
    const anyFemale = voices.find(isFeminine);
    if (anyFemale) {
      FridayLogger.info(TAG, `using voice: ${anyFemale.name} (${anyFemale.lang})`);
      return anyFemale;
    }
    const fallback = (sameLang.length ? sameLang : voices)[0] || null;
    if (fallback) FridayLogger.info(TAG, `using fallback voice: ${fallback.name} (${fallback.lang})`);
    return fallback;
  } catch {
    return null;
  }
}

/**
 * JARVIS male-voice-first selection (same Web Speech engine, opposite picker).
 * Order: exact configured override -> male Hindi (hi-IN) -> same-language
 * masculine/non-feminine -> any masculine/non-feminine -> same-language
 * fallback -> first available. Logs the actual voice used; never invents one.
 */
function pickMaleVoice(lang: string): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const override = getConfiguredVoiceName().toLowerCase();
    if (override) {
      const exact = voices.find((v) => v.name.toLowerCase() === override);
      if (exact) {
        FridayLogger.info(TAG, `using configured voice: ${exact.name} (${exact.lang})`);
        return exact;
      }
      FridayLogger.info(TAG, `configured voice "${override}" unavailable — falling back`);
    }
    const feminine = (v: SpeechSynthesisVoice) => {
      const n = v.name.toLowerCase();
      if (/\bmale\b/.test(n) && !/\bfemale\b/.test(n)) return false;
      return /\bfemale\b|swara|veena|kalpana|lekha|meera|zira|samantha|aria|jenny|sonia|neerja|divya/.test(n);
    };
    const masculine = (v: SpeechSynthesisVoice) => {
      const n = v.name.toLowerCase();
      if (feminine(v)) return false;
      return /\bmale\b|david|daniel|alex|fred|george|james|john|michael|ravi|arjun|amit|prabhat|rahul|rajesh|vijay/.test(n);
    };
    const hindi = voices.filter((v) => v.lang.toLowerCase().startsWith('hi'));
    const hindiMale = hindi.find(masculine) || hindi.find((v) => !feminine(v));
    if (hindiMale) {
      FridayLogger.info(TAG, `using Hindi male voice: ${hindiMale.name} (${hindiMale.lang})`);
      return hindiMale;
    }
    const langPrefix = lang.split('-')[0].toLowerCase();
    const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
    const sameMale = sameLang.find(masculine) || sameLang.find((v) => !feminine(v));
    if (sameMale) {
      FridayLogger.info(TAG, `using voice: ${sameMale.name} (${sameMale.lang})`);
      return sameMale;
    }
    const anyMale = voices.find(masculine) || voices.find((v) => !feminine(v));
    if (anyMale) {
      FridayLogger.info(TAG, `using voice: ${anyMale.name} (${anyMale.lang})`);
      return anyMale;
    }
    const fallback = (sameLang.length ? sameLang : voices)[0] || null;
    if (fallback) FridayLogger.info(TAG, `using fallback voice: ${fallback.name} (${fallback.lang})`);
    return fallback;
  } catch {
    return null;
  }
}

/** Chrome loads voices async — warm them up so first speak() isn't voiceless. */
function ensureVoicesLoaded(): Promise<void> {
  try {
    const synth = window.speechSynthesis;
    if (!synth || synth.getVoices().length) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        try { synth.onvoiceschanged = null; } catch {}
        resolve();
      };
      try { synth.onvoiceschanged = done as () => void; } catch { resolve(); return; }
      setTimeout(done, 1200);
      try { synth.getVoices(); } catch { /* noop */ }
    });
  } catch {
    return Promise.resolve();
  }
}

export class TTSService {
  private static speaking = false;
  private static stopped = false;
  private static rate = 1.0;
  // FRIDAY is the default voice: slightly bright female pitch.
  private static pitch = 1.1;
  private static lang = 'en-US';
  private static stateListeners: ((s: TTSState) => void)[] = [];
  private static completionTimer: ReturnType<typeof setTimeout> | null = null;
  private static currentId = 0;

  static onState(fn: (s: TTSState) => void): () => void {
    this.stateListeners.push(fn);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== fn);
    };
  }

  private static emit(s: TTSState) {
    this.stateListeners.forEach((fn) => {
      try { fn(s); } catch {}
    });
  }

  static async speak(text: string, options?: { lang?: string; rate?: number; pitch?: number }): Promise<boolean> {
    const clean = (text || '').trim();
    if (!clean) return false;
    const id = ++this.currentId;
    await this.stopInternal();
    if (id !== this.currentId) return false; // superseded
    this.stopped = false;
    this.speaking = true;
    this.emit('speaking');
    const lang = options?.lang || this.lang;
    const rate = options?.rate ?? this.rate;
    const pitch = options?.pitch ?? this.pitch;
    FridayLogger.info(TAG, `speak start (${lang}, rate=${rate}) len=${clean.length}`);

    try {
      if (isAndroid()) {
        await this.speakNative(clean, lang, rate, pitch, id);
      } else {
        await this.speakWeb(clean, lang, rate, pitch, id);
      }
    } catch (e: any) {
      FridayLogger.error(TAG, `speak failed: ${e?.message || e}`);
      if (id === this.currentId) {
        this.speaking = false;
        this.emit('error');
      }
      return false;
    }
    if (id === this.currentId) {
      this.speaking = false;
      this.emit(this.stopped ? 'stopped' : 'idle');
      FridayLogger.info(TAG, 'speak done');
    }
    return !this.stopped;
  }

  private static speakNative(text: string, lang: string, rate: number, pitch: number, id: number): Promise<void> {
    return new Promise<void>((resolve) => {
      // Record the real native config (engine has no voice-name callback).
      lastUsedVoiceName = `native-${getTTSPersona()}`;
      lastUsedVoiceLang = lang;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        if (this.completionTimer) { clearTimeout(this.completionTimer); this.completionTimer = null; }
        resolve();
      };
      // Native plugin has no completion callback; resolve on estimated duration.
      this.completionTimer = setTimeout(done, estimateMs(text, rate));
      TextToSpeech.speak({ text, lang, rate, pitch, volume: 1.0, category: 'ambient' })
        .catch((e: any) => {
          FridayLogger.error(TAG, `native speak error: ${e?.message || e}`);
          done();
        });
      // If stop() is called externally, stopInternal clears the timer and resolves via check below.
      const watcher = setInterval(() => {
        if (id !== this.currentId || this.stopped) {
          clearInterval(watcher);
          done();
        }
      }, 120);
    });
  }

  private static speakWeb(text: string, lang: string, rate: number, pitch: number, id: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const begin = () => {
      try {
        const synth = window.speechSynthesis;
        if (!synth) return reject(new Error('speechSynthesis unavailable'));
        if (id !== this.currentId || this.stopped) return resolve(); // cancelled while voices loaded
        synth.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = lang;
        utter.rate = Math.max(0.5, Math.min(2.0, rate));
        utter.pitch = Math.max(0.5, Math.min(2.0, pitch));
        const voice = pickVoice(lang);
        if (voice) {
          utter.voice = voice;
          // Record the ACTUAL voice used (verification, not a claim).
          lastUsedVoiceName = voice.name;
          lastUsedVoiceLang = voice.lang;
        }
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          if (this.completionTimer) { clearTimeout(this.completionTimer); this.completionTimer = null; }
          resolve();
        };
        utter.onend = done;
        utter.onerror = (e: any) => {
          // 'interrupted' / 'canceled' happen on stop() — treat as done, not failure.
          if (e?.error === 'interrupted' || e?.error === 'canceled') return done();
          FridayLogger.error(TAG, `web speak error: ${e?.error || 'unknown'}`);
          done();
        };
        // Safety watchdog in case onend never fires.
        this.completionTimer = setTimeout(done, estimateMs(text, rate) + 5000);
        synth.speak(utter);
      } catch (e) {
        reject(e);
      }
      };
      // Voices load async in Chrome — wait briefly so pickVoice() sees them.
      void ensureVoicesLoaded().then(begin);
    });
  }

  static async speakHindi(text: string): Promise<boolean> {
    return this.speak(text, { lang: 'hi-IN' });
  }

  static async speakHinglish(text: string): Promise<boolean> {
    return this.speak(text, { lang: 'hi-IN', rate: 1.05 });
  }

  private static async stopInternal(): Promise<void> {
    this.stopped = true;
    if (this.completionTimer) { clearTimeout(this.completionTimer); this.completionTimer = null; }
    try {
      if (isAndroid()) {
        await TextToSpeech.stop();
      } else if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch {}
    this.speaking = false;
  }

  /** Safe interrupt: stops TTS, keeps state machine valid, never throws. */
  static async stop(): Promise<void> {
    this.currentId++;
    await this.stopInternal();
    this.emit('stopped');
    FridayLogger.info(TAG, 'stopped by user/system');
  }

  static isSpeakingNow(): boolean {
    return this.speaking;
  }

  static setRate(rate: number) {
    this.rate = Math.max(0.5, Math.min(2.0, rate));
  }

  static setPitch(pitch: number) {
    this.pitch = Math.max(0.5, Math.min(2.0, pitch));
  }

  static setLang(lang: string) {
    this.lang = lang;
  }

  static getLangs(): string[] {
    return ['en-US', 'hi-IN', 'en-GB', 'en-AU', 'es-ES', 'fr-FR', 'de-DE', 'ja-JP', 'ko-KR', 'zh-CN', 'pt-BR', 'ru-RU', 'ar-SA'];
  }
}
