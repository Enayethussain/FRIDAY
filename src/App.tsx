import React, { useEffect, useRef, useState } from 'react';
import { StateManager } from './services/StateManager';
import {
  ActionCard,
  AssistantState,
  CountdownTimer,
  EmotionalMetadata,
  EmotionalTone,
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
  UserProfile,
  WakewordConfig,
  WakewordState,
  WeatherInfo,
  WitLevel,
  ProtocolId,
} from './types';
import { FridayOrb } from './components/FridayOrb/FridayOrb';
import type { HologramHandle } from './components/HUDHologramViewer';
// Lazy: three.js hologram stack loads only when a hologram is requested.
const HUDHologramViewer = React.lazy(() => import('./components/HUDHologramViewer').then((m) => ({ default: m.HUDHologramViewer })));
const HUDHologramLibrary = React.lazy(() => import('./components/HUDHologramLibrary').then((m) => ({ default: m.HUDHologramLibrary })));
import { DynamicWaveform } from './components/DynamicWaveform';
import { HUDHeader } from './components/HUDHeader';
import { HUDActionCard } from './components/HUDActionCard';
import { HUDTimer } from './components/HUDTimer';
import { HUDFooter } from './components/HUDFooter';
import { HUDMediaViewport } from './components/HUDMediaViewport';
import { HUDCameraFeed } from './components/HUDCameraFeed';
import { HUDScreenFeed } from './components/HUDScreenFeed';
import { HUDStudyMatrix } from './components/HUDStudyMatrix';
import { HUDNotesDrawer } from './components/HUDNotesDrawer';
import { HUDTasksDrawer } from './components/HUDTasksDrawer';
import { HUDVoiceSettings } from './components/HUDVoiceSettings';
import { HUDWeatherWidget } from './components/HUDWeatherWidget';
import { HUDFileVault } from './components/HUDFileVault';
import { HUDLanguageMatrix } from './components/HUDLanguageMatrix';
import { HUDEmotionalProcessor } from './components/HUDEmotionalProcessor';
import { HUDFridayLogin } from './components/HUDFridayLogin';
import { HUDFridayMobileLogin } from './components/HUDFridayMobileLogin';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

/** Mobile app (Android WebView / mobile browser) me futuristic login, PC par cyber-lock gate */
function isMobileApp(): boolean {
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {}
  const ua = navigator.userAgent || '';
  return /android|iphone|ipad|ipod|mobile/i.test(ua);
}
import { HUDMemoryArchive } from './components/HUDMemoryArchive';
import { HUDAuthModal } from './components/HUDAuthModal';
import { HUDWakewordSettings } from './components/HUDWakewordSettings';
import { HUDCodeWorkbench } from './components/HUDCodeWorkbench';
import { HUDProtocolManager } from './components/HUDProtocolManager';
import { HUDKnowledgeGraph } from './components/HUDKnowledgeGraph';
import { HUDDebriefModal } from './components/HUDDebriefModal';
import { HUDPrivateVault } from './components/HUDPrivateVault';
import { HUDCalculator } from './components/HUDCalculator';
import { HUDRoutinePreferences } from './components/HUDRoutinePreferences';
import { HUDDesktopBridgeModal } from './components/HUDDesktopBridgeModal';
import { HUDImageGenerator } from './components/HUDImageGenerator';
import { HUDVoiceEnrollment } from './components/HUDVoiceEnrollment';
import { HUDFunHub } from './components/HUDFunHub';
import { HUDChatPanel } from './components/HUDChatPanel';
import { HUDMicMeter } from './components/HUDMicMeter';
import { HUDFaceEnrollment } from './components/HUDFaceEnrollment';
import { FuturisticBackdrop } from './components/FuturisticBackdrop';
import { BootOverlay } from './components/HUDFrame';
import { HUDDeviceLink } from './components/HUDDeviceLink';
import { HUDSecureDevices } from './components/HUDSecureDevices';
import { HUDFileTransfer } from './components/HUDFileTransfer';
import { PcBridgeService } from './services/PcBridgeService';
import { globalGestureEngine } from './services/GestureControlEngine';
// [AppBuilder hook] isolated add-on (new file, existing HUD untouched)
import { HUDAppBuilder } from './components/HUDAppBuilder';
import { HUDPhoneAssistant } from './components/HUDPhoneAssistant';
import { HUDPermissionCenter } from './components/HUDPermissionCenter';
import { HUDScreenAssist } from './components/HUDScreenAssist';
import { ProactiveAssistantEngine } from './services/ProactiveAssistantEngine';
import { SphereOverlayService } from './services/SphereOverlayService';
// [MoreMenu] mobile bottom-sheet (new file, existing HUD untouched)
import { HUDMoreMenu } from './components/HUDMoreMenu';
// Native Android gesture camera (Capacitor plugin; additive, web gestures untouched)
import { HUDGestureSettings } from './components/HUDGestureSettings';
import { globalNativeGestureBridge, isNativeGestureSupported } from './services/NativeGestureBridge';
// FRIDAY Share — nearby sharing on the paired-device relay (additive panel)
import { HUDShare } from './components/HUDShare';
import { globalDeviceLink } from './services/DeviceLinkManager';
import { globalAuthManager } from './services/AuthManager';
// App Open ads: verified entitlement + critical-operation guard (native owns SDK).
import { initAdsEntitlement, setCriticalBusy } from './services/AdsService';
// Central plan/entitlement system (server-authoritative, cached safely).
import { hasEntitlement, refreshEntitlements } from './services/EntitlementService';
import { UpgradePrompt } from './components/UpgradePrompt';
import { HUDSubscription } from './components/HUDSubscription';
import { UpdateDialog } from './components/UpdateDialog';
import { checkForUpdate, isUpdateSupported, type UpdateCheckResult } from './services/UpdateService';
// Dual-voice system: FRIDAY (default) / JARVIS with real TTS switching.
import {
  getActiveVoice,
  getLiveVoiceFor,
  registerLiveVoiceApplier,
  requestVoiceSwitch,
  subscribeActiveVoice,
  type AssistantVoiceId,
} from './services/DualVoiceManager';
import { globalMemoryManager } from './services/MemoryManager';
import { globalCurriculumManager } from './services/CurriculumManager';
import { globalWakewordManager } from './services/WakewordManager';
import { globalProtocolManager } from './services/ProtocolManager';
import { globalTranscriptManager } from './services/TranscriptManager';
import { globalPrivateVault } from './services/PrivateVaultManager';
import { SoundEffects } from './utils/SoundEffects';
import { HapticFeedback } from './utils/HapticFeedback';
import { THEMES } from './utils/theme';
import { db, auth } from './lib/firebase';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
  ShieldAlert,
  Sparkles,
  X,
  Youtube,
  CloudSun,
  FileText,
  CheckSquare,
  Camera,
  HardDrive,
  Globe,
  UploadCloud,
  Radio,
  Brain,
  Mic,
  Monitor,
  GraduationCap,
  ChevronRight,
  BookOpen,
  Code2,
  Zap,
  Network,
  ClipboardList,
} from 'lucide-react';

export default function App() {
  const [state, setState] = useState<AssistantState>('disconnected');
  const [theme, setTheme] = useState<ThemeAccent>('amber');
  const [actionCards, setActionCards] = useState<ActionCard[]>([]);
  const [timers, setTimers] = useState<CountdownTimer[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Orb visual signals — all from REAL events (wake-word, tool bursts, errors)
  const [orbToolActive, setOrbToolActive] = useState(false);
  const [orbToolStartAt, setOrbToolStartAt] = useState<number | null>(null);
  const [orbWakeAt, setOrbWakeAt] = useState<number | null>(null);
  const [orbLastResult, setOrbLastResult] = useState<{ ok: boolean; at: number } | null>(null);
  const [orbErrorAt, setOrbErrorAt] = useState<number | null>(null);

  // Universal 3D Hologram Generator state (viewer lazy-loads three.js)
  const [hologram, setHologram] = useState<HologramState | null>(null);
  const [hologramCompare, setHologramCompare] = useState<HologramState | null>(null);
  const [libOpen, setLibOpen] = useState(false);
  const hologramRef = useRef<HologramHandle>(null);
  const hologramOpenRef = useRef(false);

  // Preload the offline hologram catalog once (deterministic search + browser).
  useEffect(() => {
    void import('./hologram/registry').then(({ loadCatalog }) => loadCatalog()).catch(() => {});
  }, []);

  const openLibraryModel = (entry: { id: string; label: string; category: string; isApproximation: boolean; url?: string; format?: 'glb' | 'gltf' | 'obj'; description?: string; polygon_count?: number; animation?: boolean }) => {
    hologramOpenRef.current = true;
    setLibOpen(false);
    setHologramCompare(null);
    setHologram({
      isOpen: true, object: entry.label, entryId: entry.id, label: entry.label,
      category: entry.category, kind: 'local', isApproximation: entry.isApproximation,
      note: entry.description || 'Local library model.', status: 'loading',
      modelUrl: entry.url, format: entry.format, progress: 0,
    });
  };
  /** Auto-start greeting spoken once per launch (Task Scheduler path only). */
  const greetedRef = useRef(false);

  // Media, Vision & Productivity States
  const [mediaViewport, setMediaViewport] = useState<MediaViewportState>({
    isOpen: false,
    title: '',
    query: '',
    embedUrl: '',
    externalUrl: '',
    type: 'youtube',
  });
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraVideoEl, setCameraVideoEl] = useState<HTMLVideoElement | null>(null);

  // Screen Watching & Pedagogical Vision State
  const [isScreenWatching, setIsScreenWatching] = useState<boolean>(false);
  const [screenVideoEl, setScreenVideoEl] = useState<HTMLVideoElement | null>(null);
  const [screenResolution, setScreenResolution] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [screenStreamLabel, setScreenStreamLabel] = useState<string>('');

  // Study Curriculum & Syllabus Continuity State
  const [curriculum, setCurriculum] = useState<StudyCurriculum>(() => globalCurriculumManager.getCurriculum());
  const [isStudyMatrixOpen, setIsStudyMatrixOpen] = useState(false);

  const [weather, setWeather] = useState<WeatherInfo | null>(null);

  // PC File Vault state
  const [files, setFiles] = useState<PCFileItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('friday_pc_files') || '[]');
    } catch {
      return [];
    }
  });
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [isDraggingWindowFile, setIsDraggingWindowFile] = useState(false);

  // Omniglot Multilingual Matrix state
  const [activeLanguage, setActiveLanguage] = useState<string>('auto');
  const [isLanguageMatrixOpen, setIsLanguageMatrixOpen] = useState(false);

  // Notes & Tasks state
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setFirebaseUid(user.uid);
      } else {
        setFirebaseUid(null);
        setNotes([]);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!firebaseUid) return;
    const q = query(collection(db, 'notes'), where('userId', '==', firebaseUid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNotes: NoteItem[] = [];
      snapshot.forEach((doc) => {
        fetchedNotes.push(doc.data() as NoteItem);
      });
      fetchedNotes.sort((a, b) => b.createdAt - a.createdAt);
      setNotes(fetchedNotes);
    });
    return () => unsubscribe();
  }, [firebaseUid]);

  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('friday_tasks') || '[]');
    } catch {
      return [];
    }
  });

  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [isVoiceSettingsOpen, setIsVoiceSettingsOpen] = useState(false);
  // FRIDAY is always the default voice (Aoede). DualVoiceManager persists it.
  const [currentVoice, setCurrentVoice] = useState<LiveVoice>('Aoede');
  const [activeVoice, setActiveVoice] = useState<AssistantVoiceId>(() => getActiveVoice());
  const [currentWit, setCurrentWit] = useState<WitLevel>('witty');

  // Emotional Metadata Processor state
  const [emotionalMetadata, setEmotionalMetadata] = useState<EmotionalMetadata>(() => ({
    tone: 'neutral',
    valence: 0,
    arousal: 0.2,
    glowIntensity: 1.0,
    pulseFrequency: 1.0,
    pulseDuration: 1.0,
    ambientColor: '#FFC400',
    label: 'EQUILIBRIUM',
    summary: 'Cybernetic baseline equilibrium',
    updatedAt: Date.now(),
  }));
  const [isEmotionalDiagnosticsOpen, setIsEmotionalDiagnosticsOpen] = useState(false);

  // Commander Security & Long Memory State
  const [authProfile, setAuthProfile] = useState<UserProfile>(() => globalAuthManager.getProfile());
  const [memories, setMemories] = useState<MemoryItem[]>(() => globalMemoryManager.getMemories());
  const [wakewordConfig, setWakewordConfig] = useState<WakewordConfig>(() => globalWakewordManager.getConfig());
  const [wakewordState, setWakewordState] = useState<WakewordState>(() => globalWakewordManager.getState());

  const [isMemoriesOpen, setIsMemoriesOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isWakewordModalOpen, setIsWakewordModalOpen] = useState(false);
  const [wakewordBanner, setWakewordBanner] = useState<string | null>(null);

  // Stark Holographic Code & Circuit Workbench
  const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(false);
  const [workbenchCode, setWorkbenchCode] = useState<string | undefined>(undefined);
  const [workbenchLang, setWorkbenchLang] = useState<string | undefined>(undefined);

  // Autonomous Tactical Protocols Hub
  const [isProtocolsOpen, setIsProtocolsOpen] = useState(false);

  // Neural Memory & Concept Knowledge Graph (D3.js)
  const [isKnowledgeGraphOpen, setIsKnowledgeGraphOpen] = useState(false);

  // Session Debrief & Audio Transcript Exporter
  const [isDebriefOpen, setIsDebriefOpen] = useState(false);

  // Stark Classified Private Vault
  const [isPrivateVaultOpen, setIsPrivateVaultOpen] = useState(false);
  const [isPrivateVaultUnlocked, setIsPrivateVaultUnlocked] = useState(() => globalPrivateVault.isUnlocked());

  // Stark Holographic Calculator
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [calculatorInitialExpr, setCalculatorInitialExpr] = useState<string>('');

  // Daily Routine & Preferences Matrix
  const [isRoutinePrefsOpen, setIsRoutinePrefsOpen] = useState(false);

  // PC Voice Control & Native Desktop Bridge
  const [isDesktopBridgeOpen, setIsDesktopBridgeOpen] = useState(false);
  const [isImageGeneratorOpen, setIsImageGeneratorOpen] = useState(false);
  
  // Voice Authentication & Enrollment
  const [isVoiceEnrollmentOpen, setIsVoiceEnrollmentOpen] = useState(false);
  const [isFunHubOpen, setIsFunHubOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isFaceEnrollmentOpen, setIsFaceEnrollmentOpen] = useState(false);
  const [isDeviceLinkOpen, setIsDeviceLinkOpen] = useState(false);
  const [isSecureDevicesOpen, setIsSecureDevicesOpen] = useState(false);
  const [isFileTransferOpen, setIsFileTransferOpen] = useState(false);
  const [ftTargetId, setFtTargetId] = useState<string | undefined>(undefined);
  // [AppBuilder hook] isolated add-on modal state (new capability, no existing logic touched)
  const [isAppBuilderOpen, setIsAppBuilderOpen] = useState(false);
  const [isPhoneAssistantOpen, setIsPhoneAssistantOpen] = useState(false);
  const [isPermissionCenterOpen, setIsPermissionCenterOpen] = useState(false);
  const [isScreenAssistOpen, setIsScreenAssistOpen] = useState(false);
  const [screenAssistActive, setScreenAssistActive] = useState(false);
  // [MoreMenu] mobile: saare floating buttons ek "⋯ More" sheet me (PC UI untouched)
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  // Native Android gesture camera settings + HUD interaction lock (fist gesture)
  const [isGestureSettingsOpen, setIsGestureSettingsOpen] = useState(false);
  const [isHudLocked, setIsHudLocked] = useState(false);
  // FRIDAY Share panel (voice "open share" fires friday:open-share)
  const [isShareOpen, setIsShareOpen] = useState(false);
  // Subscription + upgrade prompt (central entitlement gates below).
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null);
  const [upgradeAsk, setUpgradeAsk] = useState<{ featureLabel: string; requiredPlan: 'PRO' | 'PLUS' } | null>(null);
  const isMobileUI = isMobileApp();

  const stateManagerRef = useRef<StateManager | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  // User ne camera manually OFF kiya to koi auto-start (surveillance) use wapas on NA kare
  const cameraManualOffRef = useRef(false);

  // Initialize StateManager once on mount
  if (!stateManagerRef.current) {
    stateManagerRef.current = new StateManager();
  }

  useEffect(() => {
    const sm = stateManagerRef.current;
    if (!sm) return;

    // Dual-voice wiring: voice-switch commands apply the REAL Live voice here.
    // FRIDAY (default) -> Aoede, JARVIS -> Fenrir. A persisted JARVIS
    // preference is honored; otherwise FRIDAY stays active.
    const initialLive = getLiveVoiceFor(getActiveVoice());
    setCurrentVoice(initialLive);
    setActiveVoice(getActiveVoice());
    if (sm.getVoice() !== initialLive) sm.setVoice(initialLive);
    registerLiveVoiceApplier((v) => {
      setCurrentVoice(v);
      sm.setVoice(v);
    });
    const unsubVoice = subscribeActiveVoice((v) => setActiveVoice(v));

    // Load initial emotional state
    setEmotionalMetadata(sm.getEmotionalMetadata());

    // Subscribe to Auth, Memory, and Wakeword managers
    const unsubAuth = globalAuthManager.subscribe((profile) => {
      setAuthProfile(profile);
      if (profile.isAuthenticated && globalWakewordManager.getConfig().enabled) {
        globalWakewordManager.start();
      }
    });

    const unsubMem = globalMemoryManager.subscribe((newMems) => {
      setMemories(newMems);
    });

    const unsubCurriculum = globalCurriculumManager.subscribe((newCurr) => {
      setCurriculum(newCurr);
    });

    const unsubWake = globalWakewordManager.subscribe((ws) => {
      setWakewordState(ws);
    });

    globalWakewordManager.onWakewordDetected = (phrase) => {
      HapticFeedback.wakeword();
      setOrbWakeAt(performance.now());
      setWakewordBanner(`⚡ WAKEWORD RECOGNIZED: "${(phrase || '').toUpperCase()}" // INITIALIZING NEURAL CORE`);
      setTimeout(() => setWakewordBanner(null), 4000);

      const prof = globalAuthManager.getProfile();
      if (prof.isAuthenticated && sm.getState() === 'disconnected') {
        sm.connect().catch((err) => {
          console.error('[Wakeword] Failed to connect on wakeword trigger:', err);
        });
      }
    };

    // Auto-start wakeword if user is authenticated and enabled
    if (globalAuthManager.getProfile().isAuthenticated) {
      globalWakewordManager.start();
    }

    // Initialize Proactive Assistant & Screen Assist (Android only).
    // Screen Assist is strictly opt-in: init() only subscribes; polling starts
    // after the user enables it in Screen Assist settings (or restores a saved ON).
    import('@capacitor/core').then(({ Capacitor }) => {
      if (Capacitor.getPlatform() === 'android') {
        ProactiveAssistantEngine.init().then(() => {
          setScreenAssistActive(ProactiveAssistantEngine.isAssistOn());
        }).catch(() => {});
        SphereOverlayService.hasPermission().then((hasPerm) => {
          if (hasPerm) {
            SphereOverlayService.start('idle').catch(() => {});
          }
        }).catch(() => {});
      }
    }).catch(() => {});

    sm.setListeners({
      onStateChange: (newState) => {
        setState(newState);
        HapticFeedback.triggerStateHaptic(newState);
        if (newState !== 'disconnected') {
          setErrorMessage(null);
        }
        if (newState === 'connecting') setOrbWakeAt(performance.now());
        // Auto-start greeting: spoken once, only for Task Scheduler launches
        // that actually reach a live voice session — never before ready.
        if (newState === 'listening' && !greetedRef.current) {
          greetedRef.current = true;
          void (async () => {
            try {
              const info = await PcBridgeService.shellInfo();
              if (!info || !info.autostart) return;
              const h = new Date().getHours();
              const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
              const { TTSService } = await import('./services/TTSService');
              await TTSService.speakHinglish(`${part}, Sir. FRIDAY is online.`);
            } catch { /* greeting is optional — silence is better than a crash */ }
          })();
        }
        // Update sphere overlay state
        const stateMap: Record<string, 'idle' | 'listening' | 'processing' | 'speaking' | 'error'> = {
          disconnected: 'idle', connecting: 'processing', listening: 'listening', speaking: 'speaking',
        };
        SphereOverlayService.setState(stateMap[newState] || 'idle').catch(() => {});
      },
      onError: (msg) => {
        HapticFeedback.warning();
        setErrorMessage(msg);
        setOrbErrorAt(performance.now());
      },
      onOrbActivity: (e) => {
        if (e.type === 'tool-start') {
          setOrbToolActive(true);
          setOrbToolStartAt(performance.now());
        } else {
          setOrbToolActive(false);
          setOrbLastResult({ ok: e.ok, at: performance.now() });
          if (!e.ok) setOrbErrorAt(performance.now());
        }
      },
      onActionCard: (card) => {
        setActionCards((prev) => [card, ...prev.slice(0, 3)]);
      },
      onTimerCreated: (timer) => {
        setTimers((prev) => [...prev, timer]);
      },
      onThemeChanged: (newTheme) => {
        setTheme(newTheme);
      },
      onMediaViewport: (viewport) => {
        setMediaViewport(viewport);
      },
      onHologram: (h) => {
        // Hologram viewer is PRO — including voice-driven opens.
        if (h.isOpen && !hasEntitlement('HOLOGRAM')) {
          setUpgradeAsk({ featureLabel: 'Hologram / 3D viewer', requiredPlan: 'PRO' });
          return;
        }
        hologramOpenRef.current = h.isOpen;
        setHologramCompare(null);
        setHologram(h);
      },
      onHologramLibrary: () => {
        if (!hasEntitlement('HOLOGRAM_LIBRARY')) {
          setUpgradeAsk({ featureLabel: 'Hologram library', requiredPlan: 'PRO' });
          return;
        }
        setLibOpen(true);
      },
      onHologramCompare: (a, b) => {
        hologramOpenRef.current = true;
        setHologram(a);
        setHologramCompare(b);
        try {
          const r = [a.entryId, ...JSON.parse(localStorage.getItem('jarvis_holo_recent') || '[]').filter((x: string) => x !== a.entryId)].slice(0, 10);
          localStorage.setItem('jarvis_holo_recent', JSON.stringify(r));
        } catch { /* noop */ }
      },
      onHologramControl: (action: HologramControlAction, degrees?: number) => {
        if (!hologramOpenRef.current || !hologramRef.current) {
          setActionCards((prev) => [
            {
              id: `holo-none-${Date.now()}`,
              type: 'info',
              title: 'No hologram open',
              description: 'Sir, pehle koi hologram banao — phir rotate/zoom karo.',
              timestamp: Date.now(),
            } as any,
            ...prev.slice(0, 3),
          ]);
          return;
        }
        try { hologramRef.current.control(action, degrees); } catch { /* viewer-only */ }
      },
      onWeatherUpdated: (w) => {
        setWeather(w);
      },
      onNotesChanged: (updatedNotes) => {
        setNotes(updatedNotes);
      },
      onTasksChanged: (updatedTasks) => {
        setTasks(updatedTasks);
      },
      onFilesChanged: (updatedFiles) => {
        setFiles(updatedFiles);
      },
      onMemoriesChanged: (newMems) => {
        setMemories(newMems);
      },
      onCurriculumChanged: (newCurr) => {
        setCurriculum(newCurr);
      },
      onCameraStateChange: (active) => {
        setIsCameraActive(active);
        if (!active) setCameraVideoEl(null);
      },
      onScreenStateChange: (active) => {
        setIsScreenWatching(active);
        if (!active) {
          setScreenVideoEl(null);
        }
      },
      onEmotionalMetadataChange: (meta) => {
        setEmotionalMetadata(meta);
      },
      onOpenWorkbench: (code, lang) => {
        setWorkbenchCode(code);
        setWorkbenchLang(lang);
        setIsWorkbenchOpen(true);
      },
      onTriggerProtocol: (protoId) => {
        globalProtocolManager.executeProtocol(protoId, {
          onThemeChange: (t) => {
            setTheme(t);
            sm.setTheme(t);
          },
          onSetTimer: (sec, lbl) => {
            setTimers((prev) => [
              ...prev,
              { id: `timer-${Date.now()}`, label: lbl, totalSeconds: sec, remainingSeconds: sec, isRunning: true },
            ]);
          },
          onActionCard: (card) => {
            setActionCards((prev) => [card, ...prev.slice(0, 3)]);
          },
        });
      },
      onOpenKnowledgeGraph: () => {
        setIsKnowledgeGraphOpen(true);
      },
      onOpenDebrief: () => {
        setIsDebriefOpen(true);
      },
      onOpenCalculator: (expression) => {
        setCalculatorInitialExpr(expression || '');
        setIsCalculatorOpen(true);
      },
      onOpenPrivateVault: () => {
        setIsPrivateVaultUnlocked(globalPrivateVault.isUnlocked());
        setIsPrivateVaultOpen(true);
      },
      onOpenRoutinePreferences: () => {
        setIsRoutinePrefsOpen(true);
      },
      onOpenDesktopBridge: () => {
        setIsDesktopBridgeOpen(true);
      },
      onSurveillanceMode: (active: boolean) => {
        if (active) {
          setTheme('rose');
          sm.setTheme('rose');
          setWakewordBanner('🚨 SURVEILLANCE MODE ACTIVATED: SECURITY PROTOCOLS ENGAGED');
          SoundEffects.playProtocolEngaged();
          if (!sm.isCameraActive()) {
            if (cameraManualOffRef.current) {
              setWakewordBanner('🚨 SURVEILLANCE BINA CAMERA: camera manual OFF hai — on karne ke liye camera button dabao');
            } else {
              sm.startCamera().then(videoEl => {
                setIsCameraActive(true);
                setCameraVideoEl(videoEl);
              }).catch(console.error);
            }
          }
        } else {
          setTheme('amber');
          sm.setTheme('amber');
          setWakewordBanner('SURVEILLANCE MODE DEACTIVATED');
        }
        setTimeout(() => setWakewordBanner(null), 4000);
      },
    });

    return () => {
      unsubAuth();
      unsubMem();
      unsubCurriculum();
      unsubWake();
      unsubVoice();
      registerLiveVoiceApplier(null);
      globalWakewordManager.stopListening();
      sm.disconnect();
    };
  }, []);

  // Camera frame provider for real face-scan tool
  useEffect(() => {
    cameraVideoRef.current = cameraVideoEl;
    stateManagerRef.current?.setCameraVideoProvider(() => cameraVideoRef.current);
  }, [cameraVideoEl]);

  // Device Link inbox polling — paired device se aaye messages HUD pe dikhao
  // + Cloud Sync: paired room ka shared state (notes/tasks/curriculum) auto sync
  useEffect(() => {
    // App Open ads: fetch verified plan once (FREE -> ads, PRO/PLUS -> none).
    // Native stays quiet until this resolves; unknown backend = FREE behavior.
    void initAdsEntitlement();
    // Central entitlements (confirmed/cached/unavailable) for feature gates.
    void refreshEntitlements();
    // In-app update: silent check on native launch; dialog only when a real
    // newer build is confirmed (never on errors or when unconfigured).
    if (isUpdateSupported()) {
      void checkForUpdate()
        .then((r) => {
          if (r.configured && r.updateAvailable && r.remote) {
            setUpdateCheck(r);
            setIsUpdateOpen(true);
          }
        })
        .catch(() => {});
    }
    globalDeviceLink.startPolling(5000);
    import('./services/CloudSyncManager').then(({ globalCloudSync }) => {
      globalDeviceLink.register().catch(() => {}).finally(() => globalCloudSync.start(10000));
    }).catch(() => {});
    const off = globalDeviceLink.onMessage((messages) => {
      for (const m of messages) {
        setActionCards((prev) => [
          {
            id: `link-${m.id}`,
            type: 'info',
            title: `📲 ${m.fromName} se message`,
            description: m.payload,
            timestamp: Date.now(),
            data: m,
          } as any,
          ...prev.slice(0, 3),
        ]);
      }
      try { SoundEffects.playSubtleBeep(); } catch {}
    });
    return () => {
      off();
      globalDeviceLink.stopPolling();
      import('./services/CloudSyncManager').then(({ globalCloudSync }) => globalCloudSync.stop()).catch(() => {});
    };
  }, []);

  // App Open ads: suppress while FRIDAY runs a critical operation so an ad
  // never interrupts voice, calls, transfers, vault/security, camera, gestures,
  // permissions, or phone control. Each flag clears independently.
  // Voice uses live mic activity (not merely "connected") so an idle session
  // does not suppress ads forever; re-checked on a lightweight interval.
  useEffect(() => {
    const sm = stateManagerRef.current;
    const pushVoice = () => {
      try {
        setCriticalBusy('voice', sm ? sm.isVoiceActiveNow() : state !== 'disconnected');
      } catch {
        setCriticalBusy('voice', state !== 'disconnected');
      }
    };
    pushVoice();
    const t = setInterval(pushVoice, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  useEffect(() => {
    setCriticalBusy('share', isShareOpen || isFileTransferOpen);
    setCriticalBusy('vault', isPrivateVaultOpen || isAuthModalOpen);
    setCriticalBusy('camera', isCameraActive || isScreenWatching);
    setCriticalBusy('gesture', isGestureSettingsOpen);
    setCriticalBusy('permissions', isPermissionCenterOpen);
    setCriticalBusy('phone', isPhoneAssistantOpen);
    setCriticalBusy('enrollment', isVoiceEnrollmentOpen || isFaceEnrollmentOpen);
  }, [state, isShareOpen, isFileTransferOpen, isPrivateVaultOpen, isAuthModalOpen, isCameraActive, isScreenWatching, isGestureSettingsOpen, isPermissionCenterOpen, isPhoneAssistantOpen, isVoiceEnrollmentOpen, isFaceEnrollmentOpen]);

  // Android back button: close topmost layer first (MORE, panels, prompts),
  // otherwise exit the app (preserves default system behavior).
  const backCloseRef = useRef<() => boolean>(() => false);
  backCloseRef.current = () => {
    if (upgradeAsk) { setUpgradeAsk(null); return true; }
    if (isSubscriptionOpen) { setIsSubscriptionOpen(false); return true; }
    if (isMoreOpen) { setIsMoreOpen(false); return true; }
    if (isChatOpen) { setIsChatOpen(false); return true; }
    if (isShareOpen) { setIsShareOpen(false); return true; }
    if (isFileTransferOpen) { setIsFileTransferOpen(false); return true; }
    if (isAppBuilderOpen) { setIsAppBuilderOpen(false); return true; }
    if (isPhoneAssistantOpen) { setIsPhoneAssistantOpen(false); return true; }
    if (isGestureSettingsOpen) { setIsGestureSettingsOpen(false); return true; }
    if (isPrivateVaultOpen) { setIsPrivateVaultOpen(false); return true; }
    if (isVoiceSettingsOpen) { setIsVoiceSettingsOpen(false); return true; }
    return false;
  };
  useEffect(() => {
    let handle: { remove: () => void } | null = null;
    try {
      if (!Capacitor.isNativePlatform()) return;
      CapApp.addListener('backButton', () => {
        let consumed = false;
        try { consumed = backCloseRef.current(); } catch { consumed = false; }
        if (!consumed) {
          try { void CapApp.exitApp(); } catch { /* system default */ }
        }
      }).then((h) => { handle = h; }).catch(() => {});
    } catch { /* web: no hardware back */ }
    return () => { try { handle?.remove(); } catch {} };
  }, []);

  const handleToggleCore = async () => {
    HapticFeedback.tap();
    setErrorMessage(null);
    const sm = stateManagerRef.current;
    if (!sm) return;
    try {
      await sm.toggleConnection();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Connection failed');
    }
  };

  // Desktop shell events (tray): voice on/off, gesture pause/resume, open panels.
  // No-ops in browser — the bridge reports NOT_SUPPORTED there.
  useEffect(() => {
    const offs = [
      PcBridgeService.onShellEvent('friday-voice', (on: unknown) => {
        const sm = stateManagerRef.current;
        if (!sm) return;
        const connected = sm.getState() !== 'disconnected';
        if (!!on && !connected) void handleToggleCore();
        if (!on && connected) void handleToggleCore();
      }),
      PcBridgeService.onShellEvent('friday-gestures', (on: unknown) => {
        globalGestureEngine.setPaused(!on);
      }),
      PcBridgeService.onShellEvent('friday-open-secure', () => setIsSecureDevicesOpen(true)),
      PcBridgeService.onShellEvent('friday-open-permissions', () => setIsPermissionCenterOpen(true)),
    ];
    return () => { offs.forEach((off) => { try { off(); } catch { /* noop */ } }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleScreenWatch = async () => {
    const sm = stateManagerRef.current;
    if (!sm) return;
    // Screen awareness is PRO (permission-gated where Android allows).
    // Stopping an active watch is always allowed; starting needs entitlement.
    if (!sm.isScreenWatching() && !hasEntitlement('SCREEN_AWARENESS')) {
      setUpgradeAsk({ featureLabel: 'Screen awareness', requiredPlan: 'PRO' });
      return;
    }
    try {
      if (sm.isScreenWatching()) {
        sm.stopScreenWatch();
        setIsScreenWatching(false);
        setScreenVideoEl(null);
      } else {
        const videoEl = await sm.startScreenWatch();
        setIsScreenWatching(true);
        setScreenVideoEl(videoEl);
        setScreenResolution(sm.getScreenResolution());
        setScreenStreamLabel(sm.getScreenStreamLabel());

        // Connect audio/voice stream if not already active
        if (state === 'disconnected') {
          await sm.connect();
        }

        setActionCards((prev) => [
          {
            id: `screen-${Date.now()}`,
            type: 'info',
            title: 'Screen Watching Active // Teacher Mode',
            description: `FRIDAY is now watching your screen (${sm.getScreenResolution().width}x${sm.getScreenResolution().height}). Ask him to guide or review your code!`,
            timestamp: Date.now(),
          },
          ...prev.slice(0, 2),
        ]);
      }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setErrorMessage('Screen capture cancelled or permission denied.');
      } else {
        setErrorMessage(err?.message || 'Failed to start screen watching');
      }
    }
  };

  const handleToggleCamera = async () => {
    const sm = stateManagerRef.current;
    if (!sm) return;
    try {
      if (sm.isCameraActive()) {
        sm.stopCamera();
        setIsCameraActive(false);
        setCameraVideoEl(null);
        cameraManualOffRef.current = true; // manual OFF — auto-start block
      } else {
        cameraManualOffRef.current = false;
        const videoEl = await sm.startCamera();
        setIsCameraActive(true);
        setCameraVideoEl(videoEl);
        if (state === 'disconnected') {
          await sm.connect();
        }
      }
    } catch (err: any) {
      setErrorMessage(
        err?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access for FRIDAY vision stream.'
          : (err?.message || 'Failed to start camera')
      );
    }
  };

  const handleFlipCamera = async () => {
    const sm = stateManagerRef.current;
    if (!sm) return;
    try {
      const videoEl = await sm.flipCamera();
      setCameraVideoEl(videoEl);
    } catch (err: any) {
      console.error('Failed to flip camera:', err);
    }
  };

  // Central entitlement gate: open the feature only when entitled,
  // otherwise show the upgrade prompt (never falsely execute).
  const openGated = (feature: string, requiredPlan: 'PRO' | 'PLUS', featureLabel: string, open: () => void) => {
    if (hasEntitlement(feature)) open();
    else setUpgradeAsk({ featureLabel, requiredPlan });
  };

  const handleSelectVoice = (voice: LiveVoice) => {
    // Keep ACTIVE_VOICE consistent: Aoede <-> FRIDAY, Fenrir <-> JARVIS.
    // JARVIS voice is a PRO entitlement: FREE users get the upgrade prompt,
    // never a silent fake switch. Other Live voices work directly (preserved).
    if (voice === 'Aoede' || voice === 'Fenrir') {
      if (voice === 'Fenrir' && !hasEntitlement('JARVIS_VOICE')) {
        setUpgradeAsk({ featureLabel: 'JARVIS voice mode', requiredPlan: 'PRO' });
        return;
      }
      void requestVoiceSwitch(voice === 'Fenrir' ? 'JARVIS' : 'FRIDAY').then((r) => {
        setCurrentVoice(r.liveVoice);
        setActiveVoice(r.activeVoice);
      });
      return;
    }
    setCurrentVoice(voice);
    stateManagerRef.current?.setVoice(voice);
  };

  const handleSelectWit = (wit: WitLevel) => {
    setCurrentWit(wit);
    stateManagerRef.current?.setWitLevel(wit);
  };

  const handleDismissCard = (id: string) => {
    setActionCards((prev) => prev.filter((c) => c.id !== id));
  };

  const handleDismissTimer = (id: string) => {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  };

  // PC File Upload Processing
  const handleUploadFiles = async (fileList: FileList | File[]) => {
    const newItems: PCFileItem[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        let content = '';
        let dataUrl: string | undefined = undefined;

        if (
          ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext) ||
          file.type.startsWith('image/')
        ) {
          dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve('');
            reader.readAsDataURL(file);
          });
          content = `[Image File: ${file.name}, type: ${file.type}, size: ${(file.size / 1024).toFixed(1)} KB]`;
        } else {
          content = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve('');
            reader.readAsText(file);
          });
        }

        const item: PCFileItem = {
          id: `pc-file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          size: file.size,
          type: file.type || 'text/plain',
          extension: ext,
          content: content || '[Empty file]',
          previewSnippet: content.slice(0, 200),
          dataUrl,
          uploadedAt: Date.now(),
        };
        newItems.push(item);
      } catch (err) {
        console.error('Failed to parse PC file:', file.name, err);
      }
    }

    if (newItems.length > 0) {
      const updated = [
        ...newItems,
        ...files.filter((f) => !newItems.some((n) => n.name === f.name)),
      ];
      setFiles(updated);
      localStorage.setItem('friday_pc_files', JSON.stringify(updated));

      // Display floating action card confirming file uplink
      setActionCards((prev) => [
        {
          id: `act-${Date.now()}`,
          type: 'file',
          title: `PC File Uplink: ${newItems[0].name}${newItems.length > 1 ? ` (+${newItems.length - 1} more)` : ''}`,
          description: `Ingested ${(newItems[0].size / 1024).toFixed(1)} KB • Ask FRIDAY to inspect or summarize`,
          timestamp: Date.now(),
        },
        ...prev.slice(0, 2),
      ]);
    }
  };

  const handleDeleteFile = (id: string) => {
    const updated = files.filter((f) => f.id !== id);
    setFiles(updated);
    localStorage.setItem('friday_pc_files', JSON.stringify(updated));
  };

  // Notes and Tasks Handlers
  const handleAddNote = async (title: string, content: string) => {
    if (!firebaseUid) return;
    const noteId = `note-${Date.now()}`;
    const newNote: NoteItem = {
      id: noteId,
      title,
      content,
      createdAt: Date.now(),
      userId: firebaseUid,
    };
    try {
      await setDoc(doc(db, 'notes', noteId), newNote);
    } catch (error) {
      console.error('Error adding note to Firestore:', error);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!firebaseUid) return;
    try {
      await deleteDoc(doc(db, 'notes', id));
    } catch (error) {
      console.error('Error deleting note from Firestore:', error);
    }
  };

  const handleAddTask = (task: string, priority: 'high' | 'normal' | 'low') => {
    const newTask: TaskItem = {
      id: `task-${Date.now()}`,
      task,
      completed: false,
      priority,
      createdAt: Date.now(),
    };
    const updated = [newTask, ...tasks];
    setTasks(updated);
    localStorage.setItem('friday_tasks', JSON.stringify(updated));
  };

  const handleToggleTask = (id: string) => {
    const updated = tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    setTasks(updated);
    localStorage.setItem('friday_tasks', JSON.stringify(updated));
  };

  const handleDeleteTask = (id: string) => {
    const updated = tasks.filter((t) => t.id !== id);
    setTasks(updated);
    localStorage.setItem('friday_tasks', JSON.stringify(updated));
  };

  const handleQuickYouTube = () => {
    setMediaViewport({
      isOpen: true,
      title: 'YouTube Trending & Music',
      query: 'trending',
      embedUrl: 'https://www.youtube-nocookie.com/embed?listType=search&list=lofi%20hip%20hop&autoplay=1',
      externalUrl: 'https://www.youtube.com',
      type: 'youtube',
    });
  };

  const handleSelectEmotionalTone = (tone: EmotionalTone) => {
    stateManagerRef.current?.setEmotionalTone(tone);
  };

  // Long Memory Handlers
  const handleAddMemory = (
    category: MemoryItem['category'],
    key: string,
    content: string,
    importance?: MemoryItem['importance']
  ) => {
    globalMemoryManager.storeMemory(category, key, content, importance);
    SoundEffects.playMemoryStored();
  };

  const handleDeleteMemory = (id: string) => {
    globalMemoryManager.deleteMemory(id);
  };

  const handleResetMemories = () => {
    globalMemoryManager.resetDefaults();
  };

  // Commander Auth Handlers
  const handleUpdateProfile = (updates: Partial<UserProfile>) => {
    globalAuthManager.updateProfile(updates);
  };

  // Wakeword Handlers
  const handleUpdateWakewordConfig = (updates: Partial<WakewordConfig>) => {
    globalWakewordManager.updateConfig(updates);
    setWakewordConfig(globalWakewordManager.getConfig());
  };

  // FRIDAY Share voice hook: "open share" opens the real panel.
  useEffect(() => {
    const open = () => setIsShareOpen(true);
    window.addEventListener('friday:open-share', open);
    return () => window.removeEventListener('friday:open-share', open);
  }, []);

  // Native Android gesture camera -> REAL HUD actions (honest results only).
  // Volume is executed + verified natively; everything here runs in the HUD
  // and reports success only when it really happened.
  useEffect(() => {
    if (!isNativeGestureSupported()) return;
    globalNativeGestureBridge.setHandlers({
      onWakeHud: () => {
        setWakewordBanner('✋ OPEN PALM — FRIDAY awake, sir.');
        setTimeout(() => setWakewordBanner(null), 3000);
        try {
          SoundEffects.playWakewordChime();
        } catch { /* audio-only */ }
        return { ok: true, message: 'HUD awake.' };
      },
      onOpenPanel: () => {
        setIsMoreOpen(true);
        return { ok: true, message: 'Control panel khol diya.' };
      },
      onSwipe: (dir) => {
        if (mediaViewport.isOpen) {
          setMediaViewport((prev) => ({ ...prev, isOpen: false }));
          return { ok: true, message: dir === 'next' ? 'Viewer band kar diya.' : 'Viewer band kar diya.' };
        }
        return { ok: false, message: 'Yahan swipe karne layak kuch nahi hai.' };
      },
      onZoom: (dir) => {
        if (hologramOpenRef.current && hologramRef.current) {
          try {
            hologramRef.current.control(dir === 'in' ? 'zoom_in' : 'zoom_out');
            return { ok: true, message: dir === 'in' ? 'Zoom in ho gaya.' : 'Zoom out ho gaya.' };
          } catch {
            return { ok: false, message: "Zoom isn't available here, sir." };
          }
        }
        return { ok: false, message: "Zoom isn't available here, sir." };
      },
      onLockHud: () => {
        setIsHudLocked(true);
        return { ok: true, message: 'HUD interaction lock ho gaya.' };
      },
    });
    const offEvent = globalNativeGestureBridge.onEventExternal((e) => {
      // Orb/HUD reaction to REAL detections only (events come from the device).
      const label = e.gesture.replace(/_/g, ' ').toUpperCase();
      const outcome = e.needsHudAction
        ? `${label} → ${e.action.replace(/_/g, ' ').toUpperCase()}…`
        : e.success
          ? `${label} → done, sir.`
          : `${label} → ${e.message}`;
      setWakewordBanner(`✋ ${outcome}`);
      setTimeout(() => setWakewordBanner(null), 2800);
    });
    void globalNativeGestureBridge.attach();
    return () => {
      offEvent();
    };
  }, [mediaViewport.isOpen]);

  const currentTheme = THEMES[theme] || THEMES.amber;
  const activeAnalyser = stateManagerRef.current ? stateManagerRef.current.getActiveAnalyser() : null;

  return (
    <div
      id="friday-root"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingWindowFile(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingWindowFile(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingWindowFile(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleUploadFiles(e.dataTransfer.files);
        }
      }}
      className="relative w-full h-dvh flex flex-col justify-between overflow-hidden bg-[#030405] text-slate-100 select-none font-sans"
    >
      {/* Futuristic animated backdrop + boot sequence (decorative corner frame removed) */}
      <FuturisticBackdrop state={state} accent={currentTheme.primary} />
      <BootOverlay accent={currentTheme.primary} accentLight={currentTheme.primaryLight} />
      {/* Global Window Drag-and-Drop Holographic Overlay */}
      {isDraggingWindowFile && (
        <div
          id="window-drag-overlay"
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#030405]/90 backdrop-blur-xl border-4 border-dashed animate-in fade-in"
          style={{ borderColor: currentTheme.primary }}
        >
          <div
            className="p-5 rounded-3xl border mb-3 flex items-center justify-center animate-bounce"
            style={{
              borderColor: currentTheme.primary,
              background: `${currentTheme.primary}22`,
              color: currentTheme.primaryLight,
            }}
          >
            <UploadCloud className="w-12 h-12" />
          </div>
          <h2 className="text-xl sm:text-2xl font-display font-extrabold text-slate-100 tracking-wider">
            RELEASE TO UPLINK PC FILES TO FRIDAY
          </h2>
          <p className="text-xs font-mono text-slate-400 mt-1">
            FRIDAY will immediately parse and prepare your files for voice inspection
          </p>
        </div>
      )}

      {/* Background Holographic Grid & Radial Aura */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 50%, ${currentTheme.primary}18 0%, transparent 65%),
            linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 40px 40px, 40px 40px',
        }}
      />

      {/* Futuristic Scanline Effect */}
      <div
        className="absolute inset-0 pointer-events-none opacity-15"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.4) 3px)',
        }}
      />

      {/* Top Header HUD */}
      <HUDHeader
        state={state}
        theme={theme}
        isCameraActive={isCameraActive}
        activeVoice={activeVoice}
        authProfile={authProfile}
        wakewordConfig={wakewordConfig}
        wakewordState={wakewordState}
        onSelectTheme={(newTheme) => setTheme(newTheme)}
        onOpenWakeword={() => setIsWakewordModalOpen(true)}
        onLockSession={() => {
          globalAuthManager.logout();
          SoundEffects.playAccessDenied();
        }}
        onOpenAuth={() => setIsAuthModalOpen(true)}
      />

      {/* Main Interactive Stage: reactor zone adaptive, neeche ka content alag scroll */}
      <main
        className="relative flex-1 flex flex-col items-center px-4 py-1.5 z-10 max-w-4xl mx-auto w-full min-h-0 overflow-hidden"
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        }}
      >
        {/* Error Alert Banner */}
        {errorMessage && (
          <div
            id="error-banner"
            className="mb-3 w-full max-w-md flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs font-mono backdrop-blur-md shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
              <span className="text-sm">{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:bg-red-900/60 rounded text-red-300 shrink-0"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Ambient Holographic State Guidance */}
        <div className="text-center mb-1">
          <div
            className="text-xs sm:text-sm font-mono tracking-widest uppercase font-bold transition-all duration-300"
            style={{ color: currentTheme.primaryLight }}
          >
            {state === 'disconnected' && 'TOUCH REACTOR CORE TO AWAKEN FRIDAY'}
            {state === 'connecting' && 'INITIALIZING QUANTUM SPEECH CHANNEL...'}
            {state === 'listening' &&
              (isCameraActive
                ? 'FRIDAY IS LISTENING & OBSERVING CAMERA'
                : 'FRIDAY IS LISTENING • SPEAK ANY LANGUAGE')}
            {state === 'speaking' && 'FRIDAY IS SPEAKING • INTERRUPT ANYTIME'}
          </div>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5 hidden sm:block">
            {state === 'disconnected'
              ? 'Omniglot voice AI with PC file intelligence, YouTube & Vision'
              : 'Direct bidirectional audio pipeline enabled • 100+ languages supported'}
          </p>
        </div>

        {/* Hands-Free Wakeword Recognition Event Banner */}
        {wakewordBanner && (
          <div className="my-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-xs font-mono flex items-center gap-2 shadow-2xl animate-bounce z-30">
            <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-ping" />
            <span>{wakewordBanner}</span>
          </div>
        )}

        {/* Central Core — FRIDAY Plasma Orb & Floating Camera Viewfinder (adaptive zone) */}
        <div className="friday-orb-zone relative flex w-full flex-none items-center justify-center my-1">
          <FridayOrb
            state={state}
            theme={theme}
            onToggle={handleToggleCore}
            analyser={activeAnalyser}
            toolActive={orbToolActive}
            toolStartAt={orbToolStartAt}
            wakeAt={orbWakeAt}
            lastResult={orbLastResult}
            errorAt={orbErrorAt}
          />

          {/* Floating Camera Viewfinder if active (kept inside viewport on small phones) */}
          {isCameraActive && (
            <div className="absolute top-0 right-0 z-30 max-w-[70vw] sm:max-w-none">
              <HUDCameraFeed
                videoElement={cameraVideoEl}
                theme={theme}
                onFlip={handleFlipCamera}
                onClose={handleToggleCamera}
              />
            </div>
          )}
        </div>

        {/* Hologram library — opens from MORE > Create > Hologram or voice; no main-screen button. */}
        {libOpen && (
          <div className="w-full max-w-xl flex-none px-2">
            <React.Suspense
              fallback={
                <div className="w-full rounded-2xl border border-amber-500/30 bg-black/60 p-4 text-center font-mono text-xs tracking-widest text-amber-300">
                  LOADING LIBRARY…
                </div>
              }
            >
              <HUDHologramLibrary accent={currentTheme.primary} onClose={() => setLibOpen(false)} onOpen={openLibraryModel} />
            </React.Suspense>
          </div>
        )}
        {/* Hologram viewer — renders only when a hologram is actually open (via voice or MORE). */}
        {hologram && hologram.isOpen && (
          <div className="w-full max-w-xl flex-none px-2">
            <React.Suspense
              fallback={
                <div className="w-full rounded-2xl border border-amber-500/30 bg-black/60 p-4 text-center font-mono text-xs tracking-widest text-amber-300">
                  LOADING HOLOGRAM ENGINE…
                </div>
              }
            >
              <HUDHologramViewer
                ref={hologramRef}
                request={hologram}
                compare={hologramCompare}
                theme={theme}
                onClose={() => {
                  hologramOpenRef.current = false;
                  setHologram(null);
                  setHologramCompare(null);
                }}
                onStatus={(status, extra) => {
                  setHologram((prev) => (prev ? { ...prev, status, ...(extra || {}) } : prev));
                }}
                onUpgradeRequired={() => setUpgradeAsk({ featureLabel: '3D model upload', requiredPlan: 'PLUS' })}
              />
            </React.Suspense>
          </div>
        )}

        {/* Neeche ka scrollable content (waveform, meter, banners, cards) */}
        <div className="w-full flex-1 min-h-0 overflow-y-auto flex flex-col items-center">
        {/* Dynamic 60fps Audio Waveform Display */}
        <div className="w-full max-w-xl my-1 flex-none">
          <DynamicWaveform
            analyser={activeAnalyser}
            state={state}
            theme={theme}
          />
        </div>

        {/* Live Mic Level Meter - mic sun raha hai ya nahi, yahi dikhega */}
        <HUDMicMeter
          visible={state === 'listening' || state === 'speaking'}
          getStats={() => stateManagerRef.current?.getStreamer().getMicStats() || null}
        />

        {/* Syllabus Continuity Banner: Where we left off & tomorrow's plan */}
        <div
          id="syllabus-continuity-banner"
          onClick={() => setIsStudyMatrixOpen(true)}
          className="cursor-pointer max-w-xl w-full flex-none my-1.5 p-2.5 rounded-xl bg-slate-900/80 border hover:border-amber-400/80 transition-all flex items-center justify-between text-xs font-mono text-slate-300 shadow-xl group backdrop-blur-md"
          style={{ borderColor: 'rgba(245, 158, 11, 0.45)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div className="truncate text-left">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-bold uppercase tracking-wider text-[10px]">
                  LEFT OFF:
                </span>
                <span className="text-slate-100 font-sans truncate font-medium text-xs sm:text-sm">
                  "{curriculum.leftOffTopic || curriculum.currentTopic}"
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate">
                {curriculum.subject} • Step {curriculum.currentStep}/{curriculum.totalSteps} ({(curriculum.level || 'beginner').toUpperCase()})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-amber-400 shrink-0 font-mono ml-2 group-hover:text-amber-300">
            <span className="hidden sm:inline">Tomorrow: {curriculum.nextSessionPlan ? 'Scheduled' : 'Plan Next'}</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>



        {/* Floating Weather Widget if retrieved */}
        {weather && (
          <div className="w-full max-w-sm my-2 z-30 flex-none">
            <HUDWeatherWidget
              weather={weather}
              theme={theme}
              onClose={() => setWeather(null)}
            />
          </div>
        )}

        {/* Floating Action Cards (Triggered by voice tools) */}
        {actionCards.length > 0 && (
          <div className="w-full max-w-md space-y-2 mt-1.5 z-30 flex-none">
            {actionCards.map((card) => (
              <HUDActionCard
                key={card.id}
                card={card}
                theme={theme}
                onDismiss={handleDismissCard}
              />
            ))}
          </div>
        )}

        {/* Floating Active Countdown Timers */}
        {timers.length > 0 && (
          <div className="w-full max-w-md space-y-2 mt-1.5 z-30 flex-none">
            {timers.map((timer) => (
              <HUDTimer
                key={timer.id}
                timer={timer}
                theme={theme}
                onDismiss={handleDismissTimer}
              />
            ))}
          </div>
        )}
        </div>
      </main>

      {/* Cybernetic PC File Vault Modal */}
      <HUDFileVault
        isOpen={isFilesOpen}
        files={files}
        theme={theme}
        onClose={() => setIsFilesOpen(false)}
        onUploadFiles={handleUploadFiles}
        onDeleteFile={handleDeleteFile}
      />

      {/* Omniglot Multilingual Matrix Modal */}
      <HUDLanguageMatrix
        isOpen={isLanguageMatrixOpen}
        theme={theme}
        activeLanguage={activeLanguage}
        onSelectLanguage={(lang) => {
          setActiveLanguage(lang);
          setIsLanguageMatrixOpen(false);
        }}
        onClose={() => setIsLanguageMatrixOpen(false)}
      />

      {/* In-App Cybernetic Media Viewport (Embedded YouTube / Web) */}
      <HUDMediaViewport
        viewport={mediaViewport}
        theme={theme}
        onClose={() => setMediaViewport((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Voice Notes Scratchpad Slide-Over Drawer */}
      <HUDNotesDrawer
        isOpen={isNotesOpen}
        notes={notes}
        theme={theme}
        onClose={() => setIsNotesOpen(false)}
        onAddNote={handleAddNote}
        onDeleteNote={handleDeleteNote}
      />

      {/* Task Checklist Slide-Over Drawer */}
      <HUDTasksDrawer
        isOpen={isTasksOpen}
        tasks={tasks}
        theme={theme}
        onClose={() => setIsTasksOpen(false)}
        onAddTask={handleAddTask}
        onToggleTask={handleToggleTask}
        onDeleteTask={handleDeleteTask}
      />

      {/* Voice & Persona Settings Modal */}
      <HUDVoiceSettings
        isOpen={isVoiceSettingsOpen}
        currentVoice={currentVoice}
        currentWit={currentWit}
        theme={theme}
        onSelectVoice={handleSelectVoice}
        onSelectWit={handleSelectWit}
        onClose={() => setIsVoiceSettingsOpen(false)}
      />

      {/* Image Generator / Vision Matrix */}
      <HUDImageGenerator
        isOpen={isImageGeneratorOpen}
        theme={theme}
        onClose={() => setIsImageGeneratorOpen(false)}
      />

      {/* Emotional Metadata Diagnostics & Calibration Modal */}
      <HUDEmotionalProcessor
        isOpen={isEmotionalDiagnosticsOpen}
        metadata={emotionalMetadata}
        theme={theme}
        onSelectTone={handleSelectEmotionalTone}
        onClose={() => setIsEmotionalDiagnosticsOpen(false)}
      />

      {/* Persistent Long-Term Memory Synapses Archive */}
      <HUDMemoryArchive
        isOpen={isMemoriesOpen}
        memories={memories}
        theme={theme}
        onClose={() => setIsMemoriesOpen(false)}
        onAddMemory={handleAddMemory}
        onDeleteMemory={handleDeleteMemory}
        onResetDefaults={handleResetMemories}
      />

      {/* Commander Clearance & Security Protocol Management */}
      <HUDAuthModal
        isOpen={isAuthModalOpen}
        profile={authProfile}
        theme={theme}
        onClose={() => setIsAuthModalOpen(false)}
        onUpdateProfile={handleUpdateProfile}
        onLockSession={() => {
          globalAuthManager.logout();
          setIsAuthModalOpen(false);
          SoundEffects.playAccessDenied();
        }}
      />

      {/* Hands-Free Wakeword Detection HUD Settings */}
      <HUDWakewordSettings
        isOpen={isWakewordModalOpen}
        config={wakewordConfig}
        state={wakewordState}
        theme={theme}
        onClose={() => setIsWakewordModalOpen(false)}
        onUpdateConfig={handleUpdateWakewordConfig}
        onTestChime={() => SoundEffects.playWakewordChime()}
      />

      {/* Native Android gesture camera settings (on-device, additive) */}
      <HUDGestureSettings
        isOpen={isGestureSettingsOpen}
        theme={theme}
        onClose={() => setIsGestureSettingsOpen(false)}
        onWakeHud={() => {
          setWakewordBanner('✋ FRIDAY awake, sir.');
          setTimeout(() => setWakewordBanner(null), 3000);
        }}
      />

      {/* FRIDAY Share — nearby file sharing over the paired-device relay */}
      <HUDShare
        isOpen={isShareOpen}
        theme={theme}
        onClose={() => setIsShareOpen(false)}
      />

      {/* Fist-gesture HUD interaction lock (real lock, tap to unlock) */}
      {isHudLocked && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl bg-slate-900 border border-amber-500/40 p-6 text-center max-w-xs">
            <div className="text-3xl mb-2">✊</div>
            <div className="text-sm font-mono font-bold text-slate-100">HUD LOCKED</div>
            <p className="text-[11px] font-mono text-slate-400 mt-1">Fist gesture ne interaction lock kiya. Phone lock nahi hua — sirf HUD.</p>
            <button
              type="button"
              onClick={() => setIsHudLocked(false)}
              className="mt-4 px-5 py-2 rounded-xl text-xs font-mono font-bold text-slate-950 cursor-pointer"
              style={{ backgroundColor: currentTheme.primary }}
            >
              Unlock HUD
            </button>
          </div>
        </div>
      )}

      {/* Floating Real-Time Screen Watching Feed (Teacher Viewfinder) */}
      {isScreenWatching && screenVideoEl && (
        <HUDScreenFeed
          videoElement={screenVideoEl}
          theme={theme}
          resolution={screenResolution}
          streamLabel={screenStreamLabel}
          onClose={() => {
            stateManagerRef.current?.stopScreenWatch();
            setIsScreenWatching(false);
            setScreenVideoEl(null);
          }}
          onOpenStudyMatrix={() => setIsStudyMatrixOpen(true)}
        />
      )}

      {/* Stark Academy / Professor FRIDAY Study Curriculum & Continuity Matrix */}
      <HUDStudyMatrix
        curriculum={curriculum}
        isOpen={isStudyMatrixOpen}
        theme={theme}
        isScreenWatching={isScreenWatching}
        onToggleScreenWatch={handleToggleScreenWatch}
        onClose={() => setIsStudyMatrixOpen(false)}
      />

      {/* Stark Holographic Code & Circuit Workbench */}
      <HUDCodeWorkbench
        isOpen={isWorkbenchOpen}
        initialCode={workbenchCode}
        initialLanguage={workbenchLang}
        theme={theme}
        onClose={() => setIsWorkbenchOpen(false)}
      />

      {/* Autonomous Tactical Protocols Hub */}
      <HUDProtocolManager
        isOpen={isProtocolsOpen}
        theme={theme}
        onClose={() => setIsProtocolsOpen(false)}
        onSetTheme={(t) => {
          setTheme(t);
          stateManagerRef.current?.setTheme(t);
        }}
        onSetTimer={(sec, lbl) => {
          setTimers((prev) => [
            ...prev,
            { id: `timer-${Date.now()}`, label: lbl, totalSeconds: sec, remainingSeconds: sec, isRunning: true },
          ]);
        }}
        onAddActionCard={(card) => {
          setActionCards((prev) => [card, ...prev.slice(0, 3)]);
        }}
      />

      {/* Neural Memory & Concept Knowledge Graph (D3.js) */}
      <HUDKnowledgeGraph
        isOpen={isKnowledgeGraphOpen}
        theme={theme}
        onClose={() => setIsKnowledgeGraphOpen(false)}
      />

      {/* Mission Debrief & Audio Transcript Exporter */}
      <HUDDebriefModal
        isOpen={isDebriefOpen}
        theme={theme}
        onClose={() => setIsDebriefOpen(false)}
      />

      {/* Stark Classified Private Vault (voice: "private folder open karo") */}
      <HUDPrivateVault
        isOpen={isPrivateVaultOpen}
        theme={theme}
        onClose={() => setIsPrivateVaultOpen(false)}
      />

      {/* Stark Holographic Calculator (voice: "calculator kholo" / "calculate ...") */}
      <HUDCalculator
        isOpen={isCalculatorOpen}
        theme={theme}
        initialExpression={calculatorInitialExpr}
        onClose={() => setIsCalculatorOpen(false)}
      />

      {/* Daily Routine & Preferences Matrix */}
      <HUDRoutinePreferences
        isOpen={isRoutinePrefsOpen}
        theme={theme}
        onClose={() => setIsRoutinePrefsOpen(false)}
      />

      {/* PC Voice Control & Native Desktop Bridge */}
      <HUDDesktopBridgeModal
        isOpen={isDesktopBridgeOpen}
        theme={theme}
        onClose={() => setIsDesktopBridgeOpen(false)}
        onOpenCalculator={() => {
          setCalculatorInitialExpr('');
          setIsDesktopBridgeOpen(false);
          setIsCalculatorOpen(true);
        }}
        onOpenYouTube={() => {
          setIsDesktopBridgeOpen(false);
          handleQuickYouTube();
        }}
        onOpenFileVault={() => {
          setIsDesktopBridgeOpen(false);
          setIsFilesOpen(true);
        }}
        onOpenPrivateVault={() => {
          setIsDesktopBridgeOpen(false);
          setIsPrivateVaultUnlocked(globalPrivateVault.isUnlocked());
          setIsPrivateVaultOpen(true);
        }}
      />

      {/* Voice Authentication Enrollment */}
      <HUDVoiceEnrollment
        isOpen={isVoiceEnrollmentOpen}
        onClose={() => setIsVoiceEnrollmentOpen(false)}
        onEnrollmentComplete={() => {
          try { SoundEffects.playAccessGranted(); } catch {}
          setErrorMessage('✅ Voice authentication enrolled successfully');
          setTimeout(() => setErrorMessage(null), 3000);
        }}
        stateManager={stateManagerRef.current}
      />

      {/* Floating CHAT button (PC only — mobile me ⋯ More menu me) */}
      {!isMobileUI && !isChatOpen && !isFunHubOpen && !isVoiceEnrollmentOpen && !isFaceEnrollmentOpen && !isDeviceLinkOpen && (
        <button
          type="button"
          onClick={() => setIsChatOpen(true)}
          title="Chat with FRIDAY"
          className="fixed bottom-52 right-4 z-[9999] flex items-center gap-2 px-4 py-3 rounded-full font-bold text-sm shadow-2xl border-2 transition-all hover:scale-105 cursor-pointer"
          style={{
            backgroundColor: '#10b981',
            borderColor: '#6ee7b7',
            color: '#fff',
            boxShadow: '0 0 25px rgba(16,185,129,0.7)',
          }}
        >
          💬 CHAT
        </button>
      )}

      <HUDChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      {/* Face Verification Enrollment (real face-api.js, 100% local) */}
      <HUDFaceEnrollment isOpen={isFaceEnrollmentOpen} onClose={() => setIsFaceEnrollmentOpen(false)} />

      {/* Device Link: PC <-> Phone real relay */}
      <HUDDeviceLink isOpen={isDeviceLinkOpen} onClose={() => setIsDeviceLinkOpen(false)} />

      {/* Phone Assistant - Real Android Control */}
      <HUDPhoneAssistant isOpen={isPhoneAssistantOpen} onClose={() => setIsPhoneAssistantOpen(false)} theme={theme} />

      {/* Permission Center - Android Permissions */}
      <HUDPermissionCenter isOpen={isPermissionCenterOpen} onClose={() => setIsPermissionCenterOpen(false)} theme={theme} />

      {/* Screen Assist - explicit opt-in screen help (never hidden surveillance) */}
      <HUDScreenAssist
        isOpen={isScreenAssistOpen}
        onClose={() => setIsScreenAssistOpen(false)}
        theme={theme}
        onChanged={(on) => setScreenAssistActive(on)}
      />

      {/* Screen Assist active indicator (re-opening settings stays PRO-gated) */}
      {screenAssistActive && !isScreenAssistOpen && (
        <button
          type="button"
          onClick={() => openGated('SCREEN_AWARENESS', 'PRO', 'Screen Assist', () => setIsScreenAssistOpen(true))}
          title="Screen Assist ON — tap to manage"
          className="fixed bottom-36 left-4 z-[9999] flex items-center gap-2 px-3 py-2 rounded-full font-mono font-bold text-[11px] shadow-2xl border-2 cursor-pointer"
          style={{ backgroundColor: 'rgba(16,185,129,0.15)', borderColor: '#10b981', color: '#6ee7b7' }}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          SCREEN ASSIST ON
        </button>
      )}

      {/* Floating PHONE ASSISTANT button (PC only — mobile me ⋯ More menu me) */}
      {!isMobileUI && !isPhoneAssistantOpen && !isAppBuilderOpen && !isDeviceLinkOpen && !isChatOpen && (
        <button
          type="button"
          onClick={() => setIsPhoneAssistantOpen(true)}
          title="Phone Assistant - Real Android Control"
          className="fixed bottom-[29rem] right-4 z-[9999] flex items-center gap-2 px-4 py-3 rounded-full font-bold text-sm shadow-2xl border-2 transition-all hover:scale-105 cursor-pointer"
          style={{ backgroundColor: '#0ea5e9', borderColor: '#38bdf8', color: '#fff', boxShadow: '0 0 25px rgba(14,165,233,0.7)' }}
        >
          📱 PHONE
        </button>
      )}

      {/* [AppBuilder hook] isolated add-on modal + launcher (PRO entitlement gated) */}
      <HUDAppBuilder isOpen={isAppBuilderOpen} onClose={() => setIsAppBuilderOpen(false)} />
      {!isMobileUI && !isAppBuilderOpen && !isDeviceLinkOpen && !isChatOpen && (
        <button
          type="button"
          onClick={() => openGated('APP_BUILDER', 'PRO', 'App Builder', () => setIsAppBuilderOpen(true))}
          title="App Builder - Calculator / Tic-Tac-Toe banao"
          className="fixed bottom-[25rem] right-4 z-[9999] flex items-center gap-2 px-4 py-3 rounded-full font-bold text-sm shadow-2xl border-2 transition-all hover:scale-105 cursor-pointer"
          style={{ backgroundColor: '#0891b2', borderColor: '#FFE600', color: '#fff', boxShadow: '0 0 25px rgba(216,138,0,0.7)' }}
        >
          🛠️ APPS
        </button>
      )}

      {/* Floating DEVICE LINK button (PC only — mobile me ⋯ More menu me) */}
      {!isMobileUI && !isDeviceLinkOpen && !isFaceEnrollmentOpen && !isVoiceEnrollmentOpen && !isFunHubOpen && !isChatOpen && (
        <button
          type="button"
          onClick={() => setIsDeviceLinkOpen(true)}
          title="Device Link - Phone pair karo"
          className="fixed bottom-[21rem] right-4 z-[9999] flex items-center gap-2 px-4 py-3 rounded-full font-bold text-sm shadow-2xl border-2 transition-all hover:scale-105 cursor-pointer"
          style={{
            backgroundColor: '#059669',
            borderColor: '#6ee7b7',
            color: '#fff',
            boxShadow: '0 0 25px rgba(5,150,105,0.7)',
          }}
        >
          🔗 LINK
        </button>
      )}

      {/* Floating FACE ID button (PC only — mobile me ⋯ More menu me) */}
      {!isMobileUI && !isFaceEnrollmentOpen && !isVoiceEnrollmentOpen && !isFunHubOpen && !isChatOpen && !isDeviceLinkOpen && (
        <button
          type="button"
          onClick={() => setIsFaceEnrollmentOpen(true)}
          title="Face Verification Setup"
          className="fixed bottom-[17rem] right-4 z-[9999] flex items-center gap-2 px-4 py-3 rounded-full font-bold text-sm shadow-2xl border-2 transition-all hover:scale-105 cursor-pointer"
          style={{
            backgroundColor: '#8b5cf6',
            borderColor: '#c4b5fd',
            color: '#fff',
            boxShadow: '0 0 25px rgba(139,92,246,0.7)',
          }}
        >
          🧬 FACE ID
        </button>
      )}

      {/* Floating VOICE LOCK button - hamesha dikhega (PC only — mobile me ⋯ More menu me) */}
      {!isMobileUI && !isVoiceEnrollmentOpen && !isFunHubOpen && !isChatOpen && !isFaceEnrollmentOpen && !isDeviceLinkOpen && (
        <button
          type="button"
          onClick={() => setIsVoiceEnrollmentOpen(true)}
          title="Voice Authentication Setup"
          className="fixed bottom-20 right-4 z-[9999] flex items-center gap-2 px-4 py-3 rounded-full font-bold text-sm shadow-2xl border-2 transition-all hover:scale-105 cursor-pointer"
          style={{
            backgroundColor: '#FFC400',
            borderColor: '#FFC400',
            color: '#fff',
            boxShadow: '0 0 25px rgba(255,196,0,0.7)',
          }}
        >
          🛡️ VOICE LOCK
        </button>
      )}

      {/* Floating FUN HUB button (PC only — mobile me ⋯ More menu me) */}
      {!isMobileUI && !isFunHubOpen && !isVoiceEnrollmentOpen && !isChatOpen && !isFaceEnrollmentOpen && !isDeviceLinkOpen && (
        <button
          type="button"
          onClick={() => setIsFunHubOpen(true)}
          title="Fun Hub - News, Jokes, Quiz, Story"
          className="fixed bottom-36 right-4 z-[9999] flex items-center gap-2 px-4 py-3 rounded-full font-bold text-sm shadow-2xl border-2 transition-all hover:scale-105 cursor-pointer"
          style={{
            backgroundColor: '#d946ef',
            borderColor: '#f0abfc',
            color: '#fff',
            boxShadow: '0 0 25px rgba(217,70,239,0.7)',
          }}
        >
          🎉 FUN HUB
        </button>
      )}

      {/* [MoreMenu] Categorized feature menu — every entry opens a real panel. */}
      <HUDMoreMenu
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        sections={[
          { title: 'Assistant', actions: [
            { id: 'chat', label: 'Chat', icon: '💬', onOpen: () => setIsChatOpen(true) },
            { id: 'fun', label: 'Fun Hub', icon: '🎉', onOpen: () => setIsFunHubOpen(true) },
            { id: 'voiceset', label: 'Voice Setup', icon: '🎙️', onOpen: () => setIsVoiceSettingsOpen(true) },
            { id: 'wakeword', label: 'Wakeword', icon: '👂', onOpen: () => setIsWakewordModalOpen(true) },
            { id: 'lang', label: 'Languages', icon: '🌐', onOpen: () => setIsLanguageMatrixOpen(true) },
            { id: 'emotion', label: 'Emotion', icon: '💓', onOpen: () => setIsEmotionalDiagnosticsOpen(true) },
          ]},
          { title: 'Phone', actions: [
            { id: 'phone', label: 'Phone', icon: '📱', onOpen: () => setIsPhoneAssistantOpen(true) },
            { id: 'camera', label: 'Camera', icon: '📷', onOpen: handleToggleCamera },
            { id: 'screenwatch', label: 'Screen Watch', icon: '👁️', badge: 'PRO', onOpen: handleToggleScreenWatch },
            { id: 'screenassist', label: 'Screen Assist', icon: '👁️', badge: 'PRO', onOpen: () => openGated('SCREEN_AWARENESS', 'PRO', 'Screen Assist', () => setIsScreenAssistOpen(true)) },
          ]},
          { title: 'Share & Devices', actions: [
            { id: 'share', label: 'Share', icon: '⤨', onOpen: () => setIsShareOpen(true) },
            { id: 'xfer', label: 'File Transfer', icon: '⇄', onOpen: () => setIsFileTransferOpen(true) },
            { id: 'link', label: 'Device Link', icon: '🔗', onOpen: () => setIsDeviceLinkOpen(true) },
            { id: 'secure', label: 'Secure Devices', icon: '🔒', onOpen: () => setIsSecureDevicesOpen(true) },
            { id: 'bridge', label: 'PC Bridge', icon: '🖥️', onOpen: () => setIsDesktopBridgeOpen(true) },
          ]},
          { title: 'Create', actions: [
            { id: 'apps', label: 'App Builder', icon: '🛠️', badge: 'PRO', onOpen: () => openGated('APP_BUILDER', 'PRO', 'App Builder', () => setIsAppBuilderOpen(true)) },
            { id: 'hologram', label: 'Hologram', icon: '❖', badge: 'PRO', onOpen: () => openGated('HOLOGRAM_LIBRARY', 'PRO', 'Hologram library', () => setLibOpen(true)) },
            { id: 'workbench', label: 'Code', icon: '💻', onOpen: () => setIsWorkbenchOpen(true) },
            { id: 'image', label: 'Image Gen', icon: '🎨', onOpen: () => setIsImageGeneratorOpen(true) },
            { id: 'calc', label: 'Calculator', icon: '🔢', onOpen: () => setIsCalculatorOpen(true) },
            { id: 'gestures', label: 'Gestures', icon: '✋', badge: 'PRO', onOpen: () => openGated('GESTURES_ADVANCED', 'PRO', 'Advanced gestures', () => setIsGestureSettingsOpen(true)) },
          ]},
          { title: 'Learn', actions: [
            { id: 'study', label: 'Study', icon: '📚', onOpen: () => setIsStudyMatrixOpen(true) },
            { id: 'notes', label: 'Notes', icon: '📝', onOpen: () => setIsNotesOpen(true) },
            { id: 'tasks', label: 'Tasks', icon: '✅', onOpen: () => setIsTasksOpen(true) },
            { id: 'files', label: 'Files', icon: '📁', onOpen: () => setIsFilesOpen(true) },
            { id: 'memory', label: 'Memory', icon: '🧠', onOpen: () => setIsMemoriesOpen(true) },
            { id: 'graph', label: 'Knowledge', icon: '🕸️', badge: 'PRO', onOpen: () => openGated('MEMORY_ADVANCED', 'PRO', 'Knowledge graph', () => setIsKnowledgeGraphOpen(true)) },
            { id: 'protocols', label: 'Protocols', icon: '📜', badge: 'PRO', onOpen: () => openGated('AUTOMATION', 'PRO', 'Automation protocols', () => setIsProtocolsOpen(true)) },
            { id: 'debrief', label: 'Debrief', icon: '📊', onOpen: () => setIsDebriefOpen(true) },
            { id: 'routine', label: 'Routines', icon: '⏰', onOpen: () => setIsRoutinePrefsOpen(true) },
          ]},
          { title: 'Security', actions: [
            { id: 'vault', label: 'Vault', icon: '🗝️', onOpen: () => setIsPrivateVaultOpen(true) },
            { id: 'voicelock', label: 'Voice Lock', icon: '🛡️', onOpen: () => setIsVoiceEnrollmentOpen(true) },
            { id: 'faceid', label: 'Face ID', icon: '🧬', onOpen: () => setIsFaceEnrollmentOpen(true) },
            { id: 'auth', label: 'Lock/Auth', icon: '🔐', onOpen: () => setIsAuthModalOpen(true) },
            { id: 'permissions', label: 'Permissions', icon: '🔐', onOpen: () => setIsPermissionCenterOpen(true) },
          ]},
          { title: 'Account', actions: [
            { id: 'plans', label: 'Subscription', icon: '💎', onOpen: () => setIsSubscriptionOpen(true) },
            { id: 'update', label: 'Update', icon: '⬆️', onOpen: async () => {
              try {
                setUpdateCheck(await checkForUpdate());
              } catch {
                setUpdateCheck(null);
              }
              setIsUpdateOpen(true);
            } },
          ]},
        ]}
      />
      {isMobileUI && !isMoreOpen && !isChatOpen && !isFunHubOpen && !isVoiceEnrollmentOpen && !isFaceEnrollmentOpen && !isDeviceLinkOpen && !isAppBuilderOpen && !isNotesOpen && !isTasksOpen && !isMemoriesOpen && !isCalculatorOpen && !isImageGeneratorOpen && !isWorkbenchOpen && !isStudyMatrixOpen && !isFilesOpen && !isPhoneAssistantOpen && !isScreenAssistOpen && !isGestureSettingsOpen && !isShareOpen && (
        <button
          type="button"
          onClick={() => setIsMoreOpen(true)}
          title="More - saare features"
          className="fixed bottom-20 right-4 z-[9999] flex items-center gap-2 px-5 py-3.5 rounded-full font-bold text-sm shadow-2xl border-2 active:scale-95 cursor-pointer"
          style={{ backgroundColor: '#0891b2', borderColor: '#FFE600', color: '#fff', boxShadow: '0 0 25px rgba(216,138,0,0.7)' }}
        >
          ⋯ MORE
        </button>
      )}

      <HUDFunHub isOpen={isFunHubOpen} onClose={() => setIsFunHubOpen(false)} />

      {/* Subscription: Upgrade FRIDAY (plans, prices, restore) + upgrade prompt for locked features */}
      <HUDSubscription isOpen={isSubscriptionOpen} onClose={() => setIsSubscriptionOpen(false)} theme={theme} />
      {/* In-app update dialog (version check result drives it; nothing faked) */}
      <UpdateDialog isOpen={isUpdateOpen} onClose={() => setIsUpdateOpen(false)} initial={updateCheck} />
      <UpgradePrompt
        isOpen={upgradeAsk !== null}
        featureLabel={upgradeAsk?.featureLabel || ''}
        requiredPlan={upgradeAsk?.requiredPlan || 'PRO'}
        onViewPlans={() => { setUpgradeAsk(null); setIsSubscriptionOpen(true); }}
        onLater={() => setUpgradeAsk(null)}
      />
      <HUDFileTransfer isOpen={isFileTransferOpen} onClose={() => setIsFileTransferOpen(false)} theme={theme} targetId={ftTargetId} />
      <HUDSecureDevices isOpen={isSecureDevicesOpen} onClose={() => setIsSecureDevicesOpen(false)} theme={theme} />

      {/* FRIDAY Security Gate: mobile = futuristic login, PC = cyber-lock gate. Bina login HUD lock rehta hai. */}
      {!authProfile.isAuthenticated && (
        isMobileApp() ? (
          <HUDFridayMobileLogin
            isSetup={!globalAuthManager.hasPasscode()}
            onAuthenticate={(passcode) => globalAuthManager.authenticateWithPasscode(passcode)}
          />
        ) : (
          <HUDFridayLogin
            isSetup={!globalAuthManager.hasPasscode()}
            onAuthenticate={(passcode) => globalAuthManager.authenticateWithPasscode(passcode)}
          />
        )
      )}

      {/* Bottom Telemetry & Voice Hints */}
      <HUDFooter state={state} theme={theme} />
    </div>
  );
}
