/**
 * VoiceLatency — development-only latency markers for the REAL voice pipeline.
 *
 * FRIDAY's voice path is Gemini Live audio-to-audio (mic PCM16 -> Live WS ->
 * 24kHz model audio -> Web Audio playback), NOT an STT→LLM→TTS text chain, so
 * there is no transcription/TTS-generation stage to measure client-side.
 * These markers track what actually exists:
 *
 *   [VOICE] ai_request_start    Live session connect() called
 *   [VOICE] ai_connected        Live session open (server accepted)
 *   [VOICE] ai_response_start   first model audio chunk of the turn
 *   [VOICE] tts_start           first chunk scheduled to Web Audio
 *   [VOICE] audio_playback_start audible output actually started
 *   [VOICE] ai_response_complete model turn complete
 *   [VOICE] interrupted         user interrupted model speech
 *
 * Enabled only when `localStorage.friday_perf === '1'` or in dev builds.
 * Silent in production.
 */

const TURN_TIMEOUT_MS = 30000;

interface TurnMarks {
  aiRequestStart: number;
  aiConnected: number;
  aiResponseStart: number;
  ttsStart: number;
  audioPlaybackStart: number;
}

let enabled: boolean | null = null;
let turn: TurnMarks | null = null;
let turnTimer: ReturnType<typeof setTimeout> | null = null;

export function voicePerfEnabled(): boolean {
  if (enabled !== null) return enabled;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('friday_perf') === '1') {
      enabled = true;
      return true;
    }
  } catch { /* storage unavailable */ }
  try {
    enabled = !!(import.meta as any)?.env?.DEV;
  } catch {
    enabled = false;
  }
  return !!enabled;
}

function now(): number {
  try {
    return performance.now();
  } catch {
    return Date.now();
  }
}

function log(marker: string, extra = ''): void {
  if (!voicePerfEnabled()) return;
  const base = turn ? turn.aiRequestStart || turn.aiResponseStart : 0;
  const delta = base > 0 ? ` +${Math.max(0, Math.round(now() - base))}ms` : '';
  try {
    // eslint-disable-next-line no-console
    console.log(`[VOICE] ${marker}${delta}${extra ? ` ${extra}` : ''}`);
  } catch { /* diagnostics never break voice */ }
}

function ensureTurn(): TurnMarks {
  if (!turn) {
    turn = { aiRequestStart: 0, aiConnected: 0, aiResponseStart: 0, ttsStart: 0, audioPlaybackStart: 0 };
  }
  if (turnTimer) clearTimeout(turnTimer);
  turnTimer = setTimeout(() => { turn = null; }, TURN_TIMEOUT_MS);
  return turn;
}

/** Call when a Live session connect begins (request path opens). */
export function voiceMarkRequestStart(): void {
  if (!voicePerfEnabled()) return;
  turn = { aiRequestStart: now(), aiConnected: 0, aiResponseStart: 0, ttsStart: 0, audioPlaybackStart: 0 };
  log('ai_request_start');
}

/** Call when the Live session reports open. */
export function voiceMarkConnected(): void {
  if (!voicePerfEnabled()) return;
  ensureTurn().aiConnected = now();
  log('ai_connected');
}

/** Call on the first model audio chunk of a turn. */
export function voiceMarkResponseStart(): void {
  if (!voicePerfEnabled()) return;
  const t = ensureTurn();
  if (t.aiResponseStart > 0) return;
  t.aiResponseStart = now();
  log('ai_response_start');
}

/** Call when the first chunk is scheduled to Web Audio. */
export function voiceMarkTtsStart(): void {
  if (!voicePerfEnabled()) return;
  const t = ensureTurn();
  if (t.ttsStart > 0) return;
  t.ttsStart = now();
  log('tts_start');
}

/** Call when audible output actually starts. */
export function voiceMarkPlaybackStart(): void {
  if (!voicePerfEnabled()) return;
  const t = ensureTurn();
  if (t.audioPlaybackStart > 0) return;
  t.audioPlaybackStart = now();
  log('audio_playback_start');
  const firstChunkToSound = t.aiResponseStart > 0 ? Math.round(t.audioPlaybackStart - t.aiResponseStart) : -1;
  if (firstChunkToSound >= 0) {
    try {
      // eslint-disable-next-line no-console
      console.log(`[VOICE] first_chunk_to_sound ${firstChunkToSound}ms`);
    } catch { /* noop */ }
  }
}

/** Call on model turn-complete; prints the turn summary. */
export function voiceMarkTurnComplete(): void {
  if (!voicePerfEnabled() || !turn) return;
  const t = turn;
  const parts: string[] = [];
  if (t.aiResponseStart > 0 && t.ttsStart > 0) parts.push(`response_to_tts=${Math.round(t.ttsStart - t.aiResponseStart)}ms`);
  if (t.ttsStart > 0 && t.audioPlaybackStart > 0) parts.push(`tts_to_sound=${Math.round(t.audioPlaybackStart - t.ttsStart)}ms`);
  log('ai_response_complete', parts.join(' '));
}

/** Call when user speech interrupts model output. */
export function voiceMarkInterrupted(): void {
  if (!voicePerfEnabled()) return;
  log('interrupted');
  turn = null;
  if (turnTimer) { clearTimeout(turnTimer); turnTimer = null; }
}
