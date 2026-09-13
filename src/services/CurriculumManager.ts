/**
 * CurriculumManager
 * Manages persistent step-by-step learning syllabi, concept mastery,
 * and study session continuity so the user can continue studying tomorrow
 * right where they left off.
 */

import { StudyCurriculum, StudyLevel } from '../types';
import { globalMemoryManager } from './MemoryManager';

const STORAGE_KEY = 'friday_study_curriculum';

export const DEFAULT_CURRICULUM: StudyCurriculum = {
  id: 'curr_main',
  subject: 'Full-Stack Software Engineering: React, TypeScript & AI Systems',
  level: 'beginner',
  currentTopic: 'Foundations of Modern State & React Component Lifecycle',
  currentStep: 1,
  totalSteps: 6,
  leftOffTopic: 'Reactive hooks, state lifting, and component props passing',
  nextSessionPlan: 'Asynchronous side effects, useEffect cleanup functions, and WebSocket streaming',
  completedConcepts: [
    'Core JavaScript ES6+ execution model and event loop',
    'TypeScript strict types, interfaces, and union generics',
  ],
  keyTakeaways: [
    'Always clean up WebSocket and event subscriptions in useEffect return functions to prevent memory leaks.',
    'Prefer immutable state updates using functional updates to avoid race conditions.',
  ],
  practiceChallenge: 'Build a custom hook useDebounce to buffer keystrokes before initiating an API query.',
  lastStudiedAt: Date.now(),
  streakDays: 3,
  teacherPersona: 'professor',
};

export class CurriculumManager {
  private curriculum: StudyCurriculum;
  private listeners: ((curriculum: StudyCurriculum) => void)[] = [];

  constructor() {
    this.curriculum = this.load();
    this.syncToMemory();
  }

  private load(): StudyCurriculum {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...DEFAULT_CURRICULUM,
          ...parsed,
        };
      }
    } catch (err) {
      console.error('[CurriculumManager] Error reading stored curriculum:', err);
    }
    return { ...DEFAULT_CURRICULUM };
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.curriculum));
    } catch (err) {
      console.error('[CurriculumManager] Error saving curriculum:', err);
    }
    this.notify();
    this.syncToMemory();
  }

  private notify(): void {
    const copy = { ...this.curriculum };
    this.listeners.forEach((l) => {
      try {
        l(copy);
      } catch (err) {
        console.error('[CurriculumManager] Listener error:', err);
      }
    });
  }

  private syncToMemory(): void {
    try {
      const summary = `Active Subject: ${this.curriculum.subject} (Level: ${this.curriculum.level.toUpperCase()}). Step ${this.curriculum.currentStep}/${this.curriculum.totalSteps}: "${this.curriculum.currentTopic}". Left off at: "${this.curriculum.leftOffTopic}". Tomorrow's lesson plan: "${this.curriculum.nextSessionPlan}". Completed milestones: ${this.curriculum.completedConcepts.join(', ')}.`;

      globalMemoryManager.storeMemory(
        'project',
        'Current Study Curriculum',
        summary,
        'critical'
      );
    } catch (err) {
      // ignore memory sync failure
    }
  }

  getCurriculum(): StudyCurriculum {
    return { ...this.curriculum };
  }

  updateCurriculum(updates: Partial<StudyCurriculum>): StudyCurriculum {
    this.curriculum = {
      ...this.curriculum,
      ...updates,
      lastStudiedAt: Date.now(),
    };
    this.save();
    return { ...this.curriculum };
  }

  setSubject(subject: string, level: StudyLevel = 'beginner', initialTopic?: string): StudyCurriculum {
    this.curriculum = {
      ...this.curriculum,
      subject,
      level,
      currentTopic: initialTopic || `Introduction & Core Foundations of ${subject}`,
      currentStep: 1,
      totalSteps: 6,
      leftOffTopic: `Getting started with ${subject} fundamentals`,
      nextSessionPlan: `Deep dive into core building blocks and hands-on exercises for ${subject}`,
      completedConcepts: [],
      keyTakeaways: [],
      lastStudiedAt: Date.now(),
    };
    this.save();
    return { ...this.curriculum };
  }

  advanceStep(completedConcept: string, nextTopic?: string, takeawayNote?: string): StudyCurriculum {
    const newCompleted = [...this.curriculum.completedConcepts];
    if (completedConcept && !newCompleted.includes(completedConcept)) {
      newCompleted.push(completedConcept);
    }

    const newTakeaways = [...this.curriculum.keyTakeaways];
    if (takeawayNote && !newTakeaways.includes(takeawayNote)) {
      newTakeaways.push(takeawayNote);
    }

    const nextStep = Math.min(this.curriculum.totalSteps, this.curriculum.currentStep + 1);
    const resolvedNextTopic = nextTopic || this.curriculum.nextSessionPlan || `Step ${nextStep} Mastery`;

    this.curriculum = {
      ...this.curriculum,
      currentStep: nextStep,
      currentTopic: resolvedNextTopic,
      completedConcepts: newCompleted,
      keyTakeaways: newTakeaways,
      leftOffTopic: `Just mastered: ${completedConcept}. Ready for: ${resolvedNextTopic}`,
      lastStudiedAt: Date.now(),
    };
    this.save();
    return { ...this.curriculum };
  }

  setLeftOff(leftOffTopic: string, nextSessionPlan: string): StudyCurriculum {
    this.curriculum = {
      ...this.curriculum,
      leftOffTopic,
      nextSessionPlan,
      lastStudiedAt: Date.now(),
    };
    this.save();
    return { ...this.curriculum };
  }

  recordTakeaway(takeaway: string): void {
    if (!takeaway) return;
    const newTakeaways = [...this.curriculum.keyTakeaways];
    if (!newTakeaways.includes(takeaway)) {
      newTakeaways.push(takeaway);
      this.curriculum = {
        ...this.curriculum,
        keyTakeaways: newTakeaways,
        lastStudiedAt: Date.now(),
      };
      this.save();
    }
  }

  addStudyNote(note: string): void {
    this.recordTakeaway(note);
  }

  resetDefaults(): StudyCurriculum {
    this.curriculum = { ...DEFAULT_CURRICULUM, lastStudiedAt: Date.now() };
    this.save();
    return { ...this.curriculum };
  }

  subscribe(listener: (curriculum: StudyCurriculum) => void): () => void {
    this.listeners.push(listener);
    listener({ ...this.curriculum });
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Generates a rich formatted syllabus prompt string for Gemini Live system instructions
   */
  getCurriculumDigestForPrompt(): string {
    const c = this.curriculum;
    const lastDate = new Date(c.lastStudiedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    return [
      `• ACTIVE SUBJECT: ${c.subject} [Level: ${c.level.toUpperCase()}]`,
      `• CURRENT MODULE: Step ${c.currentStep} of ${c.totalSteps}: "${c.currentTopic}"`,
      `• WHERE WE LEFT OFF: "${c.leftOffTopic}" (Last session: ${lastDate})`,
      `• TOMORROW'S LESSON PLAN / NEXT SESSION AGENDA: "${c.nextSessionPlan}"`,
      `• MASTERED CONCEPTS: ${c.completedConcepts.length > 0 ? c.completedConcepts.join('; ') : 'Beginning of syllabus'}`,
      c.practiceChallenge ? `• ACTIVE PRACTICE CHALLENGE: ${c.practiceChallenge}` : '',
      `• STARK ACADEMY TEACHING DIRECTIVE: You are the Commander's dedicated personal teacher and mentor. Whenever the Commander asks "Where did we leave off?", "What are we doing tomorrow?", or "Continue yesterday's lesson", greet them warmly, cite the exact topic where you left off, review what was mastered, and seamlessly start the next step!`,
    ]
      .filter(Boolean)
      .join('\n');
  }
}

export const globalCurriculumManager = new CurriculumManager();
