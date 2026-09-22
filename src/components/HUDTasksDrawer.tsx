import React, { useState } from 'react';
import { CheckSquare, Square, Plus, Trash2, X, Sparkles, CheckCircle, Mic } from 'lucide-react';
import { TaskItem, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface HUDTasksDrawerProps {
  isOpen: boolean;
  tasks: TaskItem[];
  theme: ThemeAccent;
  onClose: () => void;
  onAddTask: (task: string, priority: 'high' | 'normal' | 'low') => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
}

export const HUDTasksDrawer: React.FC<HUDTasksDrawerProps> = ({
  isOpen,
  tasks,
  theme,
  onClose,
  onAddTask,
  onToggleTask,
  onDeleteTask,
}) => {
  const [newTask, setNewTask] = useState('');
  const [priority, setPriority] = useState<'high' | 'normal' | 'low'>('normal');
  const [isAdding, setIsAdding] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const currentTheme = THEMES[theme] || THEMES.amber;

  if (!isOpen) return null;

  const toggleListen = () => {
    if (isListening) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      
      let parsedTask = transcript.trim();
      let parsedPriority: 'high' | 'normal' | 'low' = 'normal';

      const addPrefixMatch = parsedTask.match(/^(?:add\s+a?\s*task\s*:?\s*)(.*)/i);
      if (addPrefixMatch) {
        parsedTask = addPrefixMatch[1].trim();
      }

      const priorityMatch = parsedTask.match(/(.*?)\s+(high|normal|low)(?:\s+priority)?$/i);
      if (priorityMatch) {
        parsedTask = priorityMatch[1].trim();
        parsedPriority = priorityMatch[2].toLowerCase() as 'high' | 'normal' | 'low';
      }

      if (parsedTask) {
        onAddTask(parsedTask, parsedPriority);
      }
      setIsListening(false);
      setIsAdding(false);
      setNewTask('');
    };

    recognition.start();
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;

    let parsedTask = newTask.trim();
    let parsedPriority = priority;

    const addPrefixMatch = parsedTask.match(/^(?:add\s+a?\s*task\s*:?\s*)(.*)/i);
    if (addPrefixMatch) {
      parsedTask = addPrefixMatch[1].trim();
    }

    const priorityMatch = parsedTask.match(/(.*?)\s+(high|normal|low)(?:\s+priority)?$/i);
    if (priorityMatch) {
      parsedTask = priorityMatch[1].trim();
      parsedPriority = priorityMatch[2].toLowerCase() as 'high' | 'normal' | 'low';
    }

    onAddTask(parsedTask, parsedPriority);
    setNewTask('');
    setIsAdding(false);
  };

  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div
      id="tasks-drawer-backdrop"
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="tasks-drawer-panel"
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
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-slate-100 text-base">Checklist & Tasks</h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                  {completedCount}/{tasks.length}
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400">Voice-synchronized todo manager</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsAdding(!isAdding)}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Add task"
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

        {/* Progress Bar */}
        <div className="mt-4 mb-3">
          <div className="flex justify-between items-end mb-1.5">
            <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">Project Completion</span>
            <span className="text-xs font-mono font-bold" style={{ color: currentTheme.primary }}>
              {tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full transition-all duration-500 ease-out rounded-full"
              style={{ 
                width: `${tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0}%`,
                backgroundColor: currentTheme.primary,
                boxShadow: `0 0 10px ${currentTheme.primary}88`
              }}
            />
          </div>
        </div>

        {/* Hint */}
        <div className="my-3 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-2 text-xs font-mono text-slate-400">
          <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: currentTheme.primary }} />
          <span>Say/Type: "Add task: buy groceries high"</span>
        </div>

        {/* Add Form */}
        {isAdding && (
          <form onSubmit={handleCreate} className="p-3 mb-4 rounded-xl bg-[#0d1526] border border-slate-700 space-y-2.5">
            <div className="relative">
              <input
                type="text"
                placeholder="What needs to be done?"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                className="w-full pl-3 pr-10 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                autoFocus
              />
              <button
                type="button"
                onClick={toggleListen}
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${
                  isListening ? 'text-red-400 bg-red-400/10 animate-pulse' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Dictate task"
              >
                <Mic className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-[11px] font-mono">
                <span className="text-slate-400 mr-1">Priority:</span>
                {(['low', 'normal', 'high'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`px-2 py-0.5 rounded capitalize ${
                      priority === p ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
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
                  Add
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Task List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {tasks.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center text-slate-500 text-xs font-mono">
              <CheckCircle className="w-8 h-8 mb-2 opacity-40" />
              <p>Checklist is all clear.</p>
              <p className="text-[11px] text-slate-600 mt-1">Tell FRIDAY to add a task to get started.</p>
            </div>
          ) : (
            tasks.map((t) => (
              <div
                key={t.id}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all group ${
                  t.completed
                    ? 'bg-slate-900/30 border-slate-800/40 text-slate-500 line-through'
                    : 'bg-[#0c1220] border-slate-800/80 text-slate-200 hover:border-slate-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onToggleTask(t.id)}
                  className="flex items-center gap-2.5 text-left flex-1 min-w-0"
                >
                  {t.completed ? (
                    <CheckSquare className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <Square className="w-4 h-4 shrink-0 text-slate-500 group-hover:text-slate-300" />
                  )}
                  <span className="text-xs font-mono truncate">{t.task}</span>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  {t.priority === 'high' && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-950/80 border border-red-800/80 text-red-300 uppercase">
                      High
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteTask(t.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1 transition-opacity"
                    title="Delete task"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
