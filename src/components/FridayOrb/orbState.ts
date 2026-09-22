import type { AssistantState } from '../../types';
import { ORB_TIMING } from './orbConfig';

/**
 * Visual states the orb can display. Every state is backed by a REAL
 * application signal (see OrbSignals) — the orb never invents activity.
 */
export type OrbVisualState =
  | 'sleep'      // disconnected: dormant, dim, slow breathing
  | 'idle'       // connected but quiet (reserved for future idle signal)
  | 'wake'       // wake-word / connect activation cinematic (timed)
  | 'listening'  // microphone actively streaming
  | 'thinking'   // channel connecting / model turn gap (connecting)
  | 'processing' // tool call in its first moments
  | 'speaking'   // TTS/live audio actually playing
  | 'executing'  // tool call running (device doing work)
  | 'gesture'    // hand-tracking camera live, no higher-priority activity
  | 'success'    // tool call finished OK (timed pulse)
  | 'error';     // real error arrived (timed accent, then back)

export interface OrbSignals {
  assistant: AssistantState;
  /** true while ToolManager.executeCalls is in flight (real device work) */
  toolActive: boolean;
  /** performance.now() timestamp of last wake-word / connect event */
  wakeAt: number | null;
  /** when the current tool burst started (performance.now()) */
  toolStartAt: number | null;
  /** last finished tool burst */
  lastResult: { ok: boolean; at: number } | null;
  /** performance.now() timestamp of last real error */
  errorAt: number | null;
  /** hand-tracking camera actually streaming (not a claim of activity) */
  gestureActive: boolean;
}

export const ORB_STATE_LABEL: Record<OrbVisualState, string> = {
  sleep: 'STANDBY',
  idle: 'ONLINE',
  wake: 'AWAKENING',
  listening: 'LISTENING',
  thinking: 'THINKING',
  processing: 'PROCESSING',
  speaking: 'SPEAKING',
  executing: 'EXECUTING',
  gesture: 'GESTURE ACTIVE',
  success: 'SUCCESS',
  error: 'ALERT',
};

/**
 * Pure resolver: signals in, visual state out.
 * Priority: error pulse > success pulse > wake cinematic > live activity.
 */
export function resolveOrbState(s: OrbSignals, now: number): OrbVisualState {
  if (s.errorAt !== null && now - s.errorAt < ORB_TIMING.errorMs) return 'error';
  if (s.lastResult && now - s.lastResult.at < ORB_TIMING.successMs) {
    return s.lastResult.ok ? 'success' : 'error';
  }
  if (s.wakeAt !== null && now - s.wakeAt < ORB_TIMING.wakeMs && s.assistant !== 'disconnected') return 'wake';
  if (s.toolActive) {
    if (s.toolStartAt !== null && now - s.toolStartAt < ORB_TIMING.processingMs) return 'processing';
    return 'executing';
  }
  switch (s.assistant) {
    case 'disconnected': return s.gestureActive ? 'gesture' : 'sleep';
    case 'connecting': return 'thinking';
    case 'listening': return 'listening';
    case 'speaking': return 'speaking';
    default: return 'idle';
  }
}
