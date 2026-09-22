import { voiceMarkTtsStart } from './VoiceLatency';

/**
 * AudioPlayer
 * Plays 24kHz PCM16 audio chunks received from Gemini Live API using Web Audio API.
 * Uses precise sample scheduling for gapless playback, immediate interruption stopping,
 * and feeds output through an AnalyserNode for audio visualization.
 */

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private nextScheduledTime: number = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private onPlayingStateChange: ((isPlaying: boolean) => void) | null = null;
  private drainTimeout: any = null;
  private audioQueue: AudioBuffer[] = [];
  private isProcessingQueue: boolean = false;
  private minBufferSize: number = 1;
  private maxBufferSize: number = 3;
  /**
   * First chunk of a turn plays immediately instead of waiting for the
   * 2-chunk jitter gate — this is the dominant client-side first-sound
   * saving. Later chunks keep normal jitter protection.
   */
  private turnFresh: boolean = true;

  constructor(onPlayingStateChange?: (isPlaying: boolean) => void) {
    if (onPlayingStateChange) {
      this.onPlayingStateChange = onPlayingStateChange;
    }
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      try {
        this.audioContext = new AudioContextClass({ sampleRate: 24000 });
      } catch {
        this.audioContext = new AudioContextClass();
      }

      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.analyserNode.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    return this.audioContext;
  }

  async playChunk(base64Pcm: string): Promise<void> {
    const ctx = await this.ensureContext();

    try {
      const binary = atob(base64Pcm);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      // Jitter buffer: pehle 2 chunk jama karo taaki beech me gap (rukavat) na aaye.
      // 200ms se zyada wait nahi — latency low rahe.
      // Exception: turn ka PEHLA chunk turant bajao (first-sound latency).
      const queueWasEmpty = this.audioQueue.length === 0 && this.activeSources.length === 0;
      this.audioQueue.push(audioBuffer);
      if (this.audioQueue.length > 12) {
        this.audioQueue.shift(); // bahut pichhe ho gaya to sabse purana drop karo
        this.nextScheduledTime = 0;
      }
      if (this.turnFresh && queueWasEmpty) {
        this.turnFresh = false;
        voiceMarkTtsStart();
        if (!this.isProcessingQueue) this.flushQueue(ctx);
      } else if (!this.isProcessingQueue && (this.audioQueue.length >= 2 || this.activeSources.length > 0)) {
        this.flushQueue(ctx);
      } else if (!this.isProcessingQueue) {
        if (this.drainTimeout) clearTimeout(this.drainTimeout);
        this.drainTimeout = setTimeout(() => {
          if (this.audioQueue.length > 0 && !this.isProcessingQueue) {
            this.flushQueue(ctx);
          }
        }, 200);
      }
    } catch (err) {
      console.error('[AudioPlayer] Chunk decode error:', err);
    }
  }

  private flushQueue(ctx: AudioContext): void {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    if (this.drainTimeout) {
      clearTimeout(this.drainTimeout);
      this.drainTimeout = null;
    }

    while (this.audioQueue.length > 0) {
      const audioBuffer = this.audioQueue.shift()!;

      const now = ctx.currentTime;
      if (this.nextScheduledTime < now) {
        this.nextScheduledTime = now + 0.05;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      if (this.analyserNode) {
        source.connect(this.analyserNode);
      } else {
        source.connect(ctx.destination);
      }

      source.start(this.nextScheduledTime);
      this.nextScheduledTime += audioBuffer.duration;

      this.activeSources.push(source);
      if (this.onPlayingStateChange && this.activeSources.length === 1) {
        this.onPlayingStateChange(true);
      }

      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }

        if (this.activeSources.length === 0 && this.audioQueue.length === 0) {
          if (this.drainTimeout) clearTimeout(this.drainTimeout);
          this.drainTimeout = setTimeout(() => {
            if (this.activeSources.length === 0 && this.audioQueue.length === 0 && this.onPlayingStateChange) {
              this.turnFresh = true; // next chunk starts a fresh turn
              this.onPlayingStateChange(false);
            }
          }, 150);
        }
      };
    }

    this.isProcessingQueue = false;
  }

  /**
   * Stop all active and scheduled audio immediately (e.g., on user interruption)
   */
  stopAll(): void {
    if (this.drainTimeout) {
      clearTimeout(this.drainTimeout);
      this.drainTimeout = null;
    }

    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {}
    }
    this.activeSources = [];
    this.audioQueue = [];
    this.isProcessingQueue = false;
    this.nextScheduledTime = 0;
    this.turnFresh = true;

    if (this.onPlayingStateChange) {
      this.onPlayingStateChange(false);
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  isPlaying(): boolean {
    return this.activeSources.length > 0;
  }

  close(): void {
    this.stopAll();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
  }
}
