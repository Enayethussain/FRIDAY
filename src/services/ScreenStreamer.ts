/**
 * ScreenStreamer
 * Captures live screen, application window, or browser tab video stream
 * via navigator.mediaDevices.getDisplayMedia at 1 FPS.
 * Converts frames into crisp JPEG base64 strings streamed to Gemini Live
 * so FRIDAY can observe, debug code, inspect documents, and teach step-by-step.
 */

export class ScreenStreamer {
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private intervalId: any = null;
  private isRunning: boolean = false;
  private onFrameCallback: ((base64Jpeg: string) => void) | null = null;
  private onEndedCallback: (() => void) | null = null;
  private resolution: { width: number; height: number } = { width: 1920, height: 1080 };
  private streamLabel: string = 'Screen Display';

  async start(
    onFrame: (base64Jpeg: string) => void,
    onEnded?: () => void,
  ): Promise<HTMLVideoElement> {
    this.stop();
    this.onFrameCallback = onFrame;
    this.onEndedCallback = onEnded || null;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('Screen sharing is not available on mobile. Use Camera feed instead — FRIDAY can still see you.');
    }

    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.playsInline = true;
    this.videoElement.muted = true;

    this.canvasElement = document.createElement('canvas');

    // Request screen / window / tab capture with cursor included
    this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'monitor',
        cursor: 'always',
        width: { ideal: 1920, max: 2560 },
        height: { ideal: 1080, max: 1440 },
        frameRate: { ideal: 5, max: 15 },
      } as any,
      audio: false,
    });

    const videoTrack = this.mediaStream.getVideoTracks()[0];
    if (videoTrack) {
      this.streamLabel = videoTrack.label || 'Screen Stream';
      const settings = videoTrack.getSettings();
      if (settings.width && settings.height) {
        this.resolution = { width: settings.width, height: settings.height };
      }

      // Handle user stopping screen share via native browser stop button
      videoTrack.onended = () => {
        console.log('[ScreenStreamer] Screen sharing track ended by user');
        this.stop();
        if (this.onEndedCallback) {
          this.onEndedCallback();
        }
      };
    }

    this.videoElement.srcObject = this.mediaStream;
    await this.videoElement.play();

    this.isRunning = true;

    // Stream 1 frame every 1000ms (1 FPS) optimal for Gemini Live multimodal vision
    this.intervalId = setInterval(() => {
      this.captureAndSendFrame();
    }, 1000);

    // Initial capture frame as soon as stream warms up
    setTimeout(() => {
      this.captureAndSendFrame();
    }, 350);

    return this.videoElement;
  }

  private captureAndSendFrame(): void {
    if (!this.isRunning || !this.videoElement || !this.canvasElement || !this.onFrameCallback) return;
    if (this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const vWidth = this.videoElement.videoWidth || 1280;
    const vHeight = this.videoElement.videoHeight || 720;

    this.resolution = { width: vWidth, height: vHeight };

    // Scale to max width 1024 or max height 768 for fast low-latency transmission while maintaining high text sharpness
    const maxDim = 1024;
    const scale = Math.min(1, maxDim / Math.max(vWidth, vHeight));
    const width = Math.round(vWidth * scale);
    const height = Math.round(vHeight * scale);

    this.canvasElement.width = width;
    this.canvasElement.height = height;

    const ctx = this.canvasElement.getContext('2d');
    if (!ctx) return;

    // Use crisp image smoothing for code and text readability
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(this.videoElement, 0, 0, width, height);

    // Convert to JPEG (0.72 quality ensures small fonts, code keywords, and IDE lines are crisp)
    const dataUrl = this.canvasElement.toDataURL('image/jpeg', 0.72);
    const base64 = dataUrl.split(',')[1];
    if (base64) {
      this.onFrameCallback(base64);
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      this.mediaStream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.canvasElement = null;
    this.onFrameCallback = null;
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  getResolution(): { width: number; height: number } {
    return this.resolution;
  }

  getStreamLabel(): string {
    return this.streamLabel;
  }
}

export const globalScreenStreamer = new ScreenStreamer();
