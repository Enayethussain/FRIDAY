// OpenAICompatibleProvider — optional, ONLY enabled when the admin explicitly
// sets AI_BASE_URL + AI_API_KEY (+ optional AI_MODEL). Standard
// OpenAI-compatible /chat/completions call. Never used unless configured.
import type { AIProvider, ChatOutcome, ChatRequest, ProviderState } from './types.js';
import { honestUserMessage } from './types.js';

export class OpenAICompatibleProvider implements AIProvider {
  name = 'openai-compatible';
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(baseUrl: string, apiKey: string, model: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = model || 'gpt-4o-mini';
  }

  state(): ProviderState {
    if (!this.baseUrl || !this.apiKey) return 'DISABLED';
    return 'AVAILABLE';
  }

  modelName(): string {
    return this.model;
  }

  async chat(req: ChatRequest, timeoutMs: number): Promise<ChatOutcome> {
    if (!this.baseUrl || !this.apiKey) {
      return { ok: false, code: 'CONFIGURATION_ERROR', userMessage: honestUserMessage('CONFIGURATION_ERROR'), providerState: 'DISABLED' };
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'You are FRIDAY, a witty, warm, confident AI assistant. Reply concisely in the user language.' },
            ...req.history.slice(-12).map((h) => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text })),
          ],
          max_tokens: 500,
          temperature: 0.8,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.status === 429) {
        return { ok: false, code: 'QUOTA_EXHAUSTED', userMessage: honestUserMessage('QUOTA_EXHAUSTED'), providerState: 'QUOTA_EXHAUSTED' };
      }
      if (!res.ok) {
        const st: ProviderState = res.status >= 500 ? 'TEMPORARILY_UNAVAILABLE' : 'CONFIGURATION_ERROR';
        const code = res.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'CONFIGURATION_ERROR';
        return { ok: false, code, userMessage: honestUserMessage(code), providerState: st };
      }
      const j: any = await res.json().catch(() => null);
      const reply = String(j?.choices?.[0]?.message?.content || '').trim();
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
