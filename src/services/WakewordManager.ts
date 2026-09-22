import { WakewordConfig, WakewordState } from '../types';
import { SoundEffects } from '../utils/SoundEffects';

const WAKEWORD_CONFIG_KEY = 'friday_wakeword_config';

const DEFAULT_CONFIG: WakewordConfig = {
  enabled: true,
  keyword: 'hey friday',
  autoConnectOnWake: true,
  audioFeedback: true,
};

export class WakewordManager {
  private config: WakewordConfig = { ...DEFAULT_CONFIG };
  private state: WakewordState = {
    isListening: false,
    isSupported: false,
    statusMessage: 'Initializing...',
  };

  private recognition: any = null;
  private shouldBeListening: boolean = false;
  private isAssistantActive: boolean = false;
  private listeners: ((state: WakewordState) => void)[] = [];
  private onWakeCallback: ((keyword: string) => void) | null = null;
  public onWakewordDetected: ((keyword: string) => void) | null = null;
  private restartTimeout: any = null;

  constructor() {
    this.loadConfig();
    this.initRecognition();
  }

  private loadConfig(): void {
    try {
      const raw = localStorage.getItem(WAKEWORD_CONFIG_KEY);
      if (raw) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  private saveConfig(): void {
    try {
      localStorage.setItem(WAKEWORD_CONFIG_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.error('[Wakeword] Failed to save config:', e);
    }
  }

  private initRecognition(): void {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.state = {
        ...this.state,
        isSupported: false,
        statusMessage: 'Web Speech API not supported in this browser',
      };
      this.notify();
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      // en-IN understands English + Hinglish/Hindi-transliterated speech far
      // better than en-US on this target hardware; Devanagari Hindi is also
      // matched via transliterated triggers below (e.g. "friday" inside Hindi).
      this.recognition.lang = 'en-IN';

      this.recognition.onstart = () => {
        this.state = {
          ...this.state,
          isListening: true,
          statusMessage: `Listening for "${this.config.keyword}"...`,
        };
        this.notify();
      };

      this.recognition.onresult = (event: any) => {
        if (this.isAssistantActive) return;

        const current = event.resultIndex;
        const transcript = event.results[current][0]?.transcript?.toLowerCase() || '';

        this.checkTranscriptForWakeword(transcript);
      };

      this.recognition.onerror = (event: any) => {
        // 'no-speech' is routine in background speech recognition
        if (event.error !== 'no-speech') {
          console.warn('[Wakeword] Recognition event notice:', event.error);
        }
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          // Mic blocked: stop auto-restart loop and say the real reason.
          this.shouldBeListening = false;
          clearTimeout(this.restartTimeout);
          this.state = {
            ...this.state,
            isListening: false,
            statusMessage: 'Microphone blocked — browser Settings me mic permission do, phir wakeword ON karo.',
          };
          this.notify();
        } else if (event.error === 'audio-capture') {
          this.state = {
            ...this.state,
            statusMessage: 'Microphone busy/unavailable — doosri app mic use kar rahi hogi.',
          };
          this.notify();
        }
      };

      this.recognition.onend = () => {
        this.state = {
          ...this.state,
          isListening: false,
        };
        this.notify();

        // Auto restart if should be listening and assistant is idle
        if (this.shouldBeListening && !this.isAssistantActive && this.config.enabled) {
          clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            this.startListening();
          }, 400);
        }
      };

      this.state = {
        ...this.state,
        isSupported: true,
        statusMessage: 'Ready',
      };
      this.notify();
    } catch (e) {
      console.error('[Wakeword] Failed to initialize SpeechRecognition:', e);
      this.state = {
        ...this.state,
        isSupported: false,
        statusMessage: 'Failed to initialize engine',
      };
      this.notify();
    }
  }

  private checkTranscriptForWakeword(transcript: string): void {
    const target = this.config.keyword.toLowerCase().trim();
    // FRIDAY-first triggers + legacy jarvis/myraa aliases + natural variations.
    // Covers English, Hinglish and Hindi-transliterated utterances containing
    // the wake word (e.g. "friday youtube kholo", "hey friday time batao").
    const triggers = [
      target,
      'hey friday',
      'friday',
      'hello friday',
      'ok friday',
      'hey jarvis',
      'jarvis',
      'hello jarvis',
      'ok jarvis',
      'myraa',
      'hey myraa',
    ];

    const matched = triggers.some((trigger) => transcript.includes(trigger));

    if (matched) {
      console.log(`[Wakeword] Trigger detected: "${transcript}" matched "${target}"`);

      this.state = {
        ...this.state,
        lastDetectedWord: transcript,
        lastDetectedTime: Date.now(),
        statusMessage: `Wakeword detected!`,
      };
      this.notify();

      if (this.config.audioFeedback) {
        SoundEffects.playWakewordChime();
      }

      // Temporarily stop wakeword listener so mic can be cleanly handed to Gemini Live AudioStreamer
      this.stopListening();

      if (this.onWakeCallback) {
        this.onWakeCallback(transcript);
      }
      if (this.onWakewordDetected) {
        this.onWakewordDetected(transcript);
      }
    }
  }

  start(): void {
    this.startListening();
  }

  startListening(): void {
    if (!this.state.isSupported || !this.recognition || !this.config.enabled) return;
    if (this.isAssistantActive) return;

    this.shouldBeListening = true;
    try {
      this.recognition.start();
    } catch (e: any) {
      // If already started, ignore error
      if (!e.message?.includes('already started')) {
        console.warn('[Wakeword] Start warning:', e.message);
      }
    }
  }

  stopListening(): void {
    this.shouldBeListening = false;
    clearTimeout(this.restartTimeout);
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
    }
    this.state = {
      ...this.state,
      isListening: false,
    };
    this.notify();
  }

  /**
   * Called by StateManager when assistant changes state (e.g. listening/speaking/disconnected)
   */
  setAssistantActive(isActive: boolean): void {
    this.isAssistantActive = isActive;
    if (isActive) {
      this.stopListening();
    } else if (this.config.enabled) {
      // Delay slightly before re-opening wakeword listener to let audio stream disconnect
      setTimeout(() => {
        if (!this.isAssistantActive && this.config.enabled) {
          this.startListening();
        }
      }, 800);
    }
  }

  setOnWake(callback: (keyword: string) => void): void {
    this.onWakeCallback = callback;
  }

  getConfig(): WakewordConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<WakewordConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();

    if (this.config.enabled && !this.isAssistantActive) {
      this.startListening();
    } else if (!this.config.enabled) {
      this.stopListening();
    }
  }

  getState(): WakewordState {
    return { ...this.state };
  }

  subscribe(listener: (state: WakewordState) => void): () => void {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    const s = this.getState();
    this.listeners.forEach((fn) => {
      try {
        fn(s);
      } catch {}
    });
  }
}

export const globalWakewordManager = new WakewordManager();
