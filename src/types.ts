export type AssistantState = 'disconnected' | 'connecting' | 'listening' | 'speaking';

export type ThemeAccent = 'cyan' | 'amber' | 'emerald' | 'violet' | 'rose';

export type LiveVoice = 'Aoede' | 'Kore' | 'Puck' | 'Fenrir' | 'Zephyr';

export type WitLevel = 'polite' | 'balanced' | 'witty' | 'sarcastic';

export type EmotionalTone =
  | 'neutral'
  | 'joyful'
  | 'excited'
  | 'empathetic'
  | 'playful'
  | 'thoughtful'
  | 'alert';

export interface EmotionalMetadata {
  tone: EmotionalTone;
  valence: number; // -1.0 (negative/concerned) to 1.0 (positive/joyful)
  arousal: number; // 0.0 (calm/peaceful) to 1.0 (hyper-energized)
  glowIntensity: number; // 0.5 to 2.5 multiplier
  pulseFrequency: number; // 0.4 Hz to 3.5 Hz
  pulseDuration: number; // Duration in seconds per cycle (1 / pulseFrequency)
  ambientColor: string; // Emotional tint overlay
  label: string;
  summary: string;
}

export interface FunctionCallItem {
  id: string;
  name: string;
  args?: Record<string, any>;
}

export interface FunctionResponseItem {
  id: string;
  name: string;
  response: {
    output?: any;
    result?: any;
    error?: string;
  };
}

export interface ActionCard {
  id: string;
  type: 'website' | 'web' | 'youtube' | 'timer' | 'theme' | 'weather' | 'note' | 'task' | 'file' | 'info' | 'calc';
  title: string;
  description: string;
  url?: string;
  actionLabel?: string;
  timestamp: number;
  data?: any;
}

export interface CountdownTimer {
  id: string;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
}

export interface WeatherInfo {
  location: string;
  temperature: number;
  condition: string;
  humidity?: number;
  windSpeed?: number;
  high?: number;
  low?: number;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  userId?: string;
}

export interface TaskItem {
  id: string;
  task: string;
  completed: boolean;
  priority: 'high' | 'normal' | 'low';
  createdAt: number;
}

export interface MediaViewportState {
  isOpen: boolean;
  title: string;
  query: string;
  embedUrl: string;
  externalUrl: string;
  type: 'youtube' | 'web';
}

export interface CameraState {
  isActive: boolean;
  facingMode: 'user' | 'environment';
}

export interface PCFileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  extension: string;
  content: string;
  previewSnippet: string;
  dataUrl?: string;
  uploadedAt: number;
}

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export interface MemoryItem {
  id: string;
  category: 'personal' | 'preference' | 'project' | 'fact' | 'instruction' | 'identity';
  key: string;
  content: string;
  importance: 'critical' | 'high' | 'normal';
  createdAt: number;
  lastRecalledAt?: number;
}

export interface UserProfile {
  commanderName: string;
  callSign: string;
  clearanceLevel: string;
  passcode: string;
  voiceprintVerified: boolean;
  enforceCommanderOnly: boolean;
  isAuthenticated: boolean;
  lastLoginAt?: number;
  authorizedVoiceprints?: string[];
}

export interface WakewordConfig {
  enabled: boolean;
  keyword: string; // e.g., 'hey friday', 'friday', 'myraa', 'jarvis'
  autoConnectOnWake: boolean;
  audioFeedback: boolean;
}

export interface WakewordState {
  isListening: boolean;
  isSupported: boolean;
  lastDetectedWord?: string;
  lastDetectedTime?: number;
  statusMessage?: string;
}

export type StudyLevel = 'beginner' | 'intermediate' | 'advanced' | 'mastery';

export interface StudyCurriculum {
  id: string;
  subject: string;
  level: StudyLevel;
  currentTopic: string;
  currentStep: number;
  totalSteps: number;
  leftOffTopic: string;
  nextSessionPlan: string;
  completedConcepts: string[];
  keyTakeaways: string[];
  practiceChallenge?: string;
  lastStudiedAt: number;
  streakDays: number;
  teacherPersona: 'professor' | 'mentor' | 'stark_academy';
}

export interface ScreenShareState {
  isActive: boolean;
  resolution?: { width: number; height: number };
  streamLabel?: string;
}

// Feature 1: Code & Circuit Workbench
export interface CodeSnippet {
  id: string;
  title: string;
  language: 'javascript' | 'typescript' | 'python' | 'json';
  code: string;
  description?: string;
  category?: 'ai' | 'reactor' | 'algorithm' | 'audio' | 'general';
}

export interface CircuitState {
  coreVoltage: number; // 0 - 1200 V
  frequency: number; // 1 - 100 Hz
  fluxPercent: number; // 0 - 100 %
  overdrive: boolean;
  activePath: 'palladium' | 'vibranium' | 'repulsor' | 'quantum';
}

// Feature 2: Autonomous Protocols
export type ProtocolId =
  | 'morning_briefing'
  | 'clean_slate'
  | 'deep_focus'
  | 'overclock'
  | 'evening_debrief';

export interface ProtocolDefinition {
  id: ProtocolId;
  name: string;
  callsign: string;
  description: string;
  icon: string;
  accent: ThemeAccent;
  steps: string[];
}

// Feature 4: Neural Concept Knowledge Graph (D3.js)
export type GraphNodeGroup =
  | 'commander'
  | 'memory'
  | 'curriculum'
  | 'subsystem'
  | 'concept';

export interface KnowledgeGraphNode {
  id: string;
  name: string;
  group: GraphNodeGroup;
  value: number; // node weight/size
  category?: string;
  details?: string;
  createdAt?: number;
  // D3 force simulation properties
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface KnowledgeGraphLink {
  source: string | KnowledgeGraphNode;
  target: string | KnowledgeGraphNode;
  value: number; // link strength/distance
  relationship?: string;
}

// Feature 5: Session Debrief & Transcript Exporter
export type TranscriptSender = 'user' | 'friday' | 'system' | 'tool';

export interface TranscriptEntry {
  id: string;
  timestamp: number;
  sender: TranscriptSender;
  text: string;
  toolName?: string;
  metadata?: Record<string, any>;
}

export interface SessionDebriefStats {
  sessionDurationSeconds: number;
  userTurns: number;
  assistantTurns: number;
  toolsInvokedCount: number;
  conceptsReviewedCount: number;
  primaryTone: EmotionalTone;
}

// Classified Private Vault Types
export interface PrivateFileItem {
  id: string;
  name: string;
  content: string;
  category: 'credentials' | 'secret_code' | 'personal_log' | 'confidential_project' | 'document';
  classification: 'TOP SECRET' | 'RESTRICTED' | 'EYES ONLY';
  size: number;
  extension: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  isLocked?: boolean;
}

// Commander Preferences & Daily Routine Types
export interface DailyRoutineItem {
  id: string;
  timeSlot: string; // e.g. "08:00 AM - 09:00 AM"
  activity: string; // e.g. "Morning Coffee & System Check"
  category: 'morning' | 'work' | 'study' | 'workout' | 'evening' | 'night';
  notes?: string;
  isActive: boolean;
}

export interface CommanderPreference {
  id: string;
  type: 'like' | 'dislike';
  category: 'food_beverage' | 'work_habit' | 'technology' | 'lifestyle' | 'music' | 'communication';
  title: string;
  description: string;
  intensity: 'favorite' | 'strong' | 'moderate';
  createdAt: number;
}

// Stark Scientific Calculator Types
export interface CalculationHistoryItem {
  id: string;
  expression: string;
  result: string;
  timestamp: number;
}

