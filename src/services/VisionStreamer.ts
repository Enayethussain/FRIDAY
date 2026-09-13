/**
 * VisionStreamer
 * Captures video frames from the webcam or mobile camera at 1 FPS,
 * converts frames into lightweight JPEG base64 strings, and streams them
 * to the Live API session for real-time multimodal visual perception.
 */

export class VisionStreamer {
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private intervalId: any = null;
  private isRunning: boolean = false;
  private facingMode: 'user' | 'environment' = 'user';
  private onFrameCallback: ((base64Jpeg: string) => void) | null = null;

  async start(
    onFrame: (base64Jpeg: string) => void,
    facingMode: 'user' | 'environment' = 'user',
  ): Promise<HTMLVideoElement> {
    this.stop();
    this.facingMode = facingMode;
    this.onFrameCallback = onFrame;

    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.playsInline = true;
    this.videoElement.muted = true;

    this.canvasElement = document.createElement('canvas');

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: this.facingMode,
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
      },
      audio: false,
    });

    this.videoElement.srcObject = this.mediaStream;
    await this.videoElement.play();

    this.isRunning = true;

    // Send 1 frame every 1000ms (1 FPS) to adhere to Live API recommendations
    this.intervalId = setInterval(() => {
      this.captureAndSendFrame();
    }, 1000);

    // Capture initial frame immediately after slight delay for camera warmup
    setTimeout(() => {
      this.captureAndSendFrame();
    }, 400);

    return this.videoElement;
  }

  private captureAndSendFrame(): void {
    if (!this.isRunning || !this.videoElement || !this.canvasElement || !this.onFrameCallback) return;
    if (this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const vWidth = this.videoElement.videoWidth || 640;
    const vHeight = this.videoElement.videoHeight || 480;

    // Scale down to max 512px width for fast low-latency transmission
    const scale = Math.min(1, 512 / Math.max(vWidth, vHeight));
    const width = Math.round(vWidth * scale);
    const height = Math.round(vHeight * scale);

    this.canvasElement.width = width;
    this.canvasElement.height = height;

    const ctx = this.canvasElement.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(this.videoElement, 0, 0, width, height);

    // Convert to JPEG (0.6 quality is optimal for Gemini Live vision)
    const dataUrl = this.canvasElement.toDataURL('image/jpeg', 0.6);
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
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.canvasElement = null;
    this.onFrameCallback = null;
  }

  async toggleFacingMode(onFrame: (base64Jpeg: string) => void): Promise<HTMLVideoElement> {
    const nextMode = this.facingMode === 'user' ? 'environment' : 'user';
    return this.start(onFrame, nextMode);
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  getFacingMode(): 'user' | 'environment' {
    return this.facingMode;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }
}
