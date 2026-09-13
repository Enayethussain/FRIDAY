import React, { useState } from 'react';
import { FileText, Plus, Trash2, X, Sparkles, Mic } from 'lucide-react';
import { NoteItem, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface HUDNotesDrawerProps {
  isOpen: boolean;
  notes: NoteItem[];
  theme: ThemeAccent;
  onClose: () => void;
  onAddNote: (title: string, content: string) => void;
  onDeleteNote: (id: string) => void;
}

export const HUDNotesDrawer: React.FC<HUDNotesDrawerProps> = ({
  isOpen,
  notes,
  theme,
  onClose,
  onAddNote,
  onDeleteNote,
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const currentTheme = THEMES[theme] || THEMES.cyan;

  if (!isOpen) return null;

  const startDictation = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptSegment = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          setNewContent((prev) => prev + (prev ? ' ' : '') + transcriptSegment.trim());
        } else {
          currentTranscript += transcriptSegment;
        }
      }
    };

    recognition.start();
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    onAddNote(newTitle.trim(), newContent.trim());
    setNewTitle('');
    setNewContent('');
    setIsAdding(false);
  };

  return (
    <div
      id="notes-drawer-backdrop"
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="notes-drawer-panel"
        className="w-full max-w-md h-full bg-[#080d19] border-l border-slate-800 p-6 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 relative"
        style={{
          boxShadow: `-10px 0 30px rgba(0,0,0,0.8), -2px 0 20px ${currentTheme.primary}22`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div
              className="p-2 rounded-xl border"
              style={{
                borderColor: `${currentTheme.primary}55`,
                background: `${currentTheme.primary}18`,
                color: currentTheme.primaryLight,
              }}
            >
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-slate-100 text-base">Voice Scratchpad</h3>
              <p className="text-xs font-mono text-slate-400">Captured notes and memos</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsAdding(!isAdding)}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Add note"
            >
              <Plus className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Voice Note Hint */}
        <div className="my-3 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-2 text-xs font-mono text-slate-400">
          <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: currentTheme.primary }} />
          <span>Say: "FRIDAY, save a note: buy groceries at 6 PM"</span>
        </div>

        {/* Add Note Form */}
        {isAdding && (
          <form onSubmit={handleCreate} className="p-3 mb-4 rounded-xl bg-[#0d1526] border border-slate-700 space-y-2.5">
            <input
              type="text"
              placeholder="Note Title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              autoFocus
            />
            <textarea
              placeholder="Note content..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={3}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <div className="flex justify-between items-center mt-2">
              <button
                type="button"
                onClick={startDictation}
                className={`p-1.5 rounded-lg text-xs font-mono transition-colors flex items-center gap-1.5 ${
                  isListening
                    ? 'bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
                }`}
                title={isListening ? 'Listening...' : 'Dictate note'}
              >
                <Mic className="w-3.5 h-3.5" />
                {isListening ? 'Listening...' : 'Dictate'}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1 rounded-lg text-xs font-mono text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded-lg text-xs font-mono font-semibold"
                  style={{
                    backgroundColor: currentTheme.primary,
                    color: '#020617',
                  }}
                >
                  Save Note
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {notes.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center text-slate-500 text-xs font-mono">
              <FileText className="w-8 h-8 mb-2 opacity-40" />
              <p>No notes recorded yet.</p>
              <p className="text-[11px] text-slate-600 mt-1">Ask FRIDAY to take a note to populate this.</p>
            </div>
          ) : (
            notes.map((n) => (
              <div
                key={n.id}
                className="p-3 rounded-xl bg-[#0c1220] border border-slate-800/80 hover:border-slate-700 transition-colors group relative"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="font-mono font-bold text-xs text-slate-200 truncate">{n.title}</h4>
                  <button
                    type="button"
                    onClick={() => onDeleteNote(n.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1 transition-opacity"
                    title="Delete note"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-slate-300 font-sans leading-relaxed whitespace-pre-wrap">{n.content}</p>
                <div className="mt-2 text-[10px] font-mono text-slate-500">
                  {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                  {new Date(n.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
