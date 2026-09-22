import { FunctionCallItem, FunctionResponseItem } from '../types';
import { wsUrl, getServerBase } from '../lib/serverUrl';
import { voiceMarkConnected, voiceMarkRequestStart } from './VoiceLatency';

export interface LiveSessionCallbacks {
  onConnected?: () => void;
  onAudioChunk?: (audioBase64: string) => void;
  onInterrupted?: () => void;
  onTurnComplete?: () => void;
  onToolCall?: (functionCalls: FunctionCallItem[]) => void;
  onError?: (errorMessage: string) => void;
  onClosed?: () => void;
}

export class LiveSession {
  private ws: WebSocket | null = null;
  private callbacks: LiveSessionCallbacks;
  private isConnected: boolean = false;

  constructor(callbacks: LiveSessionCallbacks = {}) {
    this.callbacks = callbacks;
  }

  setCallbacks(callbacks: LiveSessionCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  connect(
    voiceName: string = 'Aoede',
    context?: {
      commanderName?: string;
      callSign?: string;
      clearance?: string;
      enforceOnly?: boolean;
      memoriesDigest?: string;
      curriculumDigest?: string;
      routineAndPrefsDigest?: string;
    }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.disconnect();
      voiceMarkRequestStart();

      if (getServerBase() === '' && (window.location.protocol === 'capacitor:' || window.location.protocol === 'file:')) {
        return reject(new Error('No server configured. Set FRIDAY_SERVER_URL to your hosted backend (https://...) in Settings.'));
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams();
      params.set('voice', voiceName);

      const wsUrlStr = wsUrl(`/live?${params.toString()}`);

      console.log(`[LiveSession] Connecting to WebSocket: ${wsUrlStr}`);
      try {
        this.ws = new WebSocket(wsUrlStr);
      } catch (err) {
        return reject(err);
      }

      let hasResolved = false;

      this.ws.onopen = () => {
        console.log('[LiveSession] WebSocket connection open');
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'setup', context: context || {} }));
        }
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'connected':
              this.isConnected = true;
              voiceMarkConnected();
              if (!hasResolved) {
                hasResolved = true;
                resolve();
              }
              this.callbacks.onConnected?.();
              break;

            case 'audio':
              if (msg.audio) {
                this.callbacks.onAudioChunk?.(msg.audio);
              }
              break;

            case 'interrupted':
              console.log('[LiveSession] Interruption received from model');
              this.callbacks.onInterrupted?.();
              break;

            case 'turnComplete':
              this.callbacks.onTurnComplete?.();
              break;

            case 'toolCall':
              if (msg.functionCalls) {
                this.callbacks.onToolCall?.(msg.functionCalls);
              }
              break;

            case 'error':
              console.error('[LiveSession] Error from server:', msg.error);
              this.callbacks.onError?.(msg.error || 'Server error');
              if (!hasResolved) {
                hasResolved = true;
                reject(new Error(msg.error || 'Connection failed'));
              }
              break;

            case 'closed':
              this.callbacks.onClosed?.();
              break;
          }
        } catch (err) {
          console.error('[LiveSession] Message parsing error:', err);
        }
      };

      this.ws.onerror = (event) => {
        console.error('[LiveSession] WebSocket error:', event);
        const err = new Error('WebSocket connection error');
        if (!hasResolved) {
          hasResolved = true;
          reject(err);
        }
        this.callbacks.onError?.('Network connection failed. Ensure server is running.');
      };

      this.ws.onclose = () => {
        console.log('[LiveSession] WebSocket closed');
        this.isConnected = false;
        this.callbacks.onClosed?.();
      };
    });
  }

  sendAudio(base64Data: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'audio', data: base64Data }));
  }

  sendVideo(base64Jpeg: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'video', data: base64Jpeg }));
  }

  sendToolResponse(functionResponses: FunctionResponseItem[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'toolResponse', functionResponses }));
  }

  disconnect(): void {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'disconnect' }));
        } catch {}
      }
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.isConnected = false;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}
