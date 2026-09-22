// GeminiProvider — the actually-configured cloud provider (GEMINI_API_KEY).
// Same model family the legacy /api/chat route uses. No key rotation, no
// quota evasion: provider 429/503 are mapped to honest states.
import { GoogleGenAI } from '@google/genai';
import type { AIProvider, ChatOutcome, ChatRequest, ProviderState } from './types.js';
import { honestUserMessage } from './types.js';

export class GeminiProvider implements AIProvider {
  name = 'gemini';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model || 'gemini-3.6-flash';
  }

  state(): ProviderState {
    if (!this.apiKey) return 'CONFIGURATION_ERROR';
    return 'AVAILABLE';
  }

  modelName(): string {
    return this.model;
  }

  async chat(req: ChatRequest, timeoutMs: number): Promise<ChatOutcome> {
    if (!this.apiKey) {
      return { ok: false, code: 'CONFIGURATION_ERROR', userMessage: honestUserMessage('CONFIGURATION_ERROR'), providerState: 'CONFIGURATION_ERROR' };
    }
    try {
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      const contents = req.history.slice(-12).map((h) => ({
        role: h.role === 'model' ? 'model' : 'user',
        parts: [{ text: h.text }],
      }));
      const response = await Promise.race([
        ai.models.generateContent({
          model: this.model,
          contents,
          config: {
            systemInstruction:
              'You are FRIDAY, a witty, warm, confident AI assistant for Commander Enayet Hussain. ' +
              'Reply concisely in the same language the user writes in (English, Hindi, or Hinglish). ' +
              'Keep answers short and conversational.',
            maxOutputTokens: 500,
            temperature: 0.8,
          },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI timeout')), timeoutMs)),
      ]);
      const reply = (response.text || '').trim();
      if (!reply) {
        return { ok: false, code: 'SERVER_ERROR', userMessage: honestUserMessage('SERVER_ERROR'), providerState: 'TEMPORARILY_UNAVAILABLE' };
      }
      return { ok: true, reply, provider: this.name, model: this.model };
    } catch (e: any) {
      const msg = String(e?.message || e);
      const status = (e as any)?.status;
      if (status === 429 || /429|rate.?limit|resource_exhausted.*quota/i.test(msg)) {
        return { ok: false, code: 'QUOTA_EXHAUSTED', userMessage: honestUserMessage('QUOTA_EXHAUSTED'), providerState: 'QUOTA_EXHAUSTED' };
      }
      if (/AI timeout/i.test(msg)) {
        return { ok: false, code: 'PROVIDER_TIMEOUT', userMessage: honestUserMessage('PROVIDER_TIMEOUT'), providerState: 'TEMPORARILY_UNAVAILABLE' };
      }
      if (status === 503 || /503|overloaded|high demand|UNAVAILABLE/i.test(msg)) {
        return { ok: false, code: 'PROVIDER_UNAVAILABLE', userMessage: honestUserMessage('PROVIDER_UNAVAILABLE'), providerState: 'TEMPORARILY_UNAVAILABLE' };
      }
      if (/API key|API_KEY|401|403|PERMISSION_DENIED/i.test(msg)) {
        return { ok: false, code: 'CONFIGURATION_ERROR', userMessage: honestUserMessage('CONFIGURATION_ERROR'), providerState: 'CONFIGURATION_ERROR' };
      }
      return { ok: false, code: 'SERVER_ERROR', userMessage: honestUserMessage('SERVER_ERROR'), providerState: 'TEMPORARILY_UNAVAILABLE' };
    }
  }
}
