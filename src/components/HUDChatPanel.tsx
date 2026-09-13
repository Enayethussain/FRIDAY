import React, { useState, useRef, useEffect } from 'react';
import { Send, XCircle, Bot, User } from 'lucide-react';
import { apiUrl } from '../lib/serverUrl';

interface HUDChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMsg {
  role: 'user' | 'model';
  text: string;
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('friday_chat_history', JSON.stringify(messages.slice(-50)));
    } catch {}
  }, [messages]);

  if (!isOpen) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const updated = [...messages, { role: 'user' as const, text }];
    setMessages(updated);
    setSending(true);
    try {
      const res = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: 'commander' }),
      });
      const j = await res.json();
      if (j.success) {
        setMessages([...updated, { role: 'model', text: j.reply }]);
      } else {
        setMessages([...updated, { role: 'model', text: `⚠️ Error: ${j.error || 'reply nahi aaya'}` }]);
      }
    } catch {
      setMessages([...updated, { role: 'model', text: '⚠️ Server se connect nahi ho paya. Check karo server chal raha hai.' }]);
    }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl h-[80vh] flex flex-col bg-gradient-to-br from-slate-900/95 to-slate-800/95 rounded-2xl border border-cyan-500/30 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/60">
          <h2 className="text-lg font-bold text-white">💬 FRIDAY Chat</h2>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} className="text-xs text-slate-400 hover:text-red-300 px-2 py-1">Clear</button>
            )}
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white"><XCircle className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-slate-500 text-sm mt-10">Namaste Commander! 👋<br />Kuch bhi type karo — FRIDAY turant jawab dega.</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'model' && <Bot className="w-5 h-5 text-cyan-400 shrink-0 mt-1" />}
              <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-cyan-500 text-white rounded-br-md' : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-md'}`}>
                {m.text}
              </div>
              {m.role === 'user' && <User className="w-5 h-5 text-slate-400 shrink-0 mt-1" />}
            </div>
          ))}
          {sending && <p className="text-cyan-400 text-sm animate-pulse">FRIDAY likh raha hai...</p>}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 p-3 border-t border-slate-700/60">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Message FRIDAY..."
            disabled={sending}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
          />
          <button onClick={send} disabled={sending || !input.trim()} className="p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white transition disabled:opacity-50">
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
