/**
 * FaceAuthManager
 * Real face verification using face-api.js — 100% local, koi biometric data
 * device se bahar nahi jaata (spec section 6 & 30).
 *
 * - Register: owner ke 3 face samples -> 128-float descriptor, localStorage me save
 * - Verify: live frame ka descriptor vs saved descriptor (euclidean distance)
 * - Threshold configurable (default 0.5; kam = strict)
 */

import * as faceapi from 'face-api.js';
import {
  FaceError,
  clampBox,
  ensureVerifiedModels,
  parseTensorMismatch,
  validateDescriptor,
  type FaceErrorCode,
} from './FaceModelLoader';

export { FaceError };
export type { FaceErrorCode };

const STORAGE_KEY = 'friday_face_profile';
const MODEL_URL = '/models';

export interface FaceVerificationResult {
  verified: boolean;
  distance: number;
  threshold: number;
  faceDetected: boolean;
}

export class FaceAuthManager {
  private modelsLoaded: boolean = false;
  private loadPromise: Promise<void> | null = null;
  private enrolledDescriptor: number[] | null = null;
  private matchThreshold: number = 0.5;

  constructor() {
    this.loadStoredProfile();
  }

  private loadStoredProfile(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.descriptor) && data.descriptor.length === 128) {
          this.enrolledDescriptor = data.descriptor;
          if (typeof data.threshold === 'number') this.matchThreshold = data.threshold;
          console.log('[FaceAuth] Enrolled face profile loaded from local storage');
        }
      }
    } catch (err) {
      console.error('[FaceAuth] Failed to load stored profile:', err);
    }
  }

  async loadModels(): Promise<void> {
    if (this.modelsLoaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      console.log('[FaceAuth] Loading face models (integrity-verified)...');
      // Verified bytes are served to face-api.js, so a truncated shard can
      // never reach tensor decode: mismatch aborts here as MODEL_LOAD_ERROR.
      await ensureVerifiedModels(MODEL_URL, async () => {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      });
      this.modelsLoaded = true;
      console.log('[FaceAuth] Face models loaded and verified');
    })().catch((e) => {
      // Allow a genuine retry on next open (clears the stuck promise).
      this.loadPromise = null;
      throw e;
    });
    return this.loadPromise;
  }

  areModelsLoaded(): boolean {
    return this.modelsLoaded;
  }

  isEnrolled(): boolean {
    return this.enrolledDescriptor !== null;
  }

  setThreshold(v: number): void {
    this.matchThreshold = Math.min(0.8, Math.max(0.3, v));
    this.persist();
  }

  getThreshold(): number {
    return this.matchThreshold;
  }

  /** Frame must carry real pixels before any inference is attempted. */
  private assertVideoReady(video: HTMLVideoElement): void {
    const w = (video as HTMLVideoElement).videoWidth || 0;
    const h = (video as HTMLVideoElement).videoHeight || 0;
    const ready = (video as HTMLVideoElement).readyState >= 2;
    if (!ready || w <= 0 || h <= 0) {
      throw new FaceError(
        'FRAME_NOT_READY',
        'Camera frame taiyaar nahi hai. Thoda ruk kar dobara try karo.',
        `readyState=${(video as HTMLVideoElement).readyState} video=${w}x${h}`
      );
    }
  }

  /** Ek video frame se face descriptor nikalo (null = chehra nahi mila) */
  async describeFrame(video: HTMLVideoElement): Promise<Float32Array | null> {
    await this.loadModels();
    this.assertVideoReady(video);
    let detection: any;
    try {
      detection = await (faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 })) as any)
        .withFaceLandmarks()
        .withFaceDescriptor();
    } catch (e: any) {
      // A tfjs shape error here means model decode/inference broke mid-run —
      // never a camera problem, never silently swallowed.
      const parsed = parseTensorMismatch(e?.message || '');
      if (parsed) {
        try {
          console.log(
            `[FaceAuth] MODEL_INPUT_MISMATCH expectedShape=${parsed.shape} ` +
            `expectedElements=${parsed.expected} actualElements=${parsed.actual} dataType=float32`
          );
        } catch { /* logging never breaks auth */ }
      }
      throw new FaceError(
        'MODEL_INFERENCE_ERROR',
        'Camera verification temporarily failed. Please try again.',
        `inference failed: ${(e?.message || e).toString().slice(0, 200)}`
      );
    }
    if (!detection) return null;
    // Bounding-box sanity: clamp into frame; reject empty/invalid crops
    // instead of sending garbage downstream.
    const box = detection?.detection?.box;
    const score = detection?.detection?.score;
    if (box && typeof score === 'number') {
      const clamped = clampBox(
        { x: box.x, y: box.y, width: box.width, height: box.height },
        video.videoWidth,
        video.videoHeight
      );
      if (!clamped || score < 0.4) return null;
    }
    const descriptor = detection.descriptor as unknown;
    if (!validateDescriptor(descriptor)) {
      try {
        const len = (descriptor as ArrayLike<number>)?.length;
        console.log(`[FaceAuth] MODEL_INPUT_MISMATCH descriptor invalid length=${len} expected=128`);
      } catch { /* logging never breaks auth */ }
      throw new FaceError(
        'MODEL_INFERENCE_ERROR',
        'Camera verification temporarily failed. Please try again.',
        'descriptor failed validation (length/finite check)'
      );
    }
    return descriptor as Float32Array;
  }

  /** Enrollment: 3 samples ka average descriptor banao + save karo */
  async enrollFromFrames(frames: HTMLVideoElement[]): Promise<{ success: boolean; message: string }> {
    await this.loadModels();
    const descriptors: Float32Array[] = [];
    for (const f of frames) {
      const d = await this.describeFrame(f);
      if (!d) {
        return { success: false, message: 'Kisi frame me chehra saaf nahi dikha. Roshni me chehra seedha camera ki taraf rakho.' };
      }
      descriptors.push(d);
    }
    return this.enrollFromDescriptors(descriptors);
  }

  /** Pehle se nikale descriptors se enroll karo (modal ek-ek sample leta hai) */
  enrollFromDescriptors(descriptors: Float32Array[]): { success: boolean; message: string } {
    if (descriptors.length === 0) {
      return { success: false, message: 'Koi sample nahi mila.' };
    }
    // Samples aapas me milne chahiye (consistency check — photo-spoof basic guard)
    for (let i = 1; i < descriptors.length; i++) {
      if (faceapi.euclideanDistance(descriptors[0], descriptors[i]) > 0.6) {
        return { success: false, message: 'Samples match nahi hue — hile bina 3 photo lo.' };
      }
    }
    const avg = new Array(128).fill(0);
    for (const d of descriptors) {
      for (let i = 0; i < 128; i++) avg[i] += d[i];
    }
    for (let i = 0; i < 128; i++) avg[i] /= descriptors.length;
    this.enrolledDescriptor = avg;
    this.persist();
    console.log('[FaceAuth] Face enrollment complete (local only)');
    return { success: true, message: 'Chehra register ho gaya. Ab JARVIS aapko pehchanega.' };
  }

  /** Live verification: enrolled descriptor se compare karo */
  async verifyFrame(video: HTMLVideoElement): Promise<FaceVerificationResult> {
    if (!this.enrolledDescriptor) {
      return { verified: false, distance: -1, threshold: this.matchThreshold, faceDetected: false };
    }
    const live = await this.describeFrame(video);
    if (!live) {
      return { verified: false, distance: -1, threshold: this.matchThreshold, faceDetected: false };
    }
    const distance = faceapi.euclideanDistance(
      new Float32Array(this.enrolledDescriptor),
      live
    );
    const verified = distance <= this.matchThreshold;
    console.log(`[FaceAuth] Verification: ${verified ? 'MATCH' : 'NO MATCH'} (distance ${distance.toFixed(3)} / threshold ${this.matchThreshold})`);
    return { verified, distance, threshold: this.matchThreshold, faceDetected: true };
  }

  clearProfile(): void {
    this.enrolledDescriptor = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    console.log('[FaceAuth] Face profile cleared');
  }

  private persist(): void {
    try {
      if (this.enrolledDescriptor) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          descriptor: this.enrolledDescriptor,
          threshold: this.matchThreshold,
          updatedAt: Date.now(),
        }));
      }
    } catch (err) {
      console.error('[FaceAuth] Failed to persist profile:', err);
    }
  }
}

export const globalFaceAuthManager = new FaceAuthManager();
