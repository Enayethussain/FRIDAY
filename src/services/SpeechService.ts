import { Capacitor } from '@capacitor/core';
import { CommandEngine, CommandResult } from './CommandEngine';
import { TTSService } from './TTSService';
import { FridayLogger } from './FridayLogger';

const TAG = 'STT';

export class SpeechService {
  private static listening = false;
  private static recognition: any = null;
  private static ttsActive = false;
  private static errorCount = 0;
  private static ttsUnsub: (() => void) | null = null;

  /** Called by conversation layer so own TTS voice is never treated as a command. */
  static setTtsActive(active: boolean) {
    this.ttsActive = active;
    if (active) {
      // Hard stop any in-flight recognition while JARVIS speaks.
      this.abortInternal();
    }
  }

  static async isAvailable(): Promise<boolean> {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      return true;
    }
    try {
      if (Capacitor.getPlatform() === 'android') {
        // Android WebView build used here has no system speech plugin wired;
        // report unavailable honestly so UI can guide the user.
        return false;
      }
    } catch {}
    return false;
  }

  static async startListening(options?: { lang?: string; interim?: boolean }): Promise<string> {
    if (this.listening) throw new Error('already-listening');
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      throw new Error('Speech recognition not available on this device. Use text chat instead.');
    }
    if (this.ttsActive) throw new Error('tts-active');

    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        this.listening = false;
        fn();
      };
      try {
        this.abortInternal();
        const rec = new SpeechRecognitionAPI();
        this.recognition = rec;
        rec.lang = options?.lang || 'en-IN'; // en-IN covers English + Hinglish/Hindi-transliterated speech
        rec.interimResults = options?.interim ?? false;
        rec.maxAlternatives = 1;
        try { rec.continuous = false; } catch {}
        this.listening = true;
        FridayLogger.info(TAG, 'recognition start');

        rec.onresult = (event: any) => {
          try {
            if (this.ttsActive) {
              FridayLogger.debug(TAG, 'result ignored (own TTS active)');
              return;
            }
            const transcript = event.results?.[0]?.[0]?.transcript || '';
            if (transcript.trim()) {
              this.errorCount = 0;
              done(() => resolve(transcript.trim()));
              try { rec.stop(); } catch {}
            }
          } catch (e: any) {
            done(() => reject(new Error(e?.message || 'recognition-error')));
          }
        };
        rec.onerror = (event: any) => {
          const code = event?.error || 'unknown';
          FridayLogger.warn(TAG, `recognition error: ${code}`);
          if (code === 'not-allowed' || code === 'service-not-allowed') {
            done(() => reject(new Error('Microphone permission denied. Allow mic access in Settings.')));
          } else if (code === 'audio-capture') {
            done(() => reject(new Error('Microphone unavailable. Another app may be using it.')));
          } else if (code === 'network') {
            done(() => reject(new Error('Speech service needs internet. Check connection.')));
          } else if (code === 'no-speech' || code === 'aborted') {
            done(() => reject(new Error('no-speech')));
          } else {
            done(() => reject(new Error(`Speech error: ${code}`)));
          }
        };
        rec.onend = () => {
          this.listening = false;
          this.recognition = null;
          FridayLogger.debug(TAG, 'recognition end');
          if (!settled) {
            settled = true;
            reject(new Error('no-speech'));
          }
        };
        rec.start();
      } catch (e: any) {
        this.listening = false;
        this.recognition = null;
        reject(new Error(e?.message || 'recognition-start-failed'));
      }
    });
  }

  private static abortInternal() {
    try {
      if (this.recognition) {
        try { this.recognition.onresult = null; } catch {}
        try { this.recognition.onerror = null; } catch {}
        try { this.recognition.onend = null; } catch {}
        try { this.recognition.abort(); } catch { try { this.recognition.stop(); } catch {} }
      }
    } catch {}
    this.recognition = null;
    this.listening = false;
  }

  static async stopListening(): Promise<void> {
    this.abortInternal();
    FridayLogger.info(TAG, 'stopped');
  }

  static getIsListening(): boolean {
    return this.listening;
  }

  static resetErrors() {
    this.errorCount = 0;
  }

  static noteError(): number {
    this.errorCount += 1;
    return this.errorCount;
  }

  static async processVoiceCommand(transcript: string): Promise<CommandResult> {
    const command = CommandEngine.parse(transcript);
    return CommandEngine.execute(command);
  }
}

// Keep TTS guard in sync even if callers forget setTtsActive.
try {
  SpeechService['ttsUnsub'] = TTSService.onState((s) => {
    SpeechService.setTtsActive(s === 'speaking');
  });
} catch {}
