/**
 * HapticFeedbackEngine
 * Utilizes the W3C Vibration API (navigator.vibrate) to provide tactile,
 * cybernetic physical feedback patterns on mobile devices for core state transitions:
 * - connecting (dual ascending pulse)
 * - listening (crisp single pulse)
 * - speaking (rhythmic double pulse)
 * - disconnected (single dampening pulse)
 */

import { AssistantState } from '../types';

const STORAGE_KEY = 'friday_haptics_enabled';

class HapticFeedbackEngine {
  private enabled: boolean = true;
  private lastVibratedAt: number = 0;

  constructor() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        this.enabled = stored === 'true';
      }
    } catch {
      this.enabled = true;
    }
  }

  /**
   * Check whether the Vibration API is supported on the current browser/device
   */
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    );
  }

  /**
   * Whether haptics are enabled by user preference
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Toggle or set haptic feedback enabled state
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {}
    if (enabled) {
      this.vibrate([20, 30, 20]);
    }
  }

  /**
   * Core vibration dispatcher with safety guards & throttling
   */
  vibrate(pattern: number | number[]): boolean {
    if (!this.enabled || !this.isSupported()) return false;

    // Guard against excessive vibration flood (minimum 50ms between triggers)
    const now = Date.now();
    if (now - this.lastVibratedAt < 50) return false;
    this.lastVibratedAt = now;

    try {
      return navigator.vibrate(pattern);
    } catch (err) {
      // In some sandboxed iframes or low-power modes, vibrate might throw SecurityError or NotAllowedError
      console.debug('[HapticFeedback] Vibrate call suppressed:', err);
      return false;
    }
  }

  /**
   * Stop any active vibration pattern immediately
   */
  cancel(): void {
    if (!this.isSupported()) return;
    try {
      navigator.vibrate(0);
    } catch {}
  }

  /**
   * Trigger distinct tactile patterns on core assistant state changes:
   * - 'connecting': Ascending double pulse [35, 45, 40]
   * - 'listening': Crisp single pulse [45]
   * - 'speaking': Rhythmic double tap [25, 40, 30]
   * - 'disconnected': Fade pulse [55]
   */
  triggerStateHaptic(state: AssistantState): void {
    switch (state) {
      case 'connecting':
        // Ascending dual pulse: initial spark + neural link handshake
        this.vibrate([35, 45, 40]);
        break;

      case 'listening':
        // Crisp single pulse: microphone live & ready to receive user voice
        this.vibrate(45);
        break;

      case 'speaking':
        // Rhythmic double pulse: JARVIS generating and streaming response
        this.vibrate([25, 40, 30]);
        break;

      case 'disconnected':
        // Dampening pulse: session closed
        this.vibrate(55);
        break;

      default:
        break;
    }
  }

  /**
   * Light button tap haptic (15ms)
   */
  tap(): void {
    this.vibrate(15);
  }

  /**
   * Success / milestone confirmation haptic
   */
  success(): void {
    this.vibrate([30, 40, 50]);
  }

  /**
   * Alert or error warning haptic
   */
  warning(): void {
    this.vibrate([60, 50, 60]);
  }

  /**
   * Wakeword detection pulse
   */
  wakeword(): void {
    this.vibrate([30, 35, 45]);
  }
}

export const HapticFeedback = new HapticFeedbackEngine();
