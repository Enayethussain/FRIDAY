// FRIDAY backend configuration — environment variables only, never secrets in code.
// Production secrets come from the host environment (Render/Docker). See .env.example.
export interface FridayConfig {
  port: number;
  nodeEnv: string;
  // Canonical public backend URL (used for CORS allowlist + status responses).
  backendUrl: string;
  // Primary AI provider selection. Only providers with explicit config are enabled.
  aiProvider: string; // 'gemini' (default) | 'openai-compatible' | 'ollama' | 'disabled'
  aiApiKey: string;
  aiModel: string;
  aiBaseUrl: string; // openai-compatible base URL (optional)
  ollamaUrl: string; // ONLY when the admin explicitly configures a PC/local Ollama URL
  fallbackProvider: string; // '' = none; otherwise provider name, only if configured
  // Free-tier quota: max AI chat requests per device per day (0 = unlimited only
  // when the admin explicitly sets 0; default is a conservative free-tier cap).
  freeDailyLimit: number;
  proDailyLimit: number;
  plusDailyLimit: number;
  maintenanceMode: boolean;
  logLevel: string; // DEBUG | INFO | WARNING | ERROR (verbose logs off in production)
  storePath: string; // persistent JSON store (DATABASE_URL file path or default)
  version: string;
}

function num(name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function loadConfig(): FridayConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  return {
    port: num('PORT', 3000),
    nodeEnv,
    backendUrl: (process.env.BACKEND_URL || process.env.APP_URL || '').trim().replace(/\/$/, ''),
    aiProvider: (process.env.AI_PROVIDER || 'gemini').trim().toLowerCase(),
    aiApiKey: process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '',
    aiModel: (process.env.AI_MODEL || '').trim(),
    aiBaseUrl: (process.env.AI_BASE_URL || '').trim().replace(/\/$/, ''),
    ollamaUrl: (process.env.AI_OLLAMA_URL || '').trim().replace(/\/$/, ''),
    fallbackProvider: (process.env.AI_FALLBACK_PROVIDER || '').trim().toLowerCase(),
    freeDailyLimit: num('FREE_DAILY_LIMIT', 30),
    proDailyLimit: num('PRO_DAILY_LIMIT', 300),
    plusDailyLimit: num('PLUS_DAILY_LIMIT', 1000),
    maintenanceMode: (process.env.MAINTENANCE_MODE || '').trim().toLowerCase() === 'true',
    logLevel: (process.env.LOG_LEVEL || (nodeEnv === 'production' ? 'WARNING' : 'INFO')).toUpperCase(),
    storePath: (process.env.DATABASE_URL || '').trim() || 'data/friday-store.json',
    version: '1.0.0',
  };
}

// Feature flags reflect ACTUAL implementation (never enable unfinished features).
export function getFeatureFlags(): Record<string, boolean> {
  return {
    cloud_ai: true, // POST /api/v1/chat via configured provider
    friday_share: true, // /api/ft/* + /api/share/* relay (paired devices)
    advanced_voice: true, // Live WS voice + dual FRIDAY/JARVIS TTS config
    screen_awareness: true, // permission-gated screen/camera feeds
    hologram: true, // offline 127-model library + procedural viewer
    app_builder: true, // /api/app-builder jobs
    advanced_gestures: true, // MediaPipe web + native gesture plugin
    jarvis_voice: true, // JARVIS TTS persona (real voice switch)
  };
}
