/**
 * VoiceAuthManager
 * Voice biometric authentication system
 * Analyzes voice patterns (pitch, tempo, formants) to verify authorized user
 */

interface VoiceProfile {
  meanPitch: number;
  pitchVariance: number;
  spectralCentroid: number;
  zeroCrossingRate: number;
  energy: number;
}

export class VoiceAuthManager {
  private authorizedProfile: VoiceProfile | null = null;
  private isEnrolled: boolean = false;
  private enrollmentSamples: VoiceProfile[] = [];
  private requiredEnrollmentSamples: number = 5;
  private matchThreshold: number = 0.75;

  constructor() {
    this.loadProfile();
  }

  private loadProfile(): void {
    try {
      const stored = localStorage.getItem('friday_voice_profile');
      if (stored) {
        const data = JSON.parse(stored);
        this.authorizedProfile = data.profile;
        this.isEnrolled = data.enrolled || false;
        console.log('[VoiceAuth] Authorized voice profile loaded');
      }
    } catch (err) {
      console.error('[VoiceAuth] Failed to load profile:', err);
    }
  }

  private saveProfile(): void {
    try {
      localStorage.setItem('friday_voice_profile', JSON.stringify({
        profile: this.authorizedProfile,
        enrolled: this.isEnrolled,
        timestamp: Date.now()
      }));
      console.log('[VoiceAuth] Voice profile saved');
    } catch (err) {
      console.error('[VoiceAuth] Failed to save profile:', err);
    }
  }

  private extractVoiceFeatures(audioData: Float32Array, sampleRate: number): VoiceProfile {
    // Calculate pitch (fundamental frequency) using autocorrelation
    const pitch = this.estimatePitch(audioData, sampleRate);
    
    // Calculate spectral centroid (brightness of voice)
    const spectralCentroid = this.calculateSpectralCentroid(audioData, sampleRate);
    
    // Calculate zero crossing rate (voice texture)
    const zcr = this.calculateZeroCrossingRate(audioData);
    
    // Calculate energy
    let energy = 0;
    for (let i = 0; i < audioData.length; i++) {
      energy += audioData[i] * audioData[i];
    }
    energy = Math.sqrt(energy / audioData.length);

    // Calculate pitch variance
    const pitchVariance = this.calculatePitchVariance(audioData, sampleRate);

    return {
      meanPitch: pitch,
      pitchVariance,
      spectralCentroid,
      zeroCrossingRate: zcr,
      energy
    };
  }

  private estimatePitch(audioData: Float32Array, sampleRate: number): number {
    const minFreq = 80;  // Min human voice ~80Hz
    const maxFreq = 400; // Max typical human voice ~400Hz
    const minPeriod = Math.floor(sampleRate / maxFreq);
    const maxPeriod = Math.floor(sampleRate / minFreq);

    let bestPeriod = minPeriod;
    let bestCorrelation = -1;

    for (let period = minPeriod; period <= maxPeriod; period++) {
      let correlation = 0;
      for (let i = 0; i < audioData.length - period; i++) {
        correlation += audioData[i] * audioData[i + period];
      }
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestPeriod = period;
      }
    }

    return sampleRate / bestPeriod;
  }

  private calculatePitchVariance(audioData: Float32Array, sampleRate: number): number {
    const windowSize = Math.floor(sampleRate * 0.03); // 30ms windows
    const pitches: number[] = [];

    for (let i = 0; i < audioData.length - windowSize; i += windowSize) {
      const window = audioData.slice(i, i + windowSize);
      const pitch = this.estimatePitch(window, sampleRate);
      if (pitch > 0) pitches.push(pitch);
    }

    if (pitches.length === 0) return 0;

    const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
    const variance = pitches.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / pitches.length;
    return Math.sqrt(variance);
  }

  private calculateSpectralCentroid(audioData: Float32Array, sampleRate: number): number {
    const fftSize = 512;
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);

    for (let i = 0; i < Math.min(fftSize, audioData.length); i++) {
      real[i] = audioData[i];
    }

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < fftSize / 2; i++) {
      const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
      const frequency = (i * sampleRate) / fftSize;
      numerator += frequency * magnitude;
      denominator += magnitude;
    }

    return denominator > 0 ? numerator / denominator : 0;
  }

  private calculateZeroCrossingRate(audioData: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < audioData.length; i++) {
      if ((audioData[i] >= 0 && audioData[i - 1] < 0) || 
          (audioData[i] < 0 && audioData[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / audioData.length;
  }

  private compareProfiles(profile1: VoiceProfile, profile2: VoiceProfile): number {
    // Weighted similarity calculation
    const pitchDiff = Math.abs(profile1.meanPitch - profile2.meanPitch) / Math.max(profile1.meanPitch, profile2.meanPitch);
    const pitchVarDiff = Math.abs(profile1.pitchVariance - profile2.pitchVariance) / Math.max(profile1.pitchVariance, profile2.pitchVariance, 1);
    const centroidDiff = Math.abs(profile1.spectralCentroid - profile2.spectralCentroid) / Math.max(profile1.spectralCentroid, profile2.spectralCentroid);
    const zcrDiff = Math.abs(profile1.zeroCrossingRate - profile2.zeroCrossingRate);
    const energyDiff = Math.abs(profile1.energy - profile2.energy) / Math.max(profile1.energy, profile2.energy);

    // Weighted average (pitch is most important)
    const similarity = 1 - (
      pitchDiff * 0.35 +
      pitchVarDiff * 0.2 +
      centroidDiff * 0.25 +
      zcrDiff * 0.1 +
      energyDiff * 0.1
    );

    return Math.max(0, Math.min(1, similarity));
  }

  enrollVoiceSample(audioData: Float32Array, sampleRate: number): { progress: number; complete: boolean } {
    const features = this.extractVoiceFeatures(audioData, sampleRate);
    this.enrollmentSamples.push(features);

    console.log(`[VoiceAuth] Enrollment sample ${this.enrollmentSamples.length}/${this.requiredEnrollmentSamples}`);

    if (this.enrollmentSamples.length >= this.requiredEnrollmentSamples) {
      // Average all samples to create master profile
      this.authorizedProfile = {
        meanPitch: this.enrollmentSamples.reduce((s, p) => s + p.meanPitch, 0) / this.enrollmentSamples.length,
        pitchVariance: this.enrollmentSamples.reduce((s, p) => s + p.pitchVariance, 0) / this.enrollmentSamples.length,
        spectralCentroid: this.enrollmentSamples.reduce((s, p) => s + p.spectralCentroid, 0) / this.enrollmentSamples.length,
        zeroCrossingRate: this.enrollmentSamples.reduce((s, p) => s + p.zeroCrossingRate, 0) / this.enrollmentSamples.length,
        energy: this.enrollmentSamples.reduce((s, p) => s + p.energy, 0) / this.enrollmentSamples.length
      };

      this.isEnrolled = true;
      this.saveProfile();
      console.log('[VoiceAuth] Voice enrollment complete:', this.authorizedProfile);

      return { progress: 1, complete: true };
    }

    return { 
      progress: this.enrollmentSamples.length / this.requiredEnrollmentSamples, 
      complete: false 
    };
  }

  verifyVoice(audioData: Float32Array, sampleRate: number): { authorized: boolean; confidence: number } {
    if (!this.isEnrolled || !this.authorizedProfile) {
      console.warn('[VoiceAuth] No enrolled voice profile');
      return { authorized: false, confidence: 0 };
    }

    const features = this.extractVoiceFeatures(audioData, sampleRate);
    // Khamoshi/near-zero energy pe compare bekar hai (NaN aata hai) — seedha reject
    if (!isFinite(features.energy) || features.energy < 1e-6) {
      return { authorized: false, confidence: 0 };
    }
    let confidence = this.compareProfiles(features, this.authorizedProfile);
    if (!isFinite(confidence)) confidence = 0;

    const authorized = confidence >= this.matchThreshold;

    console.log(`[VoiceAuth] Voice verification: ${authorized ? 'AUTHORIZED' : 'DENIED'} (confidence: ${(confidence * 100).toFixed(1)}%)`);

    return { authorized, confidence };
  }

  isVoiceEnrolled(): boolean {
    return this.isEnrolled;
  }

  resetEnrollment(): void {
    this.enrollmentSamples = [];
    console.log('[VoiceAuth] Enrollment reset');
  }

  clearProfile(): void {
    this.authorizedProfile = null;
    this.isEnrolled = false;
    this.enrollmentSamples = [];
    localStorage.removeItem('friday_voice_profile');
    console.log('[VoiceAuth] Voice profile cleared');
  }

  setMatchThreshold(threshold: number): void {
    this.matchThreshold = Math.max(0, Math.min(1, threshold));
    console.log(`[VoiceAuth] Match threshold set to ${(this.matchThreshold * 100).toFixed(0)}%`);
  }
}
