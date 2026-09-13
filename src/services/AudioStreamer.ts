/**
 * AudioStreamer
 * Captures microphone audio, resamples to 16kHz PCM16 Little-Endian,
 * and streams base64 chunks to the Live session. Also exposes an AnalyserNode
 * for real-time user voice waveform visualization.
 */

import { VoiceAuthManager } from './VoiceAuthManager';

export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private isRunning: boolean = false;
  private onChunkCallback: ((base64Data: string) => void) | null = null;
  private voiceAuth: VoiceAuthManager;
  private voiceAuthEnabled: boolean = false;
  private onUnauthorizedCallback: (() => void) | null = null;
  private voiceThreshold: number = 0.02; // Balanced: voice passes, noise blocked
  private silenceFrames: number = 0;
  private maxSilenceFrames: number = 8;
  private noiseFloor: number = 0;
  private noiseCalibrated: boolean = false;
  private calibrationFrames: number = 0;
  private maxCalibrationFrames: number = 20;
  private consecutiveMatchesRequired: number = 2; // Quick confirm, no starvation
  private consecutiveMatchCount: number = 0;
  private voiceActivityThresholdMultiplier: number = 2.0;
  private noiseGateThreshold: number = 0.5;
  private strictBlocking: boolean = false; // true = unauthorized voice block karo; default OFF taaki awaaz ruke nahi
  private lastAdaptiveThreshold: number = 0.02;
  private lastRms: number = 0;
  private chunksSent: number = 0;
  private chunksBlocked: number = 0;
  private lastStatsLog: number = 0;
  private lastVoiceCheck: { authorized: boolean; confidence: number; at: number } | null = null;

  constructor() {
    this.voiceAuth = new VoiceAuthManager();
  }

  enableVoiceAuth(onUnauthorized?: () => void, strict: boolean = false): void {
    this.voiceAuthEnabled = true;
    this.strictBlocking = strict;
    this.onUnauthorizedCallback = onUnauthorized || null;
    console.log(`[AudioStreamer] Voice authentication enabled (strict blocking: ${strict})`);
  }

  disableVoiceAuth(): void {
    this.voiceAuthEnabled = false;
    console.log('[AudioStreamer] Voice authentication disabled');
  }

  getVoiceAuthManager(): VoiceAuthManager {
    return this.voiceAuth;
  }

  async start(onChunk: (base64Data: string) => void): Promise<void> {
    if (this.isRunning) return;
    this.onChunkCallback = onChunk;

    // Request audio stream (simple constraints = har browser/device pe reliable)
    this.noiseCalibrated = false;
    this.calibrationFrames = 0;
    this.noiseFloor = 0;
    this.chunksSent = 0;
    this.chunksBlocked = 0;
    this.silenceFrames = 0;
    this.consecutiveMatchCount = 0;
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    // Attempt 16kHz context if supported by browser; fallback gracefully
    try {
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
    } catch {
      this.audioContext = new AudioContextClass();
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // Setup Analyser for real-time visualizer
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.8;
    this.sourceNode.connect(this.analyserNode);

    // ScriptProcessor with buffer size 2048 for low latency
    const bufferSize = 2048;
    this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.analyserNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    const inputSampleRate = this.audioContext.sampleRate;
    const targetSampleRate = 16000;

    this.processorNode.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!this.isRunning || !this.onChunkCallback) return;

      const inputChannelData = e.inputBuffer.getChannelData(0);

      // Calculate RMS (Root Mean Square) for energy detection
      let rms = 0;
      for (let i = 0; i < inputChannelData.length; i++) {
        rms += inputChannelData[i] * inputChannelData[i];
      }
      rms = Math.sqrt(rms / inputChannelData.length);

      // Noise floor calibration: sabse SHANT frame = asli background noise.
      // (MAX lene se fan ki ek spike poora threshold uncha kar deti thi.)
      if (!this.noiseCalibrated) {
        if (this.calibrationFrames === 0 || rms < this.noiseFloor) {
          this.noiseFloor = rms;
        }
        this.calibrationFrames++;
        if (this.calibrationFrames >= this.maxCalibrationFrames) {
          this.noiseCalibrated = true;
          this.voiceThreshold = Math.max(0.015, this.noiseFloor * 2.0);
          console.log(`[AudioStreamer] Noise floor calibrated: ${this.noiseFloor.toFixed(4)}, Voice threshold: ${this.voiceThreshold.toFixed(4)}`);
        }
        return; // Skip during calibration
      }

      // Adaptive threshold based on noise floor with hysteresis
      const adaptiveThreshold = Math.max(this.voiceThreshold, this.noiseFloor * 1.5);
      this.lastAdaptiveThreshold = adaptiveThreshold;
      this.lastRms = rms;

      // Voice activity detection: pure silence me hi skip karo
      if (rms < adaptiveThreshold) {
        this.silenceFrames++;
        // Shor kam hua to floor dheere-dheere neeche lao (fan band hua to threshold phir se sahi)
        if (rms < this.noiseFloor) {
          this.noiseFloor = this.noiseFloor * 0.9 + rms * 0.1;
          this.voiceThreshold = Math.max(0.015, this.noiseFloor * 2.0);
        }
        if (this.silenceFrames > this.maxSilenceFrames) {
          this.consecutiveMatchCount = 0;
          this.chunksBlocked++;
          this.logStats();
          return; // Skip sending background noise
        }
        // Hangover frames: pichla gated audio bhejte raho taaki shabd kate nahi
      } else {
        this.silenceFrames = 0;
      }

      // Noise gate - halka filter, awaaz katni nahi chahiye
      let gatedSamples: Float32Array = inputChannelData;
      if (this.silenceFrames === 0) {
        const gated = new Float32Array(inputChannelData.length);
        for (let i = 0; i < inputChannelData.length; i++) {
          const sample = inputChannelData[i];
          gated[i] = Math.abs(sample) > adaptiveThreshold * this.noiseGateThreshold ? sample : 0;
        }
        let gatedRms = 0;
        for (let i = 0; i < gated.length; i++) {
          gatedRms += gated[i] * gated[i];
        }
        gatedRms = Math.sqrt(gatedRms / gated.length);
        if (gatedRms < adaptiveThreshold * 0.35) {
          return;
        }
        gatedSamples = gated;
      }

      // Voice authentication: sirf log karo, audio KABHI block mat karo
      // (enrollment noisy room me hua to apni awaaz bhi DENIED ho jaati hai)
      if (this.voiceAuthEnabled && this.voiceAuth.isVoiceEnrolled() && this.silenceFrames === 0) {
        try {
          const verification = this.voiceAuth.verifyVoice(gatedSamples, inputSampleRate);
          this.lastVoiceCheck = { authorized: verification.authorized, confidence: verification.confidence, at: Date.now() };
          if (!verification.authorized && this.strictBlocking) {
            if (this.onUnauthorizedCallback) {
              try { this.onUnauthorizedCallback(); } catch {}
            }
            return; // Strict mode me hi block karo
          }
        } catch {}
      }

      // Resample to 16000Hz
      let samples16k: Float32Array;
      if (inputSampleRate === targetSampleRate) {
        samples16k = gatedSamples;
      } else {
        samples16k = this.downsampleBuffer(gatedSamples, inputSampleRate, targetSampleRate);
      }

      if (samples16k.length === 0) return;

      // Convert Float32 to 16-bit Linear PCM
      const pcm16 = new Int16Array(samples16k.length);
      for (let i = 0; i < samples16k.length; i++) {
        const s = Math.max(-1, Math.min(1, samples16k[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Convert to Base64
      const uint8 = new Uint8Array(pcm16.buffer);
      let binary = '';
      const chunkLen = 8192;
      for (let i = 0; i < uint8.length; i += chunkLen) {
        const sub = uint8.subarray(i, Math.min(i + chunkLen, uint8.length));
        binary += String.fromCharCode.apply(null, sub as any);
      }
      const base64 = btoa(binary);

      this.chunksSent++;
      this.logStats();
      this.onChunkCallback(base64);
    };

    this.isRunning = true;
  }

  stop(): void {
    this.isRunning = false;
    this.onChunkCallback = null;

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.analyserNode) {
      try {
        this.analyserNode.disconnect();
      } catch {}
      this.analyserNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  isStreaming(): boolean {
    return this.isRunning;
  }

  /** Aakhri voice-biometric check (verifyCommander tool ke liye real data) */
  getLastVoiceCheck(): { authorized: boolean; confidence: number; at: number } | null {
    return this.lastVoiceCheck;
  }

  /** Live mic diagnostics for UI meter + console debugging */
  getMicStats(): { rms: number; threshold: number; noiseFloor: number; sent: number; blocked: number; voiceDetected: boolean; calibrated: boolean } {
    return {
      rms: this.lastRms,
      threshold: this.lastAdaptiveThreshold,
      noiseFloor: this.noiseFloor,
      sent: this.chunksSent,
      blocked: this.chunksBlocked,
      voiceDetected: this.lastRms >= this.lastAdaptiveThreshold,
      calibrated: this.noiseCalibrated,
    };
  }

  private logStats(): void {
    const now = Date.now();
    if (now - this.lastStatsLog > 5000) {
      this.lastStatsLog = now;
      console.log(`[AudioStreamer] rms=${this.lastRms.toFixed(4)} threshold=${this.lastAdaptiveThreshold.toFixed(4)} noise=${this.noiseFloor.toFixed(4)} sent=${this.chunksSent} blocked=${this.chunksBlocked}`);
    }
  }

  private downsampleBuffer(
    buffer: Float32Array,
    sampleRate: number,
    outSampleRate: number,
  ): Float32Array {
    if (outSampleRate >= sampleRate) return buffer;
    const ratio = sampleRate / outSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    return result;
  }
}
