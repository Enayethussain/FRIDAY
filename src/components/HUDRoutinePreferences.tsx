import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Heart,
  ThumbsDown,
  Clock,
  Plus,
  Trash2,
  X,
  Sparkles,
  CheckCircle2,
  Coffee,
  Code2,
  Moon,
  Sun,
  Dumbbell,
  RotateCcw,
} from 'lucide-react';
import { CommanderPreference, DailyRoutineItem, ThemeAccent } from '../types';
import { globalRoutinePreferenceManager } from '../services/RoutinePreferenceManager';
import { THEMES } from '../utils/theme';
import { SoundEffects } from '../utils/SoundEffects';

interface HUDRoutinePreferencesProps {
  isOpen: boolean;
  theme: ThemeAccent;
  onClose: () => void;
}

export const HUDRoutinePreferences: React.FC<HUDRoutinePreferencesProps> = ({
  isOpen,
  theme,
  onClose,
}) => {
  const currentTheme = THEMES[theme] || THEMES.amber;

  const [activeTab, setActiveTab] = useState<'routine' | 'preferences'>('routine');
  const [routines, setRoutines] = useState<DailyRoutineItem[]>([]);
  const [preferences, setPreferences] = useState<CommanderPreference[]>([]);
  const [prefFilter, setPrefFilter] = useState<'all' | 'like' | 'dislike'>('all');

  // Add Routine Modal State
  const [isAddRoutineOpen, setIsAddRoutineOpen] = useState(false);
  const [newRoutineTime, setNewRoutineTime] = useState('');
  const [newRoutineActivity, setNewRoutineActivity] = useState('');
  const [newRoutineCategory, setNewRoutineCategory] = useState<DailyRoutineItem['category']>('work');
  const [newRoutineNotes, setNewRoutineNotes] = useState('');

  // Add Preference Modal State
  const [isAddPrefOpen, setIsAddPrefOpen] = useState(false);
  const [newPrefType, setNewPrefType] = useState<'like' | 'dislike'>('like');
  const [newPrefTitle, setNewPrefTitle] = useState('');
  const [newPrefDesc, setNewPrefDesc] = useState('');
  const [newPrefCategory, setNewPrefCategory] = useState<CommanderPreference['category']>('lifestyle');
  const [newPrefIntensity, setNewPrefIntensity] = useState<CommanderPreference['intensity']>('favorite');

  useEffect(() => {
    const unsub = globalRoutinePreferenceManager.subscribe(() => {
      setRoutines(globalRoutinePreferenceManager.getRoutines());
      setPreferences(globalRoutinePreferenceManager.getPreferences());
    });
    return unsub;
  }, []);

  if (!isOpen) return null;

  const handleToggleRoutine = (id: string, currentVal: boolean) => {
    SoundEffects.playSubtleBeep();
    globalRoutinePreferenceManager.updateRoutine(id, { isActive: !currentVal });
  };

  const handleDeleteRoutine = (id: string) => {
    SoundEffects.playSubtleBeep();
    globalRoutinePreferenceManager.deleteRoutine(id);
  };

  const handleDeletePref = (id: string) => {
    SoundEffects.playSubtleBeep();
    globalRoutinePreferenceManager.deletePreference(id);
  };

  const handleAddRoutineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoutineTime.trim() || !newRoutineActivity.trim()) return;

    SoundEffects.playCurriculumUpdated();
    globalRoutinePreferenceManager.addRoutine(
      newRoutineTime,
      newRoutineActivity,
      newRoutineCategory,
      newRoutineNotes
    );
    setIsAddRoutineOpen(false);
    setNewRoutineTime('');
    setNewRoutineActivity('');
    setNewRoutineNotes('');
  };

  const handleAddPrefSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrefTitle.trim()) return;

    SoundEffects.playCurriculumUpdated();
    globalRoutinePreferenceManager.addPreference(
      newPrefType,
      newPrefTitle,
      newPrefDesc,
      newPrefCategory,
      newPrefIntensity
    );
    setIsAddPrefOpen(false);
    setNewPrefTitle('');
    setNewPrefDesc('');
  };

  const handleResetDefaults = () => {
    SoundEffects.playCurriculumUpdated();
    globalRoutinePreferenceManager.resetDefaults();
  };

  const getRoutineCategoryIcon = (cat: DailyRoutineItem['category']) => {
    switch (cat) {
      case 'morning':
        return <Sun className="w-4 h-4 text-amber-400" />;
      case 'work':
        return <Code2 className="w-4 h-4 text-amber-400" />;
      case 'study':
        return <Sparkles className="w-4 h-4 text-violet-400" />;
      case 'workout':
        return <Dumbbell className="w-4 h-4 text-emerald-400" />;
      case 'evening':
        return <Coffee className="w-4 h-4 text-orange-400" />;
      case 'night':
        return <Moon className="w-4 h-4 text-indigo-400" />;
      default:
        return <Clock className="w-4 h-4 text-amber-400" />;
    }
  };

  const filteredPrefs = preferences.filter((p) => {
    if (prefFilter === 'all') return true;
    return p.type === prefFilter;
  });

  return (
    <div
      id="routine-prefs-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 font-mono"
      onClick={onClose}
    >
      <div
        id="routine-prefs-modal"
        className="w-full max-w-4xl h-[88vh] sm:h-[82vh] bg-[#070b16] border rounded-2xl flex flex-col shadow-2xl relative overflow-hidden"
        style={{
          borderColor: `${currentTheme.primary}77`,
          boxShadow: `0 0 50px rgba(0,0,0,0.9), 0 0 35px ${currentTheme.primary}25`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#050810]">
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl border flex items-center justify-center"
              style={{
                borderColor: `${currentTheme.primary}66`,
                background: `${currentTheme.primary}18`,
                color: currentTheme.primaryLight,
              }}
            >
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-slate-100 text-base sm:text-lg">
                  COMMANDER ROUTINE & PREFERENCES MATRIX
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-amber-400">
                  NEURAL SYNCED
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Daily Schedule, Pasand (Likes), Napasand (Dislikes), & Lifestyle Patterns
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-400 hover:text-white"
              title="Reset to default routine & preferences"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Reset Defaults</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selector & Voice Prompt Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-2.5 bg-[#04060d] border-b border-slate-800 gap-2">
          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('routine')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'routine'
                  ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(255,196,0,0.4)]'
                  : 'bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Daily Routine (दिनचर्या)</span>
              <span className="text-[10px] opacity-75">({routines.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('preferences')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'preferences'
                  ? 'bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.4)]'
                  : 'bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Heart className="w-3.5 h-3.5" />
              <span>Pasand & Napasand (पसंद / नापसंद)</span>
              <span className="text-[10px] opacity-75">({preferences.length})</span>
            </button>
          </div>

          {/* Voice Prompt */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Say: "FRIDAY, meri pasand aur daily routine batao"</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#070b16]">
          {activeTab === 'routine' ? (
            /* Tab 1: Daily Routine Schedule */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-200">
                    Chronological Day Block Architecture
                  </h4>
                  <p className="text-xs text-slate-400">
                    FRIDAY monitors these time gates to trigger morning briefings, focus pomodoros, and evening debriefs.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddRoutineOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-black text-xs font-bold transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Routine Block</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {routines.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                      item.isActive
                        ? 'bg-[#0a0f1e] border-slate-800 hover:border-amber-500/50 shadow-md'
                        : 'bg-slate-950/40 border-slate-900 opacity-60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                            {getRoutineCategoryIcon(item.category)}
                          </div>
                          <span className="text-xs font-bold text-amber-400 font-mono">
                            {item.timeSlot}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleRoutine(item.id, item.isActive)}
                            className={`text-[10px] px-2 py-0.5 rounded font-bold border transition-colors ${
                              item.isActive
                                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40'
                                : 'bg-slate-900 text-slate-500 border-slate-800'
                            }`}
                          >
                            {item.isActive ? 'Active' : 'Muted'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRoutine(item.id)}
                            className="p-1 text-slate-600 hover:text-red-400"
                            title="Delete routine item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h5 className="text-xs sm:text-sm font-bold text-slate-200 mb-1">
                        {item.activity}
                      </h5>
                      {item.notes && (
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {item.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Tab 2: Pasand & Napasand (Likes & Dislikes) */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-200">
                    Commander Behavioral & Preference Matrix
                  </h4>
                  <p className="text-xs text-slate-400">
                    Things you love (Pasand), things you dislike (Napasand), habits, and sensory boundaries.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPrefFilter('all')}
                      className={`px-2.5 py-1 rounded ${
                        prefFilter === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrefFilter('like')}
                      className={`px-2.5 py-1 rounded flex items-center gap-1 ${
                        prefFilter === 'like' ? 'bg-emerald-950 text-emerald-400 font-bold' : 'text-slate-400'
                      }`}
                    >
                      <Heart className="w-3 h-3 text-emerald-400" />
                      Pasand
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrefFilter('dislike')}
                      className={`px-2.5 py-1 rounded flex items-center gap-1 ${
                        prefFilter === 'dislike' ? 'bg-rose-950 text-rose-400 font-bold' : 'text-slate-400'
                      }`}
                    >
                      <ThumbsDown className="w-3 h-3 text-rose-400" />
                      Napasand
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAddPrefOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Preference</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredPrefs.map((pref) => {
                  const isLike = pref.type === 'like';
                  return (
                    <div
                      key={pref.id}
                      className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                        isLike
                          ? 'bg-[#091515] border-emerald-900/60 hover:border-emerald-500/50'
                          : 'bg-[#150a0f] border-rose-900/60 hover:border-rose-500/50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`p-1.5 rounded-lg border ${
                                isLike
                                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400'
                                  : 'bg-rose-950/80 border-rose-500/40 text-rose-400'
                              }`}
                            >
                              {isLike ? <Heart className="w-3.5 h-3.5" /> : <ThumbsDown className="w-3.5 h-3.5" />}
                            </span>
                            <span
                              className={`text-[11px] font-bold uppercase tracking-wider ${
                                isLike ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isLike ? 'PASAND (LIKE)' : 'NAPASAND (DISLIKE)'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 uppercase">
                              {pref.intensity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeletePref(pref.id)}
                              className="p-1 text-slate-600 hover:text-red-400"
                              title="Delete preference"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <h5 className="text-sm font-bold text-slate-200 mb-1">
                          {pref.title}
                        </h5>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {pref.description}
                        </p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                        <span className="uppercase">{pref.category.replace('_', ' ')}</span>
                        <span>Archived in Neural Core</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Add Routine Modal */}
        {isAddRoutineOpen && (
          <div className="absolute inset-0 z-20 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="w-full max-w-md bg-[#080A0D] border border-slate-700 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>Add Routine Time Block</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setIsAddRoutineOpen(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddRoutineSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Time Slot (e.g. "08:00 AM - 09:30 AM")</label>
                  <input
                    type="text"
                    value={newRoutineTime}
                    onChange={(e) => setNewRoutineTime(e.target.value)}
                    placeholder="e.g. 08:00 AM - 09:00 AM"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Activity Title</label>
                  <input
                    type="text"
                    value={newRoutineActivity}
                    onChange={(e) => setNewRoutineActivity(e.target.value)}
                    placeholder="e.g. Deep Coding Session"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Category</label>
                  <select
                    value={newRoutineCategory}
                    onChange={(e) => setNewRoutineCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none"
                  >
                    <option value="morning">Morning</option>
                    <option value="work">Work & Development</option>
                    <option value="study">Study & Research</option>
                    <option value="workout">Workout & Physical</option>
                    <option value="evening">Evening Debrief</option>
                    <option value="night">Night Sleep</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Special Notes / Preferences</label>
                  <input
                    type="text"
                    value={newRoutineNotes}
                    onChange={(e) => setNewRoutineNotes(e.target.value)}
                    placeholder="e.g. Needs quiet environment, tea, lofi beats"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddRoutineOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-black font-bold"
                  >
                    Save Routine
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Preference Modal */}
        {isAddPrefOpen && (
          <div className="absolute inset-0 z-20 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="w-full max-w-md bg-[#080A0D] border border-slate-700 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-400" />
                  <span>Add Pasand / Napasand Rule</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setIsAddPrefOpen(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddPrefSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Preference Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewPrefType('like')}
                      className={`py-2 rounded-lg font-bold border text-xs flex items-center justify-center gap-1.5 ${
                        newPrefType === 'like'
                          ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Heart className="w-3.5 h-3.5" />
                      <span>Pasand (Like)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewPrefType('dislike')}
                      className={`py-2 rounded-lg font-bold border text-xs flex items-center justify-center gap-1.5 ${
                        newPrefType === 'dislike'
                          ? 'bg-rose-950 border-rose-500 text-rose-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span>Napasand (Dislike)</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Title (e.g. "Chai / Tea" or "Bitter Coffee")</label>
                  <input
                    type="text"
                    value={newPrefTitle}
                    onChange={(e) => setNewPrefTitle(e.target.value)}
                    placeholder="e.g. Masala Chai"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none focus:border-rose-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Description / Reason</label>
                  <textarea
                    rows={3}
                    value={newPrefDesc}
                    onChange={(e) => setNewPrefDesc(e.target.value)}
                    placeholder="e.g. Chai fresh mood deti hai, subah aur shaam do bar chahiye."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none focus:border-rose-500 resize-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Category</label>
                    <select
                      value={newPrefCategory}
                      onChange={(e) => setNewPrefCategory(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none"
                    >
                      <option value="food_beverage">Food / Beverage</option>
                      <option value="work_habit">Work Habit</option>
                      <option value="technology">Technology & Code</option>
                      <option value="lifestyle">Lifestyle</option>
                      <option value="music">Music</option>
                      <option value="communication">Communication</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Intensity</label>
                    <select
                      value={newPrefIntensity}
                      onChange={(e) => setNewPrefIntensity(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none"
                    >
                      <option value="favorite">Top Favorite / Strict</option>
                      <option value="strong">Strong</option>
                      <option value="moderate">Moderate</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddPrefOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
                  >
                    Save Preference
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-2.5 bg-[#050810] border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
            <span>COMMANDER PSYCHOMETRIC & ROUTINE PROFILE ACTIVE</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            Close Matrix
          </button>
        </div>
      </div>
    </div>
  );
};
