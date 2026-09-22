import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, XCircle, Bot, User, RefreshCw } from 'lucide-react';
import { apiUrl, getServerBase } from '../lib/serverUrl';
import { sendBackendChat } from '../services/AiBackendService';

interface HUDChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMsg {
  role: 'user' | 'model';
  text: string;
}

type ConnState =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'SERVER_ERROR'
  | 'AI_PROVIDER_ERROR'
  | 'TIMEOUT';

const CHAT_TIMEOUT_MS = 45000;
const MAX_ATTEMPTS = 3;

function logDiag(event: string, detail: Record<string, unknown>): void {
  try {
    // Never log message bodies or secrets — only shapes and timings.
    // eslint-disable-next-line no-console
    console.log(`[ChatDiag] ${event}`, JSON.stringify(detail));
  } catch { /* logging must never break chat */ }
}

export function HUDChatPanel({ isOpen, onClose }: HUDChatPanelProps) {
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('friday_chat_history') || '[]');
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'sending' | 'thinking'>('idle');
  const [conn, setConn] = useState<ConnState>('CONNECTING');
  const [connDetail, setConnDetail] = useState('');
  const [serverBase] = useState(() => {
    try {
      return getServerBase();
    } catch {
      return '';
    }
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const healthTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const checkHealth = useCallback(async (silent: boolean) => {
    if (!silent) {
      setConn('CONNECTING');
      setConnDetail('');
    }
    const started = Date.now();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(apiUrl('/api/health'), { signal: ctrl.signal });
      clearTimeout(t);
      const ms = Date.now() - started;
      if (!res.ok) {
        setConn('SERVER_ERROR');
        setConnDetail(`Health ${res.status}`);
        logDiag('health_bad_status', { status: res.status, ms });
        return false;
      }
      const j = await res.json().catch(() => null);
      if (j && j.status === 'ok') {
        setConn('CONNECTED');
        setConnDetail(j.hasKey === false ? 'AI key missing' : '');
        if (j.hasKey === false) {
          setConn('AI_PROVIDER_ERROR');
          setConnDetail('Server ok, AI key missing');
        }
        logDiag('health_ok', { ms, hasKey: j.hasKey });
        return j.hasKey !== false;
      }
      setConn('SERVER_ERROR');
      setConnDetail('Bad health reply');
      logDiag('health_malformed', { ms });
      return false;
    } catch (e) {
      const ms = Date.now() - started;
      const aborted = (e as Error)?.name === 'AbortError';
      setConn(aborted ? 'TIMEOUT' : 'DISCONNECTED');
      setConnDetail(aborted ? 'Health timeout' : 'Server reachable nahi');
      logDiag('health_fail', { ms, aborted, error: (e as Error)?.message || 'network' });
      return false;
    }
  }, []);

  // Health check on open + periodic re-check (auto-reconnect restores status).
  useEffect(() => {
    if (!isOpen) return;
    void checkHealth(false);
    healthTimer.current = setInterval(() => {
      void checkHealth(true);
    }, 30000);
    return () => {
      if (healthTimer.current) clearInterval(healthTimer.current);
      healthTimer.current = null;
      try {
        abortRef.current?.abort();
      } catch { /* noop */ }
    };
  }, [isOpen, checkHealth]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('friday_chat_history', JSON.stringify(messages.slice(-50)));
    } catch {}
  }, [messages]);

  if (!isOpen) return null;

  const categorize = (attempt: number, err: unknown, status?: number): { state: ConnState; text: string } => {
    const msg = (err as Error)?.message || '';
    if ((err as Error)?.name === 'AbortError') {
      return {
        state: 'TIMEOUT',
        text: '⚠️ Sir, response aane me bahut time lag raha hai (timeout). Dobara try karo.',
      };
    }
    if (status === 429) {
      return { state: 'SERVER_ERROR', text: '⚠️ Sir, bahut jaldi-jaldi bhej diya. Thoda ruk kar dobara try karo.' };
    }
    if (status && status >= 500) {
      return { state: 'SERVER_ERROR', text: '⚠️ Sir, chat service me error aa raha hai. Server log check karo.' };
    }
    if (status === 401 || status === 403 || /api key|auth/i.test(msg)) {
      return { state: 'AI_PROVIDER_ERROR', text: '⚠️ Sir, AI service authentication check karni hogi.' };
    }
    if (attempt < MAX_ATTEMPTS) {
      return { state: 'DISCONNECTED', text: '' }; // silent retry, message only after last attempt
    }
    return {
      state: 'DISCONNECTED',
      text: '⚠️ Sir, FRIDAY server reachable nahi hai. Check karo server chal raha hai.',
    };
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const updated = [...messages, { role: 'user' as const, text }];
    setMessages(updated);
    setSending(true);
    setPhase('sending');

    let lastError: unknown = null;
    let lastStatus: number | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const started = Date.now();
      try {
        // Backend-only AI: phone -> HTTPS FRIDAY backend -> AI router.
        // v1 first, legacy route as fallback. No client keys, no localhost.
        logDiag('chat_attempt', { attempt, endpoint: apiUrl('/api/v1/chat') });
        const r = await sendBackendChat(text, CHAT_TIMEOUT_MS);
        const ms = Date.now() - started;
        logDiag('chat_response', { attempt, ms, code: r.code, netState: r.netState });
        if (r.ok) {
          setMessages([...updated, { role: 'model', text: r.reply }]);
          setConn('CONNECTED');
          setConnDetail('');
          setSending(false);
          setPhase('idle');
          return;
        }
        if (r.code === 'CONFIGURATION_ERROR' || r.code === 'ACCOUNT_DISABLED' || r.netState === 'AUTH_EXPIRED') {
          setMessages([...updated, { role: 'model', text: `⚠️ ${r.reply}` }]);
          setConn('AI_PROVIDER_ERROR');
          setConnDetail(r.code);
          setSending(false);
          setPhase('idle');
          return; // retrying won't help an auth/config error
        }
        if (r.netState === 'RATE_LIMITED' || r.code === 'QUOTA_EXHAUSTED') {
          setMessages([...updated, { role: 'model', text: `⚠️ ${r.reply}` }]);
          setConn('SERVER_ERROR');
          setConnDetail(r.code);
          setSending(false);
          setPhase('idle');
          return; // quota needs time, not retries
        }
        if (r.netState === 'OFFLINE') {
          lastError = new Error(r.reply);
          setPhase('thinking');
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((rr) => setTimeout(rr, attempt * 1000));
            setPhase('thinking');
            continue;
          }
          break;
        }
        lastError = new Error(r.reply);
        lastStatus = r.netState === 'AI_PROVIDER_UNAVAILABLE' ? 502 : undefined;
        setPhase('thinking');
      } catch (e) {
        lastError = e;
        const ms = Date.now() - started;
        logDiag('chat_attempt_fail', {
          attempt,
          ms,
          aborted: (e as Error)?.name === 'AbortError',
          error: ((e as Error)?.message || 'network').slice(0, 120),
        });
        if ((e as Error)?.name === 'AbortError') break; // timeout — no point hammering
        if (attempt < MAX_ATTEMPTS) {
          // Controlled backoff: 1s, 2s. No infinite loop.
          await new Promise((r) => setTimeout(r, attempt * 1000));
          setPhase('thinking');
          continue;
        }
      }
    }
    const { state, text: errMsg } = categorize(MAX_ATTEMPTS, lastError, lastStatus);
    setConn(state);
    if (state === 'DISCONNECTED' || state === 'TIMEOUT') setConnDetail('');
    setMessages([...updated, { role: 'model', text: errMsg }]);
    setSending(false);
    setPhase('idle');
  };

  const connColor =
    conn === 'CONNECTED' ? '#10b981' : conn === 'CONNECTING' ? '#f59e0b' : '#ef4444';
  const connLabel =
    conn === 'CONNECTED' ? '● Connected' : conn === 'CONNECTING' ? '● Connecting…' : conn === 'TIMEOUT' ? '● Timeout' : conn === 'AI_PROVIDER_ERROR' ? '● Server connected · ⚠ AI unavailable' : conn === 'SERVER_ERROR' ? '● Server error' : '● Disconnected';

  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
      <div className="friday-chat-panel w-full max-w-2xl flex flex-col bg-gradient-to-br from-slate-900/95 to-slate-800/95 rounded-2xl border border-amber-500/30 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/60">
          <div>
            <h2 className="text-lg font-bold text-white">💬 FRIDAY Chat</h2>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span style={{ color: connColor }}>{connLabel}</span>
              {connDetail && <span className="text-slate-400">· {connDetail}</span>}
              {!serverBase && <span className="text-slate-500">· same-origin</span>}
              {conn !== 'CONNECTED' && conn !== 'CONNECTING' && (
                <button
                  type="button"
                  onClick={() => void checkHealth(false)}
                  className="flex items-center gap-1 text-amber-300 hover:text-amber-200"
                >
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} className="text-xs text-slate-400 hover:text-red-300 px-2 py-1">Clear</button>
            )}
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white"><XCircle className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="friday-chat-scroll friday-wrap flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-slate-500 text-sm mt-10">Namaste Commander! 👋<br />Kuch bhi type karo — FRIDAY turant jawab dega.</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'model' && <Bot className="w-5 h-5 text-amber-400 shrink-0 mt-1" />}
              <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-amber-500 text-white rounded-br-md' : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-md'}`}>
                {m.text}
              </div>
              {m.role === 'user' && <User className="w-5 h-5 text-slate-400 shrink-0 mt-1" />}
            </div>
          ))}
          {sending && (
            <p className="text-amber-400 text-sm animate-pulse">
              {phase === 'sending' ? 'Sending…' : 'Thinking…'}
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 p-3 border-t border-slate-700/60 sticky bottom-0 bg-slate-900/95 backdrop-blur">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Message FRIDAY..."
            disabled={sending}
            enterKeyHint="send"
            autoComplete="off"
            className="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-50"
          />
          <button onClick={send} disabled={sending || !input.trim()} aria-label="Send message" className="p-2.5 min-w-[44px] min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-white transition disabled:opacity-50">
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
