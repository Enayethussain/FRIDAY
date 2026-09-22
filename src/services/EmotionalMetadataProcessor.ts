import { EmotionalMetadata, EmotionalTone } from '../types';

interface ToneProfile {
  tone: EmotionalTone;
  valence: number;
  arousal: number;
  glowIntensity: number;
  pulseFrequency: number;
  ambientColor: string;
  label: string;
  summary: string;
}

export const TONE_PROFILES: Record<EmotionalTone, ToneProfile> = {
  neutral: {
    tone: 'neutral',
    valence: 0.0,
    arousal: 0.3,
    glowIntensity: 1.0,
    pulseFrequency: 1.0,
    ambientColor: '#FFC400', // Cyan
    label: 'EQUILIBRIUM',
    summary: 'Balanced cybernetic baseline',
  },
  joyful: {
    tone: 'joyful',
    valence: 0.85,
    arousal: 0.75,
    glowIntensity: 1.65,
    pulseFrequency: 2.1,
    ambientColor: '#f59e0b', // Amber / Gold
    label: 'JOYFUL VIBRANCY',
    summary: 'Warm, positive euphoric resonance',
  },
  excited: {
    tone: 'excited',
    valence: 0.95,
    arousal: 0.95,
    glowIntensity: 2.2,
    pulseFrequency: 3.0,
    ambientColor: '#eab308', // Electric Gold
    label: 'HIGH-ENERGY KINETICS',
    summary: 'Intense enthusiasm & rapid excitation',
  },
  empathetic: {
    tone: 'empathetic',
    valence: 0.6,
    arousal: 0.25,
    glowIntensity: 1.3,
    pulseFrequency: 0.65,
    ambientColor: '#f43f5e', // Warm Rose
    label: 'EMPATHIC ATTUNEMENT',
    summary: 'Soft, gentle compassionate breathing',
  },
  playful: {
    tone: 'playful',
    valence: 0.75,
    arousal: 0.7,
    glowIntensity: 1.55,
    pulseFrequency: 1.85,
    ambientColor: '#a855f7', // Violet
    label: 'PLAYFUL WIT',
    summary: 'Banter, humor & sparkling cadence',
  },
  thoughtful: {
    tone: 'thoughtful',
    valence: 0.2,
    arousal: 0.2,
    glowIntensity: 0.85,
    pulseFrequency: 0.55,
    ambientColor: '#6366f1', // Indigo Sapphire
    label: 'CONTEMPLATION',
    summary: 'Deep reflective processing',
  },
  alert: {
    tone: 'alert',
    valence: -0.25,
    arousal: 0.85,
    glowIntensity: 1.9,
    pulseFrequency: 2.7,
    ambientColor: '#ef4444', // Crimson
    label: 'ALERT RESONANCE',
    summary: 'Urgent focus & critical awareness',
  },
};

export class EmotionalMetadataProcessor {
  private currentTone: EmotionalTone = 'neutral';
  private targetValence: number = 0.0;
  private currentValence: number = 0.0;

  private targetArousal: number = 0.3;
  private currentArousal: number = 0.3;

  private targetGlow: number = 1.0;
  private currentGlow: number = 1.0;

  private targetFrequency: number = 1.0;
  private currentFrequency: number = 1.0;

  private ambientColor: string = '#FFC400';
  private label: string = 'EQUILIBRIUM';
  private summary: string = 'Balanced cybernetic baseline';

  private listeners: Set<(metadata: EmotionalMetadata) => void> = new Set();
  private animationFrameId: number | null = null;
  private isProcessing: boolean = false;

  // Audio frequency buffer for prosodic pitch & energy analysis
  private audioBuffer = new Uint8Array(128);

  constructor() {
    this.applyProfile('neutral');
  }

  public start() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.loop();
  }

  public stop() {
    this.isProcessing = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public subscribe(cb: (meta: EmotionalMetadata) => void): () => void {
    this.listeners.add(cb);
    cb(this.getMetadata());
    return () => this.listeners.delete(cb);
  }

  public getMetadata(): EmotionalMetadata {
    return {
      tone: this.currentTone,
      valence: Math.round(this.currentValence * 100) / 100,
      arousal: Math.round(this.currentArousal * 100) / 100,
      glowIntensity: Math.round(this.currentGlow * 100) / 100,
      pulseFrequency: Math.round(this.currentFrequency * 100) / 100,
      pulseDuration: Math.max(0.25, Math.round((1 / Math.max(0.2, this.currentFrequency)) * 100) / 100),
      ambientColor: this.ambientColor,
      label: this.label,
      summary: this.summary,
    };
  }

  public setTone(
    tone: EmotionalTone,
    customValence?: number,
    customArousal?: number,
    customSummary?: string
  ) {
    this.currentTone = tone;
    const profile = TONE_PROFILES[tone] || TONE_PROFILES.neutral;

    this.targetValence = typeof customValence === 'number' ? customValence : profile.valence;
    this.targetArousal = typeof customArousal === 'number' ? customArousal : profile.arousal;
    this.targetGlow = profile.glowIntensity;
    this.targetFrequency = profile.pulseFrequency;
    this.ambientColor = profile.ambientColor;
    this.label = profile.label;
    this.summary = customSummary || profile.summary;
  }

  public applyProfile(tone: EmotionalTone) {
    this.setTone(tone);
  }

  /**
   * Evaluates acoustic energy and prosody from the active audio analyser (mic or speaker)
   * Modulates current arousal and glow in real-time.
   */
  public processAcoustics(analyser: AnalyserNode | null) {
    if (!analyser) return;

    try {
      analyser.getByteFrequencyData(this.audioBuffer);

      let sum = 0;
      let weightedFreqSum = 0;
      const count = this.audioBuffer.length;

      for (let i = 0; i < count; i++) {
        const val = this.audioBuffer[i];
        sum += val;
        weightedFreqSum += val * i;
      }

      const average = sum / count; // 0..255
      const normalizedEnergy = Math.min(1.0, average / 140); // 0..1.0

      // Calculate spectral centroid (brightness/pitch tilt)
      const centroid = sum > 0 ? (weightedFreqSum / sum) / count : 0.2;

      // Acoustic modulation adds dynamic flare to target glow & frequency
      const acousticGlowBoost = normalizedEnergy * 0.45;
      const acousticFreqBoost = normalizedEnergy * (0.4 + centroid * 0.6);

      const baseProfile = TONE_PROFILES[this.currentTone] || TONE_PROFILES.neutral;
      this.targetGlow = baseProfile.glowIntensity + acousticGlowBoost;
      this.targetFrequency = baseProfile.pulseFrequency + acousticFreqBoost;
    } catch {
      // Audio context might be closed or uninitialized
    }
  }

  /**
   * Smooth physics-based exponential interpolation loop (60 FPS)
   */
  private loop = () => {
    if (!this.isProcessing) return;

    const lerpFactor = 0.08; // Buttery smooth easing
    this.currentValence += (this.targetValence - this.currentValence) * lerpFactor;
    this.currentArousal += (this.targetArousal - this.currentArousal) * lerpFactor;
    this.currentGlow += (this.targetGlow - this.currentGlow) * lerpFactor;
    this.currentFrequency += (this.targetFrequency - this.currentFrequency) * lerpFactor;

    const metadata = this.getMetadata();
    this.listeners.forEach((cb) => cb(metadata));

    this.animationFrameId = requestAnimationFrame(this.loop);
  };
}

export const globalEmotionalProcessor = new EmotionalMetadataProcessor();
