// AI Router — Mobile App -> Auth -> Router -> Provider Adapter -> Provider.
// The app never picks keys or models; the backend decides. Fallback runs ONLY
// to an explicitly-configured provider and NEVER to bypass limits: quota and
// rate-limit failures are returned honestly, never retried on another key.
import type { FridayConfig } from '../config.js';
import type { AIProvider, ChatOutcome, ChatRequest } from './types.js';
import { GeminiProvider } from './gemini.js';
import { OpenAICompatibleProvider } from './openaiCompatible.js';
import { OllamaProvider } from './ollama.js';

export interface RouterStatus {
  primary: string;
  primaryState: string;
  primaryModel: string;
  fallback: string;
  fallbackState: string;
  providers: { name: string; state: string; model: string }[];
}

export class AIRouter {
  private providers = new Map<string, AIProvider>();
  private cfg: FridayConfig;

  constructor(cfg: FridayConfig) {
    this.cfg = cfg;
    this.providers.set('gemini', new GeminiProvider(cfg.aiApiKey, cfg.aiModel));
    this.providers.set('openai-compatible', new OpenAICompatibleProvider(cfg.aiBaseUrl, cfg.aiApiKey, cfg.aiModel));
    // Ollama stays DISABLED unless the admin explicitly sets AI_OLLAMA_URL.
    this.providers.set('ollama', new OllamaProvider(cfg.ollamaUrl, cfg.aiModel));
    this.providers.set('disabled', {
      name: 'disabled',
      state: () => 'DISABLED' as const,
      modelName: () => 'none',
      chat: async () => ({
        ok: false as const,
        code: 'CONFIGURATION_ERROR' as const,
        userMessage: 'Sir, AI service abhi configured nahi hai. Admin se server configuration check karne ko kahiye.',
        providerState: 'CONFIGURATION_ERROR' as const,
      }),
    });
  }

  primaryName(): string {
    const p = (this.cfg.aiProvider || 'gemini').toLowerCase();
    return this.providers.has(p) ? p : 'gemini';
  }

  fallbackName(): string {
    const f = (this.cfg.fallbackProvider || '').toLowerCase();
    if (!f || f === this.primaryName()) return '';
    return this.providers.has(f) ? f : '';
  }

  status(): RouterStatus {
    const primary = this.providers.get(this.primaryName())!;
    const fb = this.fallbackName() ? this.providers.get(this.fallbackName())! : null;
    return {
      primary: primary.name,
      primaryState: primary.state(),
      primaryModel: primary.modelName(),
      fallback: fb ? fb.name : '',
      fallbackState: fb ? fb.state() : 'DISABLED',
      providers: [...this.providers.values()]
        .filter((p) => p.name !== 'disabled')
        .map((p) => ({ name: p.name, state: p.state(), model: p.modelName() })),
    };
  }

  async routeChat(req: ChatRequest, timeoutMs: number): Promise<ChatOutcome> {
    const primary = this.providers.get(this.primaryName())!;
    const first = await primary.chat(req, timeoutMs);
    if (first.ok) return first;
    // Honest terminal states: never retry elsewhere to evade limits.
    if (first.code === 'QUOTA_EXHAUSTED' || first.code === 'RATE_LIMITED' || first.code === 'CONFIGURATION_ERROR') {
      return first;
    }
    // Transient failure -> explicitly-configured fallback only.
    const fbName = this.fallbackName();
    if (fbName) {
      const fb = this.providers.get(fbName)!;
      if (fb.state() === 'AVAILABLE') {
        const second = await fb.chat(req, timeoutMs);
        return second;
      }
    }
    return first;
  }
}
