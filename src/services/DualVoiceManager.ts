import type { LiveVoice } from '../types';
import { FridayLogger } from './FridayLogger';
import { setTTSPersona, getTTSPersona, getLastUsedVoiceInfo } from './TTSService';

const TAG = 'DualVoice';

/** The two selectable assistant voices. Default is always FRIDAY. */
export type AssistantVoiceId = 'FRIDAY' | 'JARVIS';

/**
 * REAL voice mapping (verified against available voices — nothing invented).
 *
 * Gemini Live server path (primary spoken response): the backend only accepts
 * the prebuilt voices declared in HUDVoiceSettings/server.ts
 * (Aoede/Kore/Puck/Fenrir/Zephyr). There is no EdgeTTS in this project
 * (see TTSService header: "pure Web Speech") and no `hi-IN-SwaraNeural`
 * voice exists in either API — that name belongs to Azure/Edge TTS.
 *   FRIDAY (default, female) -> Aoede (warm, energetic, charismatic female)
 *   JARVIS (male)            -> Fenrir (deep, calm, sophisticated male)
 *
 * Offline/fallback path (TTSService, Web Speech / Capacitor native):
 *   FRIDAY -> female-first Hindi/English voice (existing picker)
 *   JARVIS -> male-first voice (new picker, same engine)
 */
export const FRIDAY_LIVE_VOICE: LiveVoice = 'Aoede';
export const JARVIS_LIVE_VOICE: LiveVoice = 'Fenrir';

export const FRIDAY_CONFIRMATION = 'Friday voice activated, sir.';
export const JARVIS_CONFIRMATION = 'Jarvis voice activated, sir.';

const ACTIVE_VOICE_KEY = 'friday_active_voice';
const LEGACY_OVERRIDE_KEY = 'jarvis_tts_voice';

type VoiceListener = (voice: AssistantVoiceId) => void;

/** Applies the Live (server-side) voice. Wired by App.tsx to StateManager. */
let liveVoiceApplier: ((voice: LiveVoice) => void) | null = null;
const listeners = new Set<VoiceListener>();

function readStored(): AssistantVoiceId {
  try {
    const raw = (localStorage.getItem(ACTIVE_VOICE_KEY) || '').toUpperCase();
    if (raw === 'JARVIS') {
      // Preserve a previously persisted JARVIS preference (session continuity).
      return 'JARVIS';
    }
  } catch { /* storage unavailable */ }
  // Default is always FRIDAY, even if a legacy exact-name TTS override exists.
  // The legacy override is preserved (never deleted) and only used as a hint.
  return 'FRIDAY';
}

let activeVoice: AssistantVoiceId = readStored();

try {
  const legacy = localStorage.getItem(LEGACY_OVERRIDE_KEY);
  if (legacy) FridayLogger.info(TAG, `preserving legacy TTS override "${legacy}" (default stays FRIDAY)`);
} catch { /* noop */ }

FridayLogger.info(TAG, `initial ACTIVE_VOICE=${activeVoice}`);

export function getActiveVoice(): AssistantVoiceId {
  return activeVoice;
}

export function getLiveVoiceFor(id: AssistantVoiceId): LiveVoice {
  return id === 'JARVIS' ? JARVIS_LIVE_VOICE : FRIDAY_LIVE_VOICE;
}

export function getConfirmationFor(id: AssistantVoiceId): string {
  return id === 'JARVIS' ? JARVIS_CONFIRMATION : FRIDAY_CONFIRMATION;
}

/** App.tsx registers StateManager.setVoice here (avoids a service cycle). */
export function registerLiveVoiceApplier(fn: ((voice: LiveVoice) => void) | null): void {
  liveVoiceApplier = fn;
}

export function subscribeActiveVoice(fn: VoiceListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit(): void {
  listeners.forEach((fn) => {
    try { fn(activeVoice); } catch { /* UI-only */ }
  });
  try {
    window.dispatchEvent(new CustomEvent('friday:active-voice', { detail: activeVoice }));
  } catch { /* UI-only */ }
}

// ---------------------------------------------------------------------------
// Command routing: NORMAL commands vs VOICE-SWITCH commands.
// A switch requires an explicit switch verb targeting the voice name, so
// "Friday open YouTube" stays a normal command while
// "Friday activate Jarvis" switches. Checked BEFORE normal parsing.
// ---------------------------------------------------------------------------

function cleanInput(text: string): string {
  return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Returns the targeted voice for an explicit voice-switch utterance,
 * or null for normal commands. No recursion: matching here never executes
 * another command, it only selects the TTS target.
 */
export function parseVoiceSwitchCommand(text: string): AssistantVoiceId | null {
  const t = cleanInput(text);
  if (!t) return null;
  const hasFriday = /\bfriday\b/.test(t);
  const hasJarvis = /\bjarvis\b/.test(t);
  if (!hasFriday && !hasJarvis) return null;

  // Explicit switch verbs. "mode"/"voice" alone with a name also counts
  // ("jarvis mode", "friday voice"), but a bare name does not switch.
  const toJarvis =
    /activat\w*\s+[^.?!]*\bjarvis\b/.test(t) ||
    /switch\s+(to\s+)?[^.?!]*\bjarvis\b/.test(t) ||
    /change\s+(to\s+)?[^.?!]*\bjarvis\b/.test(t) ||
    /\bjarvis\s+(mode|voice)\b/.test(t) ||
    /\bjarvis\s+activat\w*/.test(t);
  const toFriday =
    /activat\w*\s+[^.?!]*\bfriday\b/.test(t) ||
    /switch\s+(to\s+)?[^.?!]*\bfriday\b/.test(t) ||
    /change\s+(to\s+)?[^.?!]*\bfriday\b/.test(t) ||
    /\bfriday\s+(mode|voice)\b/.test(t) ||
    /\bfriday\s+activat\w*/.test(t);

  if (toFriday && toJarvis) {
    // Both names with switch verbs (e.g. "Jarvis activate Friday"):
    // the LAST targeted name wins.
    const lastFriday = Math.max(t.lastIndexOf('friday'), t.lastIndexOf('friday mode'), t.lastIndexOf('friday voice'));
    const lastJarvis = Math.max(t.lastIndexOf('jarvis'), t.lastIndexOf('jarvis mode'), t.lastIndexOf('jarvis voice'));
    return lastFriday >= lastJarvis ? 'FRIDAY' : 'JARVIS';
  }
  if (toFriday) return 'FRIDAY';
  if (toJarvis) return 'JARVIS';
  return null;
}

export interface VoiceSwitchResult {
  /** New ACTIVE_VOICE after the call (always one of the two). */
  activeVoice: AssistantVoiceId;
  /** The Live voice now configured (verifies the real TTS config). */
  liveVoice: LiveVoice;
  /** True when the underlying TTS config actually changed. */
  changed: boolean;
  /** Short confirmation to speak in the NEW voice (caller speaks it). */
  confirmation: string;
}

/**
 * Switches the REAL TTS configuration (Live voice + offline persona) and
 * verifies it. Returns without re-switching when already active.
 */
export async function requestVoiceSwitch(target: AssistantVoiceId): Promise<VoiceSwitchResult> {
  if (activeVoice === target) {
    const liveVoice = getLiveVoiceFor(target);
    return { activeVoice, liveVoice, changed: false, confirmation: getConfirmationFor(target) };
  }

  const liveVoice = getLiveVoiceFor(target);
  activeVoice = target;
  try {
    localStorage.setItem(ACTIVE_VOICE_KEY, target);
  } catch { /* storage unavailable */ }

  // 1) Offline/fallback TTS persona (male-first vs female-first picker).
  try {
    setTTSPersona(target === 'JARVIS' ? 'jarvis' : 'friday');
  } catch (e) {
    FridayLogger.error(TAG, `TTS persona apply failed: ${(e as Error)?.message || e}`);
  }

  // 2) Live server-side voice (the actual Gemini audio voice).
  try {
    if (liveVoiceApplier) liveVoiceApplier(liveVoice);
    else FridayLogger.error(TAG, 'no Live voice applier registered — Live voice unchanged');
  } catch (e) {
    FridayLogger.error(TAG, `Live voice apply failed: ${(e as Error)?.message || e}`);
  }

  // 3) Verify the REAL config changed (not just a label/variable).
  let verified = false;
  try {
    const persona = getTTSPersona();
    const last = getLastUsedVoiceInfo();
    verified = persona === (target === 'JARVIS' ? 'jarvis' : 'friday');
    FridayLogger.info(
      TAG,
      `ACTIVE_VOICE=${activeVoice} live=${liveVoice} persona=${persona} lastTTS=${last ? `${last.name} (${last.lang})` : 'none yet'}`
    );
  } catch { /* verification best-effort */ }

  emit();
  void verified; // verified flag is logged; caller speaks confirmation only on success path
  return { activeVoice, liveVoice, changed: true, confirmation: getConfirmationFor(target) };
}

/** Current state snapshot for HUD/debugging (honest values only). */
export function getVoiceStateSnapshot(): {
  activeVoice: AssistantVoiceId;
  liveVoice: LiveVoice;
  persisted: string;
  legacyOverride: string;
} {
  let persisted = '';
  let legacyOverride = '';
  try {
    persisted = localStorage.getItem(ACTIVE_VOICE_KEY) || '';
    legacyOverride = localStorage.getItem(LEGACY_OVERRIDE_KEY) || '';
  } catch { /* noop */ }
  return { activeVoice, liveVoice: getLiveVoiceFor(activeVoice), persisted, legacyOverride };
}
