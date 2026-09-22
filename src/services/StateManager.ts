import {
  ActionCard,
  AssistantState,
  CountdownTimer,
  EmotionalMetadata,
  EmotionalTone,
  FunctionCallItem,
  HologramControlAction,
  HologramState,
  LiveVoice,
  MediaViewportState,
  MemoryItem,
  NoteItem,
  PCFileItem,
  StudyCurriculum,
  TaskItem,
  ThemeAccent,
  WeatherInfo,
  WitLevel,
  ProtocolId,
} from '../types';
import { AudioPlayer } from './AudioPlayer';
import { AudioStreamer } from './AudioStreamer';
import { EmotionalMetadataProcessor, globalEmotionalProcessor } from './EmotionalMetadataProcessor';
import { LiveSession } from './LiveSession';
import { ToolManager } from './ToolManager';
import { VisionStreamer } from './VisionStreamer';
import { ScreenStreamer } from './ScreenStreamer';
import { globalAuthManager } from './AuthManager';
import { globalMemoryManager } from './MemoryManager';
import { globalCurriculumManager } from './CurriculumManager';
import { globalWakewordManager } from './WakewordManager';
import { globalRoutinePreferenceManager } from './RoutinePreferenceManager';
import { SoundEffects } from '../utils/SoundEffects';
import { HapticFeedback } from '../utils/HapticFeedback';

export interface StateManagerListeners {
  onStateChange: (state: AssistantState) => void;
  onError: (message: string) => void;
  /** Real tool-burst activity for the orb (processing/executing/success visuals). */
  onOrbActivity?: (e: { type: 'tool-start' } | { type: 'tool-end'; ok: boolean }) => void;
  onActionCard: (card: ActionCard) => void;
  onTimerCreated: (timer: CountdownTimer) => void;
  onThemeChanged: (accent: ThemeAccent) => void;
  onMediaViewport: (viewport: MediaViewportState) => void;
  onWeatherUpdated: (weather: WeatherInfo) => void;
  onNotesChanged: (notes: NoteItem[]) => void;
  onTasksChanged: (tasks: TaskItem[]) => void;
  onFilesChanged: (files: PCFileItem[]) => void;
  onMemoriesChanged: (memories: MemoryItem[]) => void;
  onCurriculumChanged: (curriculum: StudyCurriculum) => void;
  onCameraStateChange: (isActive: boolean) => void;
  onScreenStateChange: (isActive: boolean) => void;
  onEmotionalMetadataChange: (metadata: EmotionalMetadata) => void;
  onOpenWorkbench: (code?: string, language?: string) => void;
  onTriggerProtocol: (protocolId: ProtocolId) => void;
  onOpenKnowledgeGraph: () => void;
  onOpenDebrief: () => void;
  onOpenCalculator: (expression?: string) => void;
  onOpenPrivateVault: () => void;
  onOpenRoutinePreferences: () => void;
  onOpenDesktopBridge: () => void;
  onHologram: (h: HologramState) => void;
  onHologramControl: (action: HologramControlAction, degrees?: number) => void;
  onHologramCompare: (a: HologramState, b: HologramState) => void;
  onHologramLibrary: () => void;
}

export class StateManager {
  private state: AssistantState = 'disconnected';
  private streamer: AudioStreamer;
  private visionStreamer: VisionStreamer;
  private screenStreamer: ScreenStreamer;
  private player: AudioPlayer;
  private session: LiveSession;
  private toolManager: ToolManager;
  private listeners: Partial<StateManagerListeners> = {};
  // FRIDAY is the default voice (warm female Aoede). JARVIS uses Fenrir.
  private selectedVoice: LiveVoice = 'Aoede';
  private witLevel: WitLevel = 'witty';
  private emotionalProcessor: EmotionalMetadataProcessor = globalEmotionalProcessor;
  private acousticPollTimer: any = null;
  private interruptTimer: any = null;

  constructor() {
    this.streamer = new AudioStreamer();
    this.visionStreamer = new VisionStreamer();
    this.screenStreamer = new ScreenStreamer();

    this.player = new AudioPlayer((isPlaying) => {
      if (this.state === 'disconnected' || this.state === 'connecting') return;
      if (isPlaying) {
        this.setState('speaking');
      } else {
        this.setState('listening');
      }
    });

    this.toolManager = new ToolManager({
      onActionCard: (card) => this.listeners.onActionCard?.(card),
      onSetTimer: (seconds, label) => {
        const timer: CountdownTimer = {
          id: `timer-${Date.now()}`,
          label,
          totalSeconds: seconds,
          remainingSeconds: seconds,
          isRunning: true,
        };
        this.listeners.onTimerCreated?.(timer);
      },
      onSetTheme: (accent) => this.listeners.onThemeChanged?.(accent),
      onOpenMediaViewport: (viewport) => this.listeners.onMediaViewport?.(viewport),
      onOpenHologram: (h) => this.listeners.onHologram?.(h),
      onControlHologram: (action, degrees) => this.listeners.onHologramControl?.(action, degrees),
      onCompareHolograms: (a, b) => this.listeners.onHologramCompare?.(a, b),
      onOpenHologramLibrary: () => this.listeners.onHologramLibrary?.(),
      onWeatherUpdated: (weather) => this.listeners.onWeatherUpdated?.(weather),
      onNotesChanged: (notes) => this.listeners.onNotesChanged?.(notes),
      onTasksChanged: (tasks) => this.listeners.onTasksChanged?.(tasks),
      onFilesChanged: (files) => this.listeners.onFilesChanged?.(files),
      onMemoriesChanged: (memories) => this.listeners.onMemoriesChanged?.(memories),
      onCurriculumChanged: (curriculum) => this.listeners.onCurriculumChanged?.(curriculum),
      onEmotionalToneChanged: (tone, valence, arousal, rationale) => {
        this.emotionalProcessor.setTone(
          tone as EmotionalTone,
          valence,
          arousal,
          rationale
        );
      },
      onOpenWorkbench: (code, lang) => this.listeners.onOpenWorkbench?.(code, lang),
      onTriggerProtocol: (protoId) => this.listeners.onTriggerProtocol?.(protoId),
      onOpenKnowledgeGraph: () => this.listeners.onOpenKnowledgeGraph?.(),
      onOpenDebrief: () => this.listeners.onOpenDebrief?.(),
      onOpenCalculator: (expression) => this.listeners.onOpenCalculator?.(expression),
      onOpenPrivateVault: () => this.listeners.onOpenPrivateVault?.(),
      onOpenRoutinePreferences: () => this.listeners.onOpenRoutinePreferences?.(),
      onOpenDesktopBridge: () => this.listeners.onOpenDesktopBridge?.(),
    });

    // Start emotional processor interpolation loop and broadcast updates
    this.emotionalProcessor.start();
    this.emotionalProcessor.subscribe((metadata) => {
      this.listeners.onEmotionalMetadataChange?.(metadata);
    });

    // Acoustic prosody frequency analysis interval (50ms)
    this.acousticPollTimer = setInterval(() => {
      if (this.state === 'speaking' || this.state === 'listening') {
        const analyser = this.getActiveAnalyser();
        this.emotionalProcessor.processAcoustics(analyser);
      }
    }, 50);

    this.session = new LiveSession({
      onConnected: () => {
        console.log('[StateManager] Connected successfully with voice:', this.selectedVoice);
        this.setState('listening');
      },
      onAudioChunk: (audioBase64) => {
        this.player.playChunk(audioBase64).catch((err) => {
          console.error('[StateManager] Playback error:', err);
        });
      },
      onInterrupted: () => {
        // Debounce: speaker echo se false interrupt aata hai.
        // 450ms ruko, phir mic me ASLI awaaz hai tabhi roko, warna ignore karo.
        if (this.interruptTimer) clearTimeout(this.interruptTimer);
        this.interruptTimer = setTimeout(() => {
          this.interruptTimer = null;
          try {
            const mic = this.streamer.getMicStats();
            if (mic.voiceDetected || mic.rms >= mic.threshold * 0.8) {
              console.log('[StateManager] Real interruption confirmed. Stopping audio.');
              this.player.stopAll();
              this.setState('listening');
            } else {
              console.log('[StateManager] False interruption (echo) ignored. Continuing speech.');
            }
          } catch {
            this.player.stopAll();
            this.setState('listening');
          }
        }, 450);
      },
      onTurnComplete: () => {
        console.log('[StateManager] Turn complete from model');
      },
      onToolCall: async (calls: FunctionCallItem[]) => {
        this.listeners.onOrbActivity?.({ type: 'tool-start' });
        const responses = await this.toolManager.executeCalls(calls);
        const ok = responses.every((r) => !r.response || !(r.response as { error?: string }).error);
        this.listeners.onOrbActivity?.({ type: 'tool-end', ok });
        this.session.sendToolResponse(responses);
      },
      onError: (msg) => {
        console.error('[StateManager] Session error:', msg);
        this.listeners.onError?.(msg);
        this.disconnect();
      },
      onClosed: () => {
        console.log('[StateManager] Session closed');
        if (this.state !== 'disconnected') {
          this.disconnect();
        }
      },
    });

    this.wireVoiceCheckProvider();
  }

  setListeners(listeners: Partial<StateManagerListeners>): void {
    this.listeners = listeners;
  }

  getState(): AssistantState {
    return this.state;
  }

  private setState(newState: AssistantState): void {
    if (this.state === newState) return;
    this.state = newState;
    globalWakewordManager.setAssistantActive(newState !== 'disconnected');
    HapticFeedback.triggerStateHaptic(newState);
    this.listeners.onStateChange?.(newState);
  }

  async connect(): Promise<void> {
    if (this.state !== 'disconnected') return;

    // Check user authorization
    const profile = globalAuthManager.getProfile();
    if (!profile.isAuthenticated) {
      this.listeners.onError?.('Commander authorization required. Please authenticate at the security gate.');
      return;
    }

    try {
      this.setState('connecting');

      // 1. Initialize microphone streaming with voice auth
      await this.streamer.start((base64Audio) => {
        this.session.sendAudio(base64Audio);
      });

      // Enable voice authentication if enrolled
      const voiceAuth = this.streamer.getVoiceAuthManager();
      if (voiceAuth.isVoiceEnrolled()) {
        this.streamer.enableVoiceAuth(() => {
          try { SoundEffects.playAccessDenied(); } catch {}
          this.listeners.onError?.('⚠️ UNAUTHORIZED VOICE DETECTED - Access Denied');
        }, false);
        console.log('[StateManager] Voice authentication ENABLED');
      } else {
        console.log('[StateManager] Voice authentication NOT enrolled - running without voice verification');
      }

      // 2. Fetch memory digest, study curriculum digest, routine & preferences digest, and authorization profile
      const memoriesDigest = globalMemoryManager.getMemoryDigestForPrompt();
      const curriculumDigest = globalCurriculumManager.getCurriculumDigestForPrompt();
      const routineAndPrefsDigest = globalRoutinePreferenceManager.getDigestForPrompt();

      // 3. Connect to WebSocket with chosen voice and commander context
      await this.session.connect(this.selectedVoice, {
        commanderName: profile.commanderName,
        callSign: profile.callSign,
        clearance: profile.clearanceLevel,
        enforceOnly: profile.enforceCommanderOnly,
        memoriesDigest,
        curriculumDigest,
        routineAndPrefsDigest,
      });
    } catch (err: any) {
      console.error('[StateManager] Connection failed:', err);
      this.disconnect();
      let errMsg = err?.message || 'Failed to connect to JARVIS voice server.';
      
      if (err?.name === 'NotAllowedError') {
        errMsg = 'Microphone permission denied. Please allow microphone access to talk with JARVIS.';
      } else if (errMsg.toLowerCase().includes('resource_exhausted') || errMsg.toLowerCase().includes('quota')) {
        errMsg = 'JARVIS ENERGY DEPLETED: Core processors are cooling down. Please wait 60 seconds for a power cell recharge.';
      }

      this.listeners.onError?.(errMsg);
    }
  }

  getVoiceAuthManager() {
    return this.streamer.getVoiceAuthManager();
  }

  /**
   * True only while voice is ACTIVELY in use (recording speech, playing a
   * response, or connecting) — NOT merely while connected-idle. Used by the
   * AdMob critical-operation gate so an idle-but-connected session does not
   * suppress ads forever. Fail-closed: unknown mic state suppresses.
   */
  isVoiceActiveNow(): boolean {
    if (this.state === 'connecting' || this.state === 'speaking') return true;
    if (this.state !== 'listening') return false;
    try {
      const mic = this.streamer.getMicStats();
      if (!mic) return true;
      return !!(mic.voiceDetected || mic.rms >= mic.threshold * 0.8);
    } catch {
      return true;
    }
  }

  setCameraVideoProvider(fn: (() => HTMLVideoElement | null) | null): void {
    this.toolManager.setCameraVideoProvider(fn);
  }

  private wireVoiceCheckProvider(): void {
    this.toolManager.setVoiceCheckProvider(() => this.streamer.getLastVoiceCheck());
  }

  disconnect(): void {
    if (this.interruptTimer) {
      clearTimeout(this.interruptTimer);
      this.interruptTimer = null;
    }
    this.streamer.stop();
    this.stopCamera();
    this.stopScreenWatch();
    this.player.stopAll();
    this.session.disconnect();
    this.setState('disconnected');
  }

  toggleConnection(): Promise<void> {
    if (this.state === 'disconnected') {
      return this.connect();
    } else {
      this.disconnect();
      return Promise.resolve();
    }
  }

  // Camera & Multimodal Vision
  async startCamera(): Promise<HTMLVideoElement> {
    const videoEl = await this.visionStreamer.start((base64Jpeg) => {
      this.session.sendVideo(base64Jpeg);
    });
    this.listeners.onCameraStateChange?.(true);
    return videoEl;
  }

  stopCamera(): void {
    if (this.visionStreamer.getIsRunning()) {
      this.visionStreamer.stop();
      this.listeners.onCameraStateChange?.(false);
    }
  }

  async toggleCamera(): Promise<boolean> {
    if (this.visionStreamer.getIsRunning()) {
      this.stopCamera();
      return false;
    } else {
      await this.startCamera();
      return true;
    }
  }

  async flipCamera(): Promise<HTMLVideoElement> {
    const videoEl = await this.visionStreamer.toggleFacingMode((base64Jpeg) => {
      this.session.sendVideo(base64Jpeg);
    });
    return videoEl;
  }

  isCameraActive(): boolean {
    return this.visionStreamer.getIsRunning();
  }

  getCameraFacingMode(): 'user' | 'environment' {
    return this.visionStreamer.getFacingMode();
  }

  // Screen Watching & Interactive Pedagogical Vision
  async startScreenWatch(): Promise<HTMLVideoElement> {
    SoundEffects.playScreenShareActive();
    const videoEl = await this.screenStreamer.start(
      (base64Jpeg) => {
        // Stream real-time screen display frame to Gemini Live multimodal vision
        this.session.sendVideo(base64Jpeg);
      },
      () => {
        // Callback when screen sharing is ended by user via browser control bar
        this.listeners.onScreenStateChange?.(false);
      }
    );
    this.listeners.onScreenStateChange?.(true);
    return videoEl;
  }

  stopScreenWatch(): void {
    if (this.screenStreamer.getIsRunning()) {
      this.screenStreamer.stop();
      this.listeners.onScreenStateChange?.(false);
    }
  }

  async toggleScreenWatch(): Promise<boolean> {
    if (this.screenStreamer.getIsRunning()) {
      this.stopScreenWatch();
      return false;
    } else {
      await this.startScreenWatch();
      return true;
    }
  }

  isScreenWatching(): boolean {
    return this.screenStreamer.getIsRunning();
  }

  getScreenVideoElement(): HTMLVideoElement | null {
    return this.screenStreamer.getVideoElement();
  }

  getScreenResolution(): { width: number; height: number } {
    return this.screenStreamer.getResolution();
  }

  getScreenStreamLabel(): string {
    return this.screenStreamer.getStreamLabel();
  }

  setVoice(voice: LiveVoice): void {
    if (this.selectedVoice === voice) return;
    this.selectedVoice = voice;
    // Reconnect if currently connected to apply voice update
    if (this.state !== 'disconnected') {
      this.disconnect();
      setTimeout(() => this.connect(), 200);
    }
  }

  getVoice(): LiveVoice {
    return this.selectedVoice;
  }

  setWitLevel(wit: WitLevel): void {
    this.witLevel = wit;
  }

  getWitLevel(): WitLevel {
    return this.witLevel;
  }

  getActiveAnalyser(): AnalyserNode | null {
    if (this.state === 'speaking') {
      return this.player.getAnalyser() || this.streamer.getAnalyser();
    }
    return this.streamer.getAnalyser();
  }

  getPlayer(): AudioPlayer {
    return this.player;
  }

  getStreamer(): AudioStreamer {
    return this.streamer;
  }

  getEmotionalProcessor(): EmotionalMetadataProcessor {
    return this.emotionalProcessor;
  }

  setEmotionalTone(
    tone: EmotionalTone,
    valence?: number,
    arousal?: number,
    rationale?: string
  ): void {
    this.emotionalProcessor.setTone(tone, valence, arousal, rationale);
  }

  getEmotionalMetadata(): EmotionalMetadata {
    return this.emotionalProcessor.getMetadata();
  }
}
