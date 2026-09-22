import React, { useState } from 'react';
import {
  Brain,
  Search,
  Plus,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  X,
  Tag,
  Calendar,
  Sparkles,
  Shield,
  Layers,
} from 'lucide-react';
import { MemoryItem, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface HUDMemoryArchiveProps {
  isOpen: boolean;
  memories: MemoryItem[];
  theme: ThemeAccent;
  onAddMemory: (category: MemoryItem['category'], key: string, content: string, importance?: MemoryItem['importance']) => void;
  onDeleteMemory: (id: string) => void;
  onResetDefaults: () => void;
  onClose: () => void;
}

const CATEGORIES: { id: string; label: string; icon: string }[] = [
  { id: 'all', label: 'All Banks', icon: '⚡' },
  { id: 'identity', label: 'Identity', icon: '👤' },
  { id: 'personal', label: 'Personal', icon: '🌟' },
  { id: 'preference', label: 'Preferences', icon: '⚙️' },
  { id: 'project', label: 'Projects', icon: '🚀' },
  { id: 'instruction', label: 'Protocols', icon: '📜' },
  { id: 'fact', label: 'Facts', icon: '💡' },
];

export const HUDMemoryArchive: React.FC<HUDMemoryArchiveProps> = ({
  isOpen,
  memories,
  theme,
  onAddMemory,
  onDeleteMemory,
  onResetDefaults,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New Memory Form State
  const [newKey, setNewKey] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryItem['category']>('preference');
  const [newImportance, setNewImportance] = useState<MemoryItem['importance']>('high');

  if (!isOpen) return null;

  const currentTheme = THEMES[theme] || THEMES.amber;

  const filteredMemories = memories.filter((m) => {
    if (selectedCategory !== 'all' && m.category !== selectedCategory) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.key.toLowerCase().includes(q) ||
      m.content.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q)
    );
  });

  const handleCreateMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newContent.trim()) return;

    onAddMemory(newCategory, newKey.trim(), newContent.trim(), newImportance);
    setNewKey('');
    setNewContent('');
    setIsAdding(false);
  };

  const handleCopy = (m: MemoryItem) => {
    navigator.clipboard.writeText(`[${m.key}]: ${m.content}`);
    setCopiedId(m.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-4">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] rounded-2xl bg-slate-900 border flex flex-col shadow-2xl overflow-hidden"
        style={{
          borderColor: `${currentTheme.primary}44`,
          boxShadow: `0 0 30px ${currentTheme.primary}15`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border font-mono"
              style={{
                backgroundColor: `${currentTheme.primary}15`,
                borderColor: `${currentTheme.primary}55`,
                color: currentTheme.primary,
              }}
            >
              <Brain className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-100">
                  FRIDAY LONG MEMORY ARCHIVE
                </h2>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-mono border"
                  style={{
                    backgroundColor: `${currentTheme.primary}10`,
                    borderColor: `${currentTheme.primary}44`,
                    color: currentTheme.primary,
                  }}
                >
                  {memories.length} Facts Engraved
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400">
                Persistent synaptic memory that survives across all voice sessions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsAdding(!isAdding)}
              className="px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer"
              style={{
                backgroundColor: isAdding ? currentTheme.primary : 'transparent',
                borderColor: currentTheme.primary,
                color: isAdding ? '#020617' : currentTheme.primary,
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAdding ? 'Cancel' : 'Engrave Memory'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Add Memory Drawer */}
        {isAdding && (
          <form onSubmit={handleCreateMemory} className="p-4 bg-slate-950/80 border-b border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                  Subject Key / Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Favorite Coding Language"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                  Memory Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-400"
                >
                  <option value="identity">Identity</option>
                  <option value="preference">Preference</option>
                  <option value="project">Project</option>
                  <option value="instruction">Instruction / Protocol</option>
                  <option value="personal">Personal</option>
                  <option value="fact">Fact</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                  Importance Level
                </label>
                <select
                  value={newImportance}
                  onChange={(e) => setNewImportance(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-400"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                Memory Content / Detail to Remember
              </label>
              <textarea
                required
                rows={2}
                placeholder="What should FRIDAY remember permanently across voice calls?"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-1 text-xs font-mono text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg text-xs font-mono font-bold text-slate-950 flex items-center gap-1.5 shadow"
                style={{ backgroundColor: currentTheme.primary }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Save to Permanent Bank</span>
              </button>
            </div>
          </form>
        )}

        {/* Search & Category Filter Bar */}
        <div className="p-3 border-b border-slate-800 bg-slate-950/40 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search memories by keyword or fact..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-600"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-mono whitespace-nowrap border transition-all cursor-pointer flex items-center gap-1"
                  style={{
                    backgroundColor: isSelected ? `${currentTheme.primary}22` : 'rgba(15, 23, 42, 0.6)',
                    borderColor: isSelected ? currentTheme.primary : 'rgba(51, 65, 85, 0.4)',
                    color: isSelected ? currentTheme.primary : '#94a3b8',
                  }}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Memory Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredMemories.length === 0 ? (
            <div className="py-12 text-center text-slate-500 font-mono text-xs">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No long-term memories found matching your search.</p>
              <p className="text-[10px] mt-1 text-slate-600">
                You can say "FRIDAY, remember that my favorite band is Queen" or click "Engrave Memory" above.
              </p>
            </div>
          ) : (
            filteredMemories.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all group relative"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold border"
                      style={{
                        backgroundColor:
                          item.importance === 'critical'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : item.importance === 'high'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : `${currentTheme.primary}10`,
                        borderColor:
                          item.importance === 'critical'
                            ? 'rgba(239, 68, 68, 0.4)'
                            : item.importance === 'high'
                            ? 'rgba(245, 158, 11, 0.4)'
                            : `${currentTheme.primary}33`,
                        color:
                          item.importance === 'critical'
                            ? '#f87171'
                            : item.importance === 'high'
                            ? '#fbbf24'
                            : currentTheme.primary,
                      }}
                    >
                      {item.category}
                    </span>

                    <h3 className="text-xs font-mono font-bold text-slate-200">
                      {item.key}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleCopy(item)}
                      title="Copy memory to clipboard"
                      className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteMemory(item.id)}
                      title="Purge memory"
                      className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-300 font-mono leading-relaxed pl-1 border-l-2 border-slate-800">
                  {item.content}
                </p>

                <div className="mt-2 flex items-center justify-between text-[9px] font-mono text-slate-600">
                  <span>Engraved: {new Date(item.createdAt).toLocaleDateString()}</span>
                  <span>ID: {item.id.slice(-6)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onResetDefaults}
            className="text-[11px] font-mono text-slate-400 hover:text-amber-400 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Factory Seeds</span>
          </button>

          <p className="text-[10px] font-mono text-slate-400">
            Auto-injected into FRIDAY's live neural prompt
          </p>
        </div>
      </div>
    </div>
  );
};
