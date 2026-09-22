import { CommanderPreference, DailyRoutineItem } from '../types';

const ROUTINE_STORAGE_KEY = 'friday_commander_routine';
const PREFS_STORAGE_KEY = 'friday_commander_preferences';

const DEFAULT_ROUTINES: DailyRoutineItem[] = [
  {
    id: 'routine-1',
    timeSlot: '07:30 AM - 08:30 AM',
    activity: 'Morning Awakening & Fresh Tea (Chai)',
    category: 'morning',
    notes: 'Likes hot traditional ginger/cardamom tea, light stretches, and reviewing weather & daily priorities.',
    isActive: true,
  },
  {
    id: 'routine-2',
    timeSlot: '09:00 AM - 01:00 PM',
    activity: 'Deep Architecture & AI Core Development',
    category: 'work',
    notes: 'High-intensity coding and agent design. Minimizes interruptions. Prefers TypeScript, Python, and neural logic.',
    isActive: true,
  },
  {
    id: 'routine-3',
    timeSlot: '01:00 PM - 02:00 PM',
    activity: 'Lunch Break & Mental Refresh',
    category: 'work',
    notes: 'Healthy meal, light walking or checking tech updates.',
    isActive: true,
  },
  {
    id: 'routine-4',
    timeSlot: '02:30 PM - 05:30 PM',
    activity: 'Feature Deployment & Interactive Debugging',
    category: 'study',
    notes: 'Running tests, polishing UI/UX feedback loops, and learning new AI frontiers.',
    isActive: true,
  },
  {
    id: 'routine-5',
    timeSlot: '06:30 PM - 07:30 PM',
    activity: 'Evening Physical Workout & Reset',
    category: 'workout',
    notes: 'Cardio / gym session to stay physically energized.',
    isActive: true,
  },
  {
    id: 'routine-6',
    timeSlot: '09:00 PM - 10:30 PM',
    activity: 'Evening Protocol Debrief & Reading',
    category: 'evening',
    notes: 'Reviewing milestones achieved today, bookmarking curriculum topics, planning tomorrow.',
    isActive: true,
  },
  {
    id: 'routine-7',
    timeSlot: '11:00 PM - 07:00 AM',
    activity: 'Nightly Sleep & Autonomous System Backup',
    category: 'night',
    notes: 'Recharge sleep block. JARVIS switches to standby monitoring.',
    isActive: true,
  },
];

const DEFAULT_PREFERENCES: CommanderPreference[] = [
  {
    id: 'pref-like-1',
    type: 'like',
    category: 'food_beverage',
    title: 'Hot Tea (Chai)',
    description: 'Badi shauq se chai peete hain, fresh ginger-cardamom flavor pasand hai.',
    intensity: 'favorite',
    createdAt: Date.now() - 86400000 * 4,
  },
  {
    id: 'pref-dislike-1',
    type: 'dislike',
    category: 'food_beverage',
    title: 'Excessive Coffee',
    description: 'Black/bitter coffee pasand nahi hai, chai ke muqable bilkul avoid karte hain.',
    intensity: 'strong',
    createdAt: Date.now() - 86400000 * 4,
  },
  {
    id: 'pref-like-2',
    type: 'like',
    category: 'technology',
    title: 'Autonomous AI & Clean Code',
    description: 'Clean modern TypeScript, responsive interfaces, stark cybernetic styling, and fast voice loops.',
    intensity: 'favorite',
    createdAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'pref-dislike-2',
    type: 'dislike',
    category: 'communication',
    title: 'Robotic Clichés & AI Slop',
    description: 'Boring AI jargon ("supercharge", "empower", dry corporate tone) sakht napasand hai. Witty aur direct conversation pasand hai.',
    intensity: 'strong',
    createdAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'pref-like-3',
    type: 'like',
    category: 'work_habit',
    title: 'Late Night Deep Focus Sessions',
    description: 'Raat me shanti se undisturbed focus aur creative problem-solving achcha lagta hai.',
    intensity: 'strong',
    createdAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'pref-dislike-3',
    type: 'dislike',
    category: 'work_habit',
    title: 'Sudden Loud Notifications & Distractions',
    description: 'Deep work ke dauran faltu notification ya context-switching napasand hai.',
    intensity: 'moderate',
    createdAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'pref-like-4',
    type: 'like',
    category: 'music',
    title: 'Lofi Ambient Beats & Synthwave',
    description: 'Coding aur analytical research karte waqt calm instrumental background music pasand hai.',
    intensity: 'favorite',
    createdAt: Date.now() - 86400000,
  },
];

export class RoutinePreferenceManager {
  private routines: DailyRoutineItem[] = [];
  private preferences: CommanderPreference[] = [];
  private listeners: (() => void)[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const routineRaw = localStorage.getItem(ROUTINE_STORAGE_KEY);
      if (routineRaw) {
        const parsed = JSON.parse(routineRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.routines = parsed;
        } else {
          this.routines = [...DEFAULT_ROUTINES];
        }
      } else {
        this.routines = [...DEFAULT_ROUTINES];
      }

      const prefsRaw = localStorage.getItem(PREFS_STORAGE_KEY);
      if (prefsRaw) {
        const parsed = JSON.parse(prefsRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.preferences = parsed;
        } else {
          this.preferences = [...DEFAULT_PREFERENCES];
        }
      } else {
        this.preferences = [...DEFAULT_PREFERENCES];
      }
    } catch (e) {
      console.error('[RoutinePreferenceManager] Error loading storage:', e);
      this.routines = [...DEFAULT_ROUTINES];
      this.preferences = [...DEFAULT_PREFERENCES];
    }
  }

  private save(): void {
    try {
      localStorage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(this.routines));
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(this.preferences));
    } catch (e) {
      console.error('[RoutinePreferenceManager] Error saving:', e);
    }
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[RoutinePreferenceManager] Listener error:', err);
      }
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    listener();
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getRoutines(): DailyRoutineItem[] {
    return [...this.routines];
  }

  getPreferences(filterType?: 'like' | 'dislike'): CommanderPreference[] {
    if (!filterType) return [...this.preferences];
    return this.preferences.filter((p) => p.type === filterType);
  }

  addRoutine(timeSlot: string, activity: string, category: DailyRoutineItem['category'] = 'work', notes?: string): DailyRoutineItem {
    const item: DailyRoutineItem = {
      id: `rt-${Date.now()}`,
      timeSlot: timeSlot.trim(),
      activity: activity.trim(),
      category,
      notes: notes?.trim(),
      isActive: true,
    };
    this.routines.push(item);
    this.save();
    return item;
  }

  updateRoutine(id: string, updates: Partial<DailyRoutineItem>): boolean {
    const idx = this.routines.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.routines[idx] = { ...this.routines[idx], ...updates };
    this.save();
    return true;
  }

  deleteRoutine(id: string): boolean {
    const initial = this.routines.length;
    this.routines = this.routines.filter((r) => r.id !== id);
    if (this.routines.length !== initial) {
      this.save();
      return true;
    }
    return false;
  }

  addPreference(
    type: 'like' | 'dislike',
    title: string,
    description: string,
    category: CommanderPreference['category'] = 'lifestyle',
    intensity: CommanderPreference['intensity'] = 'strong'
  ): CommanderPreference {
    const item: CommanderPreference = {
      id: `pref-${Date.now()}`,
      type,
      category,
      title: title.trim(),
      description: description.trim(),
      intensity,
      createdAt: Date.now(),
    };
    this.preferences.unshift(item);
    this.save();
    return item;
  }

  deletePreference(id: string): boolean {
    const initial = this.preferences.length;
    this.preferences = this.preferences.filter((p) => p.id !== id);
    if (this.preferences.length !== initial) {
      this.save();
      return true;
    }
    return false;
  }

  resetDefaults(): void {
    this.routines = [...DEFAULT_ROUTINES];
    this.preferences = [...DEFAULT_PREFERENCES];
    this.save();
  }

  /**
   * Generates a context digest for Gemini model so JARVIS knows routine and likes/dislikes
   */
  getDigestForPrompt(): string {
    const likes = this.preferences.filter((p) => p.type === 'like').map((p) => `• [PASAND/LIKE]: ${p.title} - ${p.description}`).join('\n');
    const dislikes = this.preferences.filter((p) => p.type === 'dislike').map((p) => `• [NAPASAND/DISLIKE]: ${p.title} - ${p.description}`).join('\n');
    const routine = this.routines.filter((r) => r.isActive).map((r) => `• [${r.timeSlot}] ${r.activity} (${r.notes || ''})`).join('\n');

    return `COMMANDER DAILY ROUTINE:\n${routine}\n\nCOMMANDER LIKES & DISLIKES (PASAND / NAPASAND):\n${likes}\n${dislikes}`;
  }
}

export const globalRoutinePreferenceManager = new RoutinePreferenceManager();
