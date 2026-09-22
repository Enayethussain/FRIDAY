import { SpeechService } from './SpeechService';
import { TTSService } from './TTSService';
import { FridayLogger } from './FridayLogger';

export type ConversationState =
  | 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'FOLLOW_UP' | 'STOPPED' | 'ERROR';

export interface ConversationCallbacks {
  /** Return the assistant reply text (already executed). Return null to stay silent. */
  onTranscript?: (text: string) => Promise<string | null>;
  onState?: (s: ConversationState, detail?: string) => void;
  onTranscriptHeard?: (text: string) => void;
}

const TAG = 'Conv';
const CONTINUOUS_KEY = 'friday_continuous_convo';
const LISTEN_TIMEOUT_MS = 30000;
const PROCESS_TIMEOUT_MS = 25000;
const FOLLOW_UP_MS = 1200;
const MAX_CONSECUTIVE_ERRORS = 3;

const STOP_PATTERNS = [
  'jarvis stop', 'jarvis ruk', 'ruk jao', 'ruk ja', 'bas jarvis', 'stop jarvis',
  'band kar', 'chup', 'quiet jarvis',
];

function hasDevanagari(s: string): boolean {
  return /[\u0900-\u097F]/.test(s);
}

export class ConversationEngine {
  private static state: ConversationState = 'IDLE';
  private static running = false;
  private static continuous = true;
  private static callbacks: ConversationCallbacks = {};
  private static loopId = 0;
  private static errors = 0;
  private static listenTimer: ReturnType<typeof setTimeout> | null = null;

  static configure(cb: ConversationCallbacks) {
    this.callbacks = { ...this.callbacks, ...cb };
  }

  static isContinuous(): boolean {
    try {
      const raw = localStorage.getItem(CONTINUOUS_KEY);
      if (raw !== null) this.continuous = raw === '1';
    } catch {}
    return this.continuous;
  }

  static setContinuous(on: boolean) {
    this.continuous = on;
    try { localStorage.setItem(CONTINUOUS_KEY, on ? '1' : '0'); } catch {}
    FridayLogger.info(TAG, `continuous ${on ? 'ON' : 'OFF'}`);
  }

  static getState(): ConversationState {
    return this.state;
  }

  private static setState(s: ConversationState, detail?: string) {
    if (this.state === s && !detail) return;
    this.state = s;
    FridayLogger.info(TAG, `state -> ${s}${detail ? ` (${detail})` : ''}`);
    try { this.callbacks.onState?.(s, detail); } catch {}
  }

  static isStopCommand(text: string): boolean {
    const lower = text.toLowerCase().trim();
    if (lower === 'stop' || lower === 'bas' || lower === 'ruk' || lower === 'ruk jao') return true;
    return STOP_PATTERNS.some((p) => lower.includes(p));
  }

  static async start() {
    if (this.running) return;
    this.running = true;
    this.errors = 0;
    this.isContinuous();
    const id = ++this.loopId;
    FridayLogger.info(TAG, 'conversation started');
    this.loop(id);
  }

  static async stop() {
    this.running = false;
    this.loopId++;
    if (this.listenTimer) { clearTimeout(this.listenTimer); this.listenTimer = null; }
    try { await SpeechService.stopListening(); } catch {}
    try { await TTSService.stop(); } catch {}
    this.setState('STOPPED');
    FridayLogger.info(TAG, 'conversation stopped');
  }

  /** User said stop / tapped stop: halt TTS safely, keep mic in valid state. */
  static async interrupt() {
    try { await TTSService.stop(); } catch {}
    try { await SpeechService.stopListening(); } catch {}
    if (this.listenTimer) { clearTimeout(this.listenTimer); this.listenTimer = null; }
    this.errors = 0;
    this.setState('STOPPED', 'interrupted by user');
    FridayLogger.info(TAG, 'interrupted');
  }

  private static async loop(id: number) {
    while (this.running && id === this.loopId) {
      try {
        await this.oneTurn(id);
      } catch (e: any) {
        FridayLogger.error(TAG, `loop error: ${e?.message || e}`);
      }
      if (!this.running || id !== this.loopId) break;
      if (!this.continuous) {
        this.setState('IDLE', 'single-shot done');
        this.running = false;
        break;
      }
    }
  }

  private static async oneTurn(id: number) {
    if (!this.running || id !== this.loopId) return;
    this.setState('LISTENING');
    let transcript: string;
    try {
      transcript = await this.listenOnce();
    } catch (e: any) {
      const msg = e?.message || 'listen-failed';
      if (msg === 'no-speech' || msg === 'aborted') {
        FridayLogger.debug(TAG, 'no speech, relistening');
        return; // silent retry
      }
      this.errors++;
      FridayLogger.warn(TAG, `listen failed (${this.errors}): ${msg}`);
      if (this.errors >= MAX_CONSECUTIVE_ERRORS) {
        this.setState('ERROR', msg);
        await this.say("Mic me dikkat aa rahi hai. Dobara try karo.", 'en-US');
        this.errors = 0;
        await this.pause(2000);
      }
      return;
    }
    if (!this.running || id !== this.loopId) return;
    try { this.callbacks.onTranscriptHeard?.(transcript); } catch {}

    // Stop command short-circuits everything.
    if (this.isStopCommand(transcript)) {
      await this.interrupt();
      // Stay stopped; user resumes explicitly. Continuous loop exits.
      this.running = false;
      return;
    }

    this.setState('PROCESSING');
    let reply: string | null = null;
    try {
      reply = await this.withTimeout(
        this.callbacks.onTranscript ? this.callbacks.onTranscript(transcript) : Promise.resolve(null),
        PROCESS_TIMEOUT_MS,
        'AI timeout'
      );
      this.errors = 0;
    } catch (e: any) {
      this.errors++;
      FridayLogger.error(TAG, `process failed: ${e?.message || e}`);
      this.setState('ERROR', 'process failed');
      await this.say('Network me dikkat hai. Dobara bolo.', hasDevanagari(transcript) ? 'hi-IN' : 'en-US');
      return;
    }
    if (!this.running || id !== this.loopId) return;
    if (reply && reply.trim()) {
      this.setState('SPEAKING');
      await this.say(reply.trim(), hasDevanagari(transcript + ' ' + reply) ? 'hi-IN' : 'en-US');
    }
    if (!this.running || id !== this.loopId) return;
    this.setState('FOLLOW_UP');
    await this.pause(FOLLOW_UP_MS);
  }

  private static listenOnce(): Promise<string> {
    return new Promise((resolve, reject) => {
      // Detect reply language next turn: alternate is overkill; default en-US.
      const p = SpeechService.startListening({ lang: 'en-US' });
      if (this.listenTimer) clearTimeout(this.listenTimer);
      this.listenTimer = setTimeout(() => {
        SpeechService.stopListening().catch(() => {});
        reject(new Error('no-speech'));
      }, LISTEN_TIMEOUT_MS);
      p.then(
        (t) => { if (this.listenTimer) clearTimeout(this.listenTimer); resolve(t); },
        (e) => { if (this.listenTimer) clearTimeout(this.listenTimer); reject(e); }
      );
    });
  }

  private static async say(text: string, lang: 'en-US' | 'hi-IN'): Promise<void> {
    try {
      SpeechService.setTtsActive(true);
      await TTSService.speak(text, lang === 'hi-IN' ? { lang: 'hi-IN', rate: 1.05 } : { lang: 'en-US' });
    } finally {
      SpeechService.setTtsActive(false);
    }
  }

  private static withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(label)), ms);
      p.then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); }
      );
    });
  }

  private static pause(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
