import React, { useState } from 'react';
import {
  BookOpen,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  Calendar,
  Clock,
  ArrowRight,
  Monitor,
  Edit3,
  RotateCcw,
  X,
  ChevronRight,
  BookmarkCheck,
  Code2,
  Lightbulb,
  Plus,
  Trash2,
} from 'lucide-react';
import { StudyCurriculum, StudyLevel, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';
import { globalCurriculumManager } from '../services/CurriculumManager';
import { SoundEffects } from '../utils/SoundEffects';

interface HUDStudyMatrixProps {
  curriculum: StudyCurriculum;
  isOpen: boolean;
  theme: ThemeAccent;
  isScreenWatching: boolean;
  onToggleScreenWatch: () => void;
  onClose: () => void;
}

const PRESET_SUBJECTS = [
  {
    subject: 'Full-Stack Web Development & AI Systems',
    level: 'beginner' as StudyLevel,
    currentTopic: 'HTML/CSS Semantics & React Component Tree',
    leftOffTopic: 'Writing functional components and passing TypeScript props',
    nextSessionPlan: 'State Management with useState and real-time DOM reconciliation',
    practiceChallenge: 'Build a typed Counter and Profile card with props validation',
  },
  {
    subject: 'Python & Generative AI Engineering',
    level: 'beginner' as StudyLevel,
    currentTopic: 'Python Fundamentals & Data Structures',
    leftOffTopic: 'List comprehensions, dictionaries, and lambda functions',
    nextSessionPlan: 'Gemini API client initialization and prompt engineering',
    practiceChallenge: 'Write a script that queries Gemini Live streaming API with error handling',
  },
  {
    subject: 'Data Structures & Algorithms Mastery',
    level: 'intermediate' as StudyLevel,
    currentTopic: 'Binary Search & Two-Pointer Patterns',
    leftOffTopic: 'Handling edge conditions in rotated sorted array search',
    nextSessionPlan: 'Sliding window technique and dynamic frequency maps',
    practiceChallenge: 'Solve LeetCode #33 Search in Rotated Sorted Array in O(log n)',
  },
  {
    subject: 'Calculus & Physics for Engineers',
    level: 'beginner' as StudyLevel,
    currentTopic: 'Limits, Continuity, and Derivatives',
    leftOffTopic: 'The Chain Rule and trigonometric derivatives',
    nextSessionPlan: 'Applications of Derivatives: Optimization and Related Rates',
    practiceChallenge: 'Derive the rate of change for volume in a conical reservoir',
  },
];

export const HUDStudyMatrix: React.FC<HUDStudyMatrixProps> = ({
  curriculum,
  isOpen,
  theme,
  isScreenWatching,
  onToggleScreenWatch,
  onClose,
}) => {
  const currentTheme = THEMES[theme] || THEMES.amber;
  const [isEditing, setIsEditing] = useState(false);
  const [editSubject, setEditSubject] = useState(curriculum.subject);
  const [editLevel, setEditLevel] = useState<StudyLevel>(curriculum.level);
  const [editLeftOff, setEditLeftOff] = useState(curriculum.leftOffTopic);
  const [editNextPlan, setEditNextPlan] = useState(curriculum.nextSessionPlan);
  const [editChallenge, setEditChallenge] = useState(curriculum.practiceChallenge || '');
  const [newNote, setNewNote] = useState('');

  if (!isOpen) return null;

  const handleSaveEdits = () => {
    globalCurriculumManager.updateCurriculum({
      subject: editSubject,
      level: editLevel,
      leftOffTopic: editLeftOff,
      nextSessionPlan: editNextPlan,
      practiceChallenge: editChallenge,
    });
    SoundEffects.playCurriculumUpdated();
    setIsEditing(false);
  };

  const handleAdvanceStep = () => {
    globalCurriculumManager.advanceStep(
      curriculum.currentTopic,
      curriculum.nextSessionPlan,
      `Mastered ${curriculum.currentTopic} during interactive mentor session.`
    );
    SoundEffects.playLessonStepAdvance();
  };

  const handleApplyPreset = (preset: typeof PRESET_SUBJECTS[0]) => {
    globalCurriculumManager.updateCurriculum({
      subject: preset.subject,
      level: preset.level,
      currentTopic: preset.currentTopic,
      currentStep: 1,
      totalSteps: 6,
      leftOffTopic: preset.leftOffTopic,
      nextSessionPlan: preset.nextSessionPlan,
      practiceChallenge: preset.practiceChallenge,
    });
    setEditSubject(preset.subject);
    setEditLevel(preset.level);
    setEditLeftOff(preset.leftOffTopic);
    setEditNextPlan(preset.nextSessionPlan);
    setEditChallenge(preset.practiceChallenge);
    SoundEffects.playCurriculumUpdated();
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    globalCurriculumManager.addStudyNote(newNote.trim());
    setNewNote('');
    SoundEffects.playSubtleBeep();
  };

  const progressPercent = Math.min(
    100,
    Math.round((curriculum.currentStep / Math.max(1, curriculum.totalSteps)) * 100)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        id="hud-study-matrix-modal"
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border bg-slate-950/95 shadow-2xl overflow-hidden text-slate-100"
        style={{
          borderColor: `${currentTheme.primary}77`,
          boxShadow: `0 0 50px rgba(0,0,0,0.9), 0 0 30px ${currentTheme.primary}33`,
        }}
      >
        {/* Top Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b bg-slate-900/60"
          style={{ borderColor: `${currentTheme.primary}33` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl border flex items-center justify-center shadow-lg"
              style={{
                backgroundColor: `${currentTheme.primary}15`,
                borderColor: `${currentTheme.primary}55`,
                color: currentTheme.primary,
              }}
            >
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-wide text-white flex items-center gap-2">
                  STARK ACADEMY // PROFESSOR FRIDAY
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  TEACHER MODE ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Step-by-step syllabus, real-time screen watching & tomorrow's continuity tracker
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-mono text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-amber-400" />
              <span>{isEditing ? 'Cancel Edit' : 'Edit Syllabus'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Action Bar: Screen Watch & Advance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Screen Watch Toggle Card */}
            <div
              className="p-4 rounded-xl border flex items-center justify-between bg-slate-900/40 backdrop-blur-sm transition-all"
              style={{
                borderColor: isScreenWatching ? '#10b981' : `${currentTheme.primary}44`,
                boxShadow: isScreenWatching ? '0 0 20px rgba(16,185,129,0.2)' : 'none',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-lg border ${
                    isScreenWatching
                      ? 'bg-emerald-950/60 border-emerald-500 text-emerald-400 animate-pulse'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Live Screen Watching</h4>
                  <p className="text-xs text-slate-400">
                    {isScreenWatching
                      ? 'FRIDAY is watching your code & screen in real-time'
                      : 'Share screen so FRIDAY can see your editor & teach you'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleScreenWatch}
                className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold transition-all flex items-center gap-1.5 shadow-md ${
                  isScreenWatching
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-amber-600 hover:bg-amber-500 text-white'
                }`}
              >
                {isScreenWatching ? 'Stop Watching' : 'Start Watching'}
              </button>
            </div>

            {/* Advance Step Action Card */}
            <div
              className="p-4 rounded-xl border flex items-center justify-between bg-slate-900/40 backdrop-blur-sm"
              style={{ borderColor: `${currentTheme.primary}44` }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="p-2.5 rounded-lg border text-amber-400"
                  style={{
                    backgroundColor: `${currentTheme.primary}20`,
                    borderColor: `${currentTheme.primary}55`,
                  }}
                >
                  <BookmarkCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Step Completion</h4>
                  <p className="text-xs text-slate-400">
                    Mastered current topic? Advance to the next lesson step
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAdvanceStep}
                className="px-3 py-2 rounded-lg text-xs font-mono font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1.5 shadow-md"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark Mastered</span>
              </button>
            </div>
          </div>

          {/* Active Course & Level Banner */}
          <div
            className="p-5 rounded-xl border bg-gradient-to-r from-slate-900/80 via-slate-900/50 to-slate-900/80 backdrop-blur-sm relative overflow-hidden"
            style={{ borderColor: `${currentTheme.primary}55` }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
                    ACTIVE COURSE / DISCIPLINE
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase"
                    style={{
                      backgroundColor: `${currentTheme.primary}25`,
                      color: currentTheme.primary,
                      border: `1px solid ${currentTheme.primary}55`,
                    }}
                  >
                    {(curriculum.level || 'beginner').toUpperCase()} LEVEL
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight">{curriculum.subject}</h3>
                <p className="text-xs text-slate-300 mt-1 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Current Topic: </span>
                  <strong className="text-amber-300">{curriculum.currentTopic}</strong>
                </p>
              </div>

              {/* Progress Ring / Bar */}
              <div className="flex flex-col sm:items-end">
                <div className="text-xs font-mono text-slate-400 mb-1 flex items-center gap-2">
                  <span>Syllabus Progress:</span>
                  <strong className="text-white">
                    Step {curriculum.currentStep} of {curriculum.totalSteps} ({progressPercent}%)
                  </strong>
                </div>
                <div className="w-48 h-2.5 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progressPercent}%`,
                      backgroundColor: currentTheme.primary,
                      boxShadow: `0 0 10px ${currentTheme.primary}`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Study Progress Path Visualization */}
            <div className="mt-6 pt-5 border-t border-slate-800/60">
              <div className="relative flex items-center justify-between w-full px-2 sm:px-6">
                {/* Connecting Line background */}
                <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-slate-800 rounded-full z-0" />
                
                {/* Connecting Line foreground */}
                <div 
                  className="absolute left-6 top-1/2 -translate-y-1/2 h-1 rounded-full z-0 transition-all duration-700 ease-out" 
                  style={{ 
                    width: curriculum.totalSteps > 1 
                      ? `calc(${Math.max(0, Math.min(100, ((curriculum.currentStep - 1) / (curriculum.totalSteps - 1)) * 100))}% - 1.5rem)`
                      : '0px',
                    backgroundColor: currentTheme.primary,
                    boxShadow: `0 0 15px ${currentTheme.primary}80`
                  }} 
                />
                
                {/* Step Nodes */}
                {Array.from({ length: Math.min(10, Math.max(2, curriculum.totalSteps)) }).map((_, idx) => {
                  const stepNum = idx + 1;
                  const isCompleted = stepNum < curriculum.currentStep;
                  const isActive = stepNum === curriculum.currentStep;
                  const isUpcoming = stepNum > curriculum.currentStep;
                  
                  return (
                    <div key={idx} className="relative z-10 flex flex-col items-center group cursor-default">
                      <div 
                        className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 text-xs sm:text-sm font-mono font-bold transition-all duration-300 ${
                          isCompleted 
                            ? 'bg-emerald-500 border-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]' 
                            : isActive
                              ? 'bg-slate-900 text-white shadow-lg animate-pulse'
                              : 'bg-slate-900 border-slate-700 text-slate-500'
                        }`}
                        style={{
                          borderColor: isActive ? currentTheme.primary : undefined,
                          boxShadow: isActive ? `0 0 20px ${currentTheme.primary}66` : undefined
                        }}
                      >
                        {isCompleted ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> : stepNum}
                      </div>
                      
                      {/* Tooltip for step status */}
                      <div className="absolute top-12 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap bg-[#020617] border border-slate-700 px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-mono text-slate-300 z-20 shadow-xl">
                        {isCompleted ? 'Mastered' : isActive ? 'Current Topic' : 'Upcoming Step'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Continuity Cards: WHERE WE LEFT OFF & TOMORROW'S AGENDA */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* WHERE WE LEFT OFF CARD */}
            <div
              className="p-5 rounded-xl border bg-slate-900/70 relative overflow-hidden group hover:border-amber-500/60 transition-colors"
              style={{
                borderColor: 'rgba(245, 158, 11, 0.4)',
                boxShadow: '0 0 25px rgba(245, 158, 11, 0.1)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    <Clock className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold font-mono tracking-wider text-amber-300 uppercase">
                    WHERE WE LEFT OFF
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {new Date(curriculum.lastStudiedAt).toLocaleDateString()}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-black/50 border border-amber-500/30 text-sm text-slate-200 leading-relaxed font-sans">
                {curriculum.leftOffTopic || 'No bookmark recorded yet. Tell FRIDAY: "Let\'s pause here today".'}
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Continuity Status:</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Ready to resume anytime
                </span>
              </div>
            </div>

            {/* TOMORROW'S LESSON AGENDA CARD */}
            <div
              className="p-5 rounded-xl border bg-slate-900/70 relative overflow-hidden group hover:border-amber-500/60 transition-colors"
              style={{
                borderColor: `${currentTheme.primary}44`,
                boxShadow: `0 0 25px ${currentTheme.primary}15`,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="p-1.5 rounded-md border"
                    style={{
                      backgroundColor: `${currentTheme.primary}20`,
                      borderColor: `${currentTheme.primary}55`,
                      color: currentTheme.primary,
                    }}
                  >
                    <Calendar className="w-4 h-4" />
                  </div>
                  <h4
                    className="text-sm font-bold font-mono tracking-wider uppercase"
                    style={{ color: currentTheme.primary }}
                  >
                    TOMORROW'S LESSON AGENDA
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-amber-400">NEXT SESSION</span>
              </div>

              <div className="p-3.5 rounded-lg bg-black/50 border border-amber-500/30 text-sm text-slate-200 leading-relaxed font-sans">
                {curriculum.nextSessionPlan ||
                  'Tell FRIDAY what you want to cover tomorrow or click Edit Syllabus!'}
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Prompt to continue:</span>
                <span className="text-amber-300 italic font-sans">"FRIDAY, let's continue studying"</span>
              </div>
            </div>
          </div>

          {/* Hands-on Practice Challenge */}
          {curriculum.practiceChallenge && (
            <div className="p-4 rounded-xl border border-indigo-500/40 bg-indigo-950/20 text-slate-200">
              <div className="flex items-center gap-2 mb-2 text-indigo-300 font-mono text-xs font-bold uppercase tracking-wider">
                <Code2 className="w-4 h-4" />
                <span>ACTIVE PRACTICE CHALLENGE // HOMEWORK</span>
              </div>
              <p className="text-sm font-mono text-indigo-100 bg-black/40 p-3 rounded-lg border border-indigo-500/20">
                {curriculum.practiceChallenge}
              </p>
            </div>
          )}

          {/* Edit Form Modal (When isEditing is active) */}
          {isEditing && (
            <div className="p-5 rounded-xl border border-amber-500/60 bg-slate-900/90 space-y-4 animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-400" />
                  <span>EDIT STUDY SYLLABUS & CONTINUITY</span>
                </h4>
                <div className="text-xs text-slate-400 font-mono">Changes sync automatically with FRIDAY</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Subject / Course Title</label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black/60 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Difficulty Level</label>
                  <select
                    value={editLevel}
                    onChange={(e) => setEditLevel(e.target.value as StudyLevel)}
                    className="w-full px-3 py-2 rounded-lg bg-black/60 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="mastery">Mastery</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Where We Left Off (Paused Topic)
                  </label>
                  <textarea
                    rows={2}
                    value={editLeftOff}
                    onChange={(e) => setEditLeftOff(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black/60 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Tomorrow's Lesson Agenda (Next Topic)
                  </label>
                  <textarea
                    rows={2}
                    value={editNextPlan}
                    onChange={(e) => setEditNextPlan(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black/60 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-mono text-slate-300 mb-1">Practice Exercise / Homework</label>
                  <input
                    type="text"
                    value={editChallenge}
                    onChange={(e) => setEditChallenge(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black/60 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-1.5 rounded-lg border border-slate-700 text-xs font-mono text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdits}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-mono font-semibold text-white shadow-lg"
                >
                  Save Syllabus
                </button>
              </div>
            </div>
          )}

          {/* Quick Preset Curriculum Selector */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
            <h4 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              <span>Or Choose a Disciplined Curriculum Preset:</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PRESET_SUBJECTS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="p-2.5 text-left rounded-lg border border-slate-800 hover:border-amber-500/50 bg-black/30 hover:bg-slate-800/60 transition-all group"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-white group-hover:text-amber-300">
                    <span className="truncate">{preset.subject}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                      {preset.level}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-1">Next: {preset.nextSessionPlan}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Completed Milestones & Study Notebook */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Completed Milestones */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-mono font-bold uppercase text-slate-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>MASTERED CONCEPTS ({(curriculum.completedConcepts || []).length})</span>
                </h4>
              </div>
              {(curriculum.completedConcepts || []).length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4 text-center">
                  No concepts checked off yet. As you study with FRIDAY, she will log your milestones!
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(curriculum.completedConcepts || []).map((concept, idx) => {
                    const conceptName = typeof concept === 'string' ? concept : (concept as any).title || String(concept);
                    return (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-between text-xs text-slate-200"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{conceptName}</span>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-400/70">
                          MASTERED
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Study Notebook & Takeaways */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-mono font-bold uppercase text-slate-300 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  <span>STUDY NOTEBOOK ({(curriculum.keyTakeaways || []).length})</span>
                </h4>
              </div>

              {/* Add Takeaway Input */}
              <form onSubmit={handleAddNote} className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Record takeaway or rule of thumb..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-black/50 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-mono text-white flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </form>

              {(curriculum.keyTakeaways || []).length === 0 ? (
                <p className="text-xs text-slate-500 italic py-4 text-center">
                  Notebook is empty. Tell FRIDAY: "Save this study note" to record key formulas!
                </p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {(curriculum.keyTakeaways || []).map((note, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-black/40 border border-slate-800 text-xs text-slate-300 font-mono flex items-start justify-between gap-2"
                    >
                      <span>• {note}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Socratic Teaching Voice Prompts Guide */}
          <div className="p-4 rounded-xl border border-slate-800 bg-black/60">
            <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
              Recommended Voice Prompts to Say to FRIDAY:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-slate-900/60 border border-slate-800 text-amber-300">
                💬 "FRIDAY, where did we leave off?"
              </div>
              <div className="p-2 rounded bg-slate-900/60 border border-slate-800 text-emerald-300">
                💬 "Watch my screen and teach me step-by-step from beginner"
              </div>
              <div className="p-2 rounded bg-slate-900/60 border border-slate-800 text-amber-300">
                💬 "Let's pause here. What are we studying tomorrow?"
              </div>
              <div className="p-2 rounded bg-slate-900/60 border border-slate-800 text-purple-300">
                💬 "Mark this concept as mastered and give me the next challenge"
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
