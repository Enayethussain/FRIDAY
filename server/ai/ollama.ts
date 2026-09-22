// OllamaProvider — strictly OPTIONAL and disabled by default.
// Enabled ONLY when the admin explicitly sets AI_OLLAMA_URL (e.g. an optional
// PC bridge for development). Normal FRIDAY phone operation NEVER needs it:
// the cloud providers serve all chat. No model download is triggered here —
// it only calls an already-running Ollama server the admin configured.
import type { AIProvider, ChatOutcome, ChatRequest, ProviderState } from './types.js';
import { honestUserMessage } from './types.js';

export class OllamaProvider implements AIProvider {
  name = 'ollama';
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl;
    this.model = model || 'llama3.1';
  }

  state(): ProviderState {
    if (!this.baseUrl) return 'DISABLED';
    return 'AVAILABLE';
  }

  modelName(): string {
    return this.model;
  }

  async chat(req: ChatRequest, timeoutMs: number): Promise<ChatOutcome> {
    if (!this.baseUrl) {
      return { ok: false, code: 'CONFIGURATION_ERROR', userMessage: honestUserMessage('CONFIGURATION_ERROR'), providerState: 'DISABLED' };
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages: [
            { role: 'system', content: 'You are FRIDAY, a witty, warm, confident AI assistant. Reply concisely.' },
            ...req.history.slice(-12).map((h) => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text })),
          ],
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        return { ok: false, code: 'PROVIDER_UNAVAILABLE', userMessage: honestUserMessage('PROVIDER_UNAVAILABLE'), providerState: 'TEMPORARILY_UNAVAILABLE' };
      }
      const j: any = await res.json().catch(() => null);
      const reply = String(j?.message?.content || '').trim();
      if (!reply) {
        return { ok: false, code: 'SERVER_ERROR', userMessage: honestUserMessage('SERVER_ERROR'), providerState: 'TEMPORARILY_UNAVAILABLE' };
      }
      return { ok: true, reply, provider: this.name, model: this.model };
    } catch (e: any) {
      clearTimeout(t);
      if ((e as Error)?.name === 'AbortError') {
        return { ok: false, code: 'PROVIDER_TIMEOUT', userMessage: honestUserMessage('PROVIDER_TIMEOUT'), providerState: 'TEMPORARILY_UNAVAILABLE' };
      }
      return { ok: false, code: 'PROVIDER_UNAVAILABLE', userMessage: honestUserMessage('PROVIDER_UNAVAILABLE'), providerState: 'TEMPORARILY_UNAVAILABLE' };
    }
  }
}
