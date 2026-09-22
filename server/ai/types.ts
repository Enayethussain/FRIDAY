// Central AI provider contracts. The Android app never sees keys or provider
// internals — only normalized text or honest internal error codes.
export type ProviderState =
  | 'AVAILABLE'
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'CONFIGURATION_ERROR'
  | 'DISABLED';

export type ChatErrorCode =
  | 'PROVIDER_OK'
  | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'CONFIGURATION_ERROR'
  | 'INVALID_REQUEST'
  | 'SERVER_ERROR';

export interface ChatRequest {
  message: string;
  conversationId: string;
  language: string; // 'en' | 'hi' | 'hinglish' (client hint, validated)
  history: { role: 'user' | 'model'; text: string }[];
}

export interface ChatSuccess {
  ok: true;
  reply: string;
  provider: string;
  model: string;
}

export interface ChatFailure {
  ok: false;
  code: ChatErrorCode;
  // Safe user-facing message (Hinglish/English). Never contains keys/details.
  userMessage: string;
  providerState: ProviderState;
}

export type ChatOutcome = ChatSuccess | ChatFailure;

export interface AIProvider {
  name: string;
  /** Real availability given current server configuration (no guessing). */
  state(): ProviderState;
  modelName(): string;
  chat(req: ChatRequest, timeoutMs: number): Promise<ChatOutcome>;
}

/** Honest user-facing message per failure — never "Done"/"Success" on failure. */
export function honestUserMessage(code: ChatErrorCode): string {
  switch (code) {
    case 'RATE_LIMITED':
      return 'Sir, bahut jaldi-jaldi bhej diya. Thoda ruk kar dobara try kijiye.';
    case 'QUOTA_EXHAUSTED':
      return 'Sir, AI service ka free quota abhi temporarily exhausted hai. Thodi der baad try kijiye.';
    case 'PROVIDER_TIMEOUT':
      return 'Sir, AI service se jawab aane me bahut time lag raha hai. Dobara try kijiye.';
    case 'CONFIGURATION_ERROR':
      return 'Sir, AI service abhi configured nahi hai. Admin se server configuration check karne ko kahiye.';
    case 'INVALID_REQUEST':
      return 'Sir, message samajh nahi aaya. Dobara bhejo.';
    case 'PROVIDER_UNAVAILABLE':
      return 'Sir, AI service abhi temporarily unavailable hai. Thodi der baad try kijiye.';
    case 'SERVER_ERROR':
    default:
      return 'Sir, AI request fail ho gayi. Dobara try kijiye.';
  }
}
