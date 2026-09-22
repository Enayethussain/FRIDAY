import { ActionCard, FunctionCallItem, FunctionResponseItem, HologramControlAction, HologramState, MediaViewportState, MemoryItem, NoteItem, PCFileItem, StudyCurriculum, TaskItem, ThemeAccent, WeatherInfo, ProtocolId } from '../types';
import { matchObject, type HologramEntry } from '../hologram/registry';
import { getProviders, paidProvider, requestPaidGeneration } from '../hologram/providers';
import { globalMemoryManager } from './MemoryManager';
import { globalAuthManager } from './AuthManager';
import { globalCurriculumManager } from './CurriculumManager';
import { globalTranscriptManager } from './TranscriptManager';
import { globalPrivateVault } from './PrivateVaultManager';
import { globalRoutinePreferenceManager } from './RoutinePreferenceManager';
import { globalWorkspaceManager } from './WorkspaceManager';
import { globalFaceAuthManager } from './FaceAuthManager';
import { globalDeviceLink } from './DeviceLinkManager';
import { SoundEffects } from '../utils/SoundEffects';

export interface ToolCallbacks {
  onActionCard?: (card: ActionCard) => void;
  onSetTimer?: (seconds: number, label: string) => void;
  onSetTheme?: (theme: ThemeAccent) => void;
  onOpenMediaViewport?: (viewport: MediaViewportState) => void;
  onWeatherUpdated?: (weather: WeatherInfo) => void;
  onNotesChanged?: (notes: NoteItem[]) => void;
  onTasksChanged?: (tasks: TaskItem[]) => void;
  onFilesChanged?: (files: PCFileItem[]) => void;
  onMemoriesChanged?: (memories: MemoryItem[]) => void;
  onCurriculumChanged?: (curriculum: StudyCurriculum) => void;
  onEmotionalToneChanged?: (
    tone: string,
    valence?: number,
    arousal?: number,
    rationale?: string
  ) => void;
  onOpenWorkbench?: (code?: string, language?: string) => void;
  onTriggerProtocol?: (protocolId: ProtocolId) => void;
  onOpenKnowledgeGraph?: () => void;
  onOpenDebrief?: () => void;
  onOpenCalculator?: (expression?: string) => void;
  onOpenPrivateVault?: () => void;
  onOpenRoutinePreferences?: () => void;
  onOpenDesktopBridge?: () => void;
  onSurveillanceMode?: (active: boolean) => void;
  onOpenHologram?: (h: HologramState) => void;
  onControlHologram?: (action: HologramControlAction, degrees?: number) => void;
  onCompareHolograms?: (a: HologramState, b: HologramState) => void;
  onOpenHologramLibrary?: () => void;
}

export class ToolManager {
  private callbacks: ToolCallbacks;
  private cameraVideoProvider: (() => HTMLVideoElement | null) | null = null;

  constructor(callbacks: ToolCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /** Live camera frame provider (App ke cameraVideoEl se) — real face scan ke liye */
  setCameraVideoProvider(fn: (() => HTMLVideoElement | null) | null): void {
    this.cameraVideoProvider = fn;
  }

  private voiceCheckProvider: (() => { authorized: boolean; confidence: number; at: number } | null) | null = null;

  /** Aakhri voice-biometric result provider (AudioStreamer se) — real verifyCommander ke liye */
  setVoiceCheckProvider(fn: (() => { authorized: boolean; confidence: number; at: number } | null) | null): void {
    this.voiceCheckProvider = fn;
  }

  setCallbacks(callbacks: ToolCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  async executeCalls(functionCalls: FunctionCallItem[]): Promise<FunctionResponseItem[]> {
    const responses: FunctionResponseItem[] = [];

    for (const call of functionCalls) {
      try {
        const result = await this.executeSingleCall(call);
        responses.push({
          id: call.id,
          name: call.name,
          response: {
            output: result,
            result: result,
          },
        });
      } catch (err: any) {
        console.error(`Error executing tool ${call.name}:`, err);
        responses.push({
          id: call.id,
          name: call.name,
          response: {
            error: err?.message || 'Tool execution failed',
          },
        });
      }
    }

    return responses;
  }

  private async executeSingleCall(call: FunctionCallItem): Promise<any> {
    const args = call.args || {};

    switch (call.name) {
      case 'readUserFile': {
        const queryName = ((args.fileName as string) || '').toLowerCase().trim();
        const stored: PCFileItem[] = JSON.parse(localStorage.getItem('friday_pc_files') || '[]');

        const matched = stored.find(
          (f) =>
            f.name.toLowerCase() === queryName ||
            f.name.toLowerCase().includes(queryName) ||
            queryName.includes(f.name.toLowerCase()),
        );

        if (!matched) {
          return {
            status: 'file_not_found',
            searchedName: args.fileName,
            availableFiles: stored.map((f) => f.name),
            message: `File "${args.fileName}" is not currently in JARVIS's File Vault. Ask the user to click the PC Files icon in the top header or drag & drop their file into JARVIS.`,
          };
        }

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'file',
            title: `Inspecting PC File: ${matched.name}`,
            description: `${(matched.size / 1024).toFixed(1)} KB • ${matched.type || matched.extension}`,
            timestamp: Date.now(),
            data: matched,
          });
        }

        // Limit preview content to prevent context overload
        const contentSnippet = matched.content.length > 6000 ? `${matched.content.slice(0, 6000)}\n\n[...File truncated for speed, total length ${matched.content.length} characters]` : matched.content;

        return {
          status: 'success',
          fileName: matched.name,
          sizeBytes: matched.size,
          extension: matched.extension,
          content: contentSnippet,
          summary: `Successfully read "${matched.name}". Content preview: ${contentSnippet.slice(0, 300)}...`,
        };
      }

      case 'listUserFiles': {
        const stored: PCFileItem[] = JSON.parse(localStorage.getItem('friday_pc_files') || '[]');
        return {
          status: 'success',
          totalFiles: stored.length,
          files: stored.map((f) => ({
            name: f.name,
            sizeKb: Math.round(f.size / 1024),
            extension: f.extension,
            snippet: f.previewSnippet,
          })),
        };
      }

      case 'searchFileContent': {
        const query = ((args.query as string) || '').toLowerCase();
        const stored: PCFileItem[] = JSON.parse(localStorage.getItem('friday_pc_files') || '[]');
        const results: any[] = [];

        for (const file of stored) {
          if (file.content && file.content.toLowerCase().includes(query)) {
            // Find lines containing the query
            const lines = file.content.split('\n');
            const matchingLines = lines
              .map((line, idx) => ({ lineNum: idx + 1, text: line.trim() }))
              .filter((item) => item.text.toLowerCase().includes(query))
              .slice(0, 5);

            results.push({
              fileName: file.name,
              matches: matchingLines,
            });
          }
        }

        return {
          status: 'success',
          query,
          matchCount: results.length,
          results,
        };
      }

      case 'playMedia': {
        const query = (args.query as string) || 'trending music';
        const title = (args.title as string) || query;

        // Construct embedded YouTube player URL
        let embedUrl = `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(query)}&autoplay=1`;
        const externalUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

        // Open in-app HUD media player immediately
        if (this.callbacks.onOpenMediaViewport) {
          this.callbacks.onOpenMediaViewport({
            isOpen: true,
            title: `YouTube: ${title}`,
            query,
            embedUrl,
            externalUrl,
            type: 'youtube',
          });
        }

        // Also try opening in separate tab if browser allows
        try {
          window.open(externalUrl, '_blank', 'noopener,noreferrer');
        } catch {}

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'youtube',
            title: `Playing: ${title}`,
            description: 'Loaded in JARVIS HUD Media Player',
            url: externalUrl,
            actionLabel: 'Open YouTube',
            timestamp: Date.now(),
          });
        }

        return {
          status: 'success',
          action: 'playing_media',
          title,
          query,
          message: `Loaded "${query}" directly in your HUD media player.`,
        };
      }

      case 'openWebsite': {
        let url = (args.url as string) || '';
        const label = (args.label as string) || 'Website';
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = `https://${url}`;
        }

        const isYouTube = url.toLowerCase().includes('youtube.com') || url.toLowerCase().includes('youtu.be');

        if (isYouTube) {
          // If YouTube, load in HUD media viewport so it doesn't get blocked!
          let embedUrl = 'https://www.youtube-nocookie.com/embed?listType=search&list=trending&autoplay=1';
          if (url.includes('watch?v=')) {
            const videoId = url.split('watch?v=')[1]?.split('&')[0];
            if (videoId) embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
          } else if (url.includes('youtu.be/')) {
            const videoId = url.split('youtu.be/')[1]?.split('?')[0];
            if (videoId) embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
          }

          if (this.callbacks.onOpenMediaViewport) {
            this.callbacks.onOpenMediaViewport({
              isOpen: true,
              title: label || 'YouTube Player',
              query: label,
              embedUrl,
              externalUrl: url,
              type: 'youtube',
            });
          }
        } else {
          // Open viewport modal
          if (this.callbacks.onOpenMediaViewport) {
            this.callbacks.onOpenMediaViewport({
              isOpen: true,
              title: label,
              query: label,
              embedUrl: url,
              externalUrl: url,
              type: 'web',
            });
          }
        }

        // Try opening in new window
        try {
          window.open(url, '_blank', 'noopener,noreferrer');
        } catch (e) {
          console.warn('Window open caught by browser/iframe popup blocker:', e);
        }

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: isYouTube ? 'youtube' : 'website',
            title: `Navigating to ${label}`,
            description: url,
            url,
            actionLabel: 'Open Link',
            timestamp: Date.now(),
          });
        }

        return {
          status: 'success',
          action: 'opened_website',
          url,
          label,
          message: `Opened ${label} in your cybernetic viewport and browser.`,
        };
      }

      case 'getCurrentTime': {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        return {
          currentTime: timeStr,
          currentDate: dateStr,
          timezone,
          iso: now.toISOString(),
        };
      }

      case 'getWeather': {
        const location = (args.location as string) || 'Current Location';
        let weatherData: WeatherInfo;

        try {
          // Geocode using open-meteo geocoding
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
          const geoJson = await geoRes.json();
          if (geoJson.results && geoJson.results.length > 0) {
            const place = geoJson.results[0];
            const lat = place.latitude;
            const lon = place.longitude;
            const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
            const wJson = await weatherRes.json();
            const temp = Math.round(wJson.current.temperature_2m);
            const humidity = wJson.current.relative_humidity_2m;
            const wind = Math.round(wJson.current.wind_speed_10m);
            const high = Math.round(wJson.daily?.temperature_2m_max?.[0] ?? temp + 3);
            const low = Math.round(wJson.daily?.temperature_2m_min?.[0] ?? temp - 3);

            const code = wJson.current.weather_code;
            let condition = 'Clear skies';
            if (code >= 1 && code <= 3) condition = 'Partly cloudy';
            else if (code >= 45 && code <= 48) condition = 'Foggy conditions';
            else if (code >= 51 && code <= 67) condition = 'Rain showers';
            else if (code >= 71 && code <= 77) condition = 'Snow flurries';
            else if (code >= 95) condition = 'Thunderstorms';

            weatherData = {
              location: `${place.name}, ${place.country_code?.toUpperCase() || ''}`,
              temperature: temp,
              condition,
              humidity,
              windSpeed: wind,
              high,
              low,
            };
          } else {
            throw new Error('Location not found in geocoding');
          }
        } catch (e: any) {
          // NO fake fallback: andaze se mausam batana mana hai (spec section 9).
          // Fail honestly taaki JARVIS jhootha data na bole.
          return {
            status: 'error',
            location,
            message: `Live weather data nahi mil paya (${e?.message || 'network error'}). Internet check karke dobara puchho.`,
          };
        }

        this.callbacks.onWeatherUpdated?.(weatherData);

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'weather',
            title: `${weatherData.location}: ${weatherData.temperature}°C`,
            description: `${weatherData.condition} • Wind ${weatherData.windSpeed} km/h`,
            timestamp: Date.now(),
            data: weatherData,
          });
        }

        return {
          status: 'success',
          ...weatherData,
          summary: `The current weather in ${weatherData.location} is ${weatherData.temperature} degrees Celsius with ${weatherData.condition}.`,
        };
      }

      case 'saveNote': {
        const title = (args.title as string) || 'Quick Note';
        const content = (args.content as string) || '';

        const newNote: NoteItem = {
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          title,
          content,
          createdAt: Date.now(),
        };

        const existingNotes: NoteItem[] = JSON.parse(localStorage.getItem('friday_notes') || '[]');
        const updated = [newNote, ...existingNotes];
        localStorage.setItem('friday_notes', JSON.stringify(updated));

        this.callbacks.onNotesChanged?.(updated);

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'note',
            title: `Note Saved: "${title}"`,
            description: content.length > 50 ? `${content.slice(0, 50)}...` : content,
            timestamp: Date.now(),
          });
        }

        return {
          status: 'success',
          action: 'note_saved',
          title,
          content,
          message: `Saved note "${title}" to your scratchpad.`,
        };
      }

      case 'listNotes': {
        const notes: NoteItem[] = JSON.parse(localStorage.getItem('friday_notes') || '[]');
        return {
          status: 'success',
          count: notes.length,
          notes: notes.map((n) => ({ title: n.title, content: n.content })),
        };
      }

      case 'addTask': {
        const taskText = (args.task as string) || '';
        const priority = ((args.priority as string)?.toLowerCase() as any) || 'normal';

        const newTask: TaskItem = {
          id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          task: taskText,
          completed: false,
          priority: ['high', 'normal', 'low'].includes(priority) ? priority : 'normal',
          createdAt: Date.now(),
        };

        const existingTasks: TaskItem[] = JSON.parse(localStorage.getItem('friday_tasks') || '[]');
        const updated = [newTask, ...existingTasks];
        localStorage.setItem('friday_tasks', JSON.stringify(updated));

        this.callbacks.onTasksChanged?.(updated);

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'task',
            title: `Task Added: "${taskText}"`,
            description: `Priority: ${newTask.priority.toUpperCase()}`,
            timestamp: Date.now(),
          });
        }

        return {
          status: 'success',
          action: 'task_added',
          task: taskText,
          priority: newTask.priority,
        };
      }

      case 'getTasks': {
        const tasks: TaskItem[] = JSON.parse(localStorage.getItem('friday_tasks') || '[]');
        return {
          status: 'success',
          count: tasks.length,
          tasks: tasks.map((t) => ({ task: t.task, completed: t.completed, priority: t.priority })),
        };
      }

      case 'completeTask': {
        const query = ((args.taskQuery as string) || '').toLowerCase();
        const existingTasks: TaskItem[] = JSON.parse(localStorage.getItem('friday_tasks') || '[]');
        let matched = false;

        const updated = existingTasks.map((t) => {
          if (!matched && t.task.toLowerCase().includes(query)) {
            matched = true;
            return { ...t, completed: true };
          }
          return t;
        });

        localStorage.setItem('friday_tasks', JSON.stringify(updated));
        this.callbacks.onTasksChanged?.(updated);

        return {
          status: matched ? 'success' : 'not_found',
          action: 'task_completed',
          query,
        };
      }

      case 'searchWeb': {
        const query = (args.query as string) || '';
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

        if (this.callbacks.onOpenMediaViewport) {
          this.callbacks.onOpenMediaViewport({
            isOpen: true,
            title: `Search: "${query}"`,
            query,
            embedUrl: searchUrl,
            externalUrl: searchUrl,
            type: 'web',
          });
        }

        try {
          window.open(searchUrl, '_blank', 'noopener,noreferrer');
        } catch {}

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'website',
            title: `Search: "${query}"`,
            description: 'Google Web Search Results',
            url: searchUrl,
            actionLabel: 'View Results',
            timestamp: Date.now(),
          });
        }

        return {
          status: 'success',
          action: 'web_search',
          query,
          url: searchUrl,
        };
      }

      case 'setCountdownTimer': {
        const seconds = Math.max(1, Math.round(Number(args.seconds) || 60));
        const label = (args.label as string) || 'Timer';

        if (this.callbacks.onSetTimer) {
          this.callbacks.onSetTimer(seconds, label);
        }

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'timer',
            title: `Timer Initiated (${seconds}s)`,
            description: `${label} timer activated in HUD`,
            timestamp: Date.now(),
          });
        }

        return {
          status: 'success',
          action: 'timer_started',
          seconds,
          label,
        };
      }

      case 'setThemeAccent': {
        const accent = (args.accent as string)?.toLowerCase() as ThemeAccent;
        const validAccents: ThemeAccent[] = ['cyan', 'amber', 'emerald', 'violet', 'rose'];
        const chosen = validAccents.includes(accent) ? accent : 'cyan';

        if (this.callbacks.onSetTheme) {
          this.callbacks.onSetTheme(chosen);
        }

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'theme',
            title: `Theme Recalibrated: ${chosen.toUpperCase()}`,
            description: `JARVIS HUD accent shifted to ${chosen}`,
            timestamp: Date.now(),
          });
        }

        return {
          status: 'success',
          accent: chosen,
        };
      }

      case 'reportEmotionalTone': {
        const tone = ((args.tone as string) || 'neutral').toLowerCase();
        const valence = typeof args.valence === 'number' ? args.valence : undefined;
        const arousal = typeof args.arousal === 'number' ? args.arousal : undefined;
        const rationale = (args.rationale as string) || '';

        if (this.callbacks.onEmotionalToneChanged) {
          this.callbacks.onEmotionalToneChanged(tone, valence, arousal, rationale);
        }

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'info',
            title: `Emotional Resonance: ${tone.toUpperCase()}`,
            description: rationale || `Arc reactor pulse and glow adapted to ${tone} tone`,
            timestamp: Date.now(),
          });
        }

        return {
          status: 'success',
          tone,
          valence,
          arousal,
          message: `Arc reactor emotional metadata calibrated to ${tone.toUpperCase()}`,
        };
      }

      case 'storeMemory': {
        const category = (args.category as any) || 'fact';
        const key = (args.key as string) || 'User Note';
        const content = (args.content as string) || '';
        const importance = (args.importance as any) || 'normal';

        const memory = globalMemoryManager.storeMemory(category, key, content, importance);
        SoundEffects.playMemoryStored();

        if (this.callbacks.onMemoriesChanged) {
          this.callbacks.onMemoriesChanged(globalMemoryManager.getMemories());
        }

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'note',
            title: `Permanent Memory Engraved: "${key}"`,
            description: `[${category.toUpperCase()}] ${content}`,
            actionLabel: 'View Memory Bank',
            timestamp: Date.now(),
          });
        }

        return {
          status: 'success',
          action: 'memory_saved',
          memoryId: memory.id,
          key,
          category,
          message: `Permanently engraved in long-term memory archive.`,
        };
      }

      case 'recallMemory': {
        const query = (args.query as string) || '';
        const category = (args.category as string) || undefined;
        const matches = globalMemoryManager.searchMemories(query, category);

        return {
          status: 'success',
          action: 'memories_recalled',
          query,
          matchCount: matches.length,
          memories: matches.map((m) => ({
            id: m.id,
            key: m.key,
            category: m.category,
            content: m.content,
            importance: m.importance,
          })),
        };
      }

      case 'listMemories': {
        const category = (args.category as string) || undefined;
        const all = globalMemoryManager.getMemories();
        const filtered = category && category !== 'all' ? all.filter((m) => m.category === category) : all;

        return {
          status: 'success',
          totalCount: filtered.length,
          memories: filtered.map((m) => ({
            id: m.id,
            key: m.key,
            category: m.category,
            content: m.content,
          })),
        };
      }

      case 'forgetMemory': {
        const key = (args.key as string) || '';
        const all = globalMemoryManager.getMemories();
        const matched = all.find((m) => m.key.toLowerCase().includes(key.toLowerCase()) || m.id === key);

        if (matched) {
          globalMemoryManager.deleteMemory(matched.id);
          if (this.callbacks.onMemoriesChanged) {
            this.callbacks.onMemoriesChanged(globalMemoryManager.getMemories());
          }
          return {
            status: 'success',
            action: 'memory_forgotten',
            forgottenKey: matched.key,
            message: `Memory "${matched.key}" has been purged from long-term memory banks.`,
          };
        }

        return {
          status: 'not_found',
          message: `No long-term memory found matching "${key}".`,
        };
      }

      case 'verifyCommander': {
        // REAL voice-biometric result: AudioStreamer ke aakhri live check se.
        // Koi fresh sample nahi to honestly batao (fake "verified" kabhi nahi).
        const profile = globalAuthManager.getProfile();
        const check = this.voiceCheckProvider?.() || null;
        const fresh = check && Date.now() - check.at < 15000;

        if (fresh && check.authorized) {
          SoundEffects.playAccessGranted();
          if (this.callbacks.onActionCard) {
            this.callbacks.onActionCard({
              id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'info',
              title: `Voiceprint Verified: ${profile.commanderName}`,
              description: `${profile.clearanceLevel} // Live biometric match ${(check.confidence * 100).toFixed(0)}%`,
              timestamp: Date.now(),
            });
          }
          return {
            status: 'verified',
            commander: profile.commanderName,
            callSign: profile.callSign,
            clearance: profile.clearanceLevel,
            enforceCommanderOnly: profile.enforceCommanderOnly,
            confidence: Number(check.confidence.toFixed(3)),
            message: `Live voiceprint confirmed for Commander ${profile.commanderName}. Exclusive pilot clearance active.`,
          };
        }

        if (fresh && !check.authorized) {
          try { SoundEffects.playAccessDenied(); } catch {}
          return {
            status: 'unauthorized',
            commander: profile.commanderName,
            confidence: Number(check.confidence.toFixed(3)),
            message: `Access Denied. Live voice does not match Commander ${profile.commanderName}'s enrolled voiceprint. JARVIS core protocols are locked exclusively to the Commander under Level 5 Security clearance.`,
          };
        }

        return {
          status: 'unknown',
          commander: profile.commanderName,
          callSign: profile.callSign,
          clearance: profile.clearanceLevel,
          enforceCommanderOnly: profile.enforceCommanderOnly,
          message: `No fresh voice sample available right now, so I cannot biometrically confirm the speaker. Commander ${profile.commanderName} remains the only authorized pilot; please speak so I can verify your voiceprint.`,
        };
      }

      case 'getStudyCurriculum': {
        const curr = globalCurriculumManager.getCurriculum();
        SoundEffects.playCurriculumUpdated();

        return {
          status: 'success',
          action: 'curriculum_retrieved',
          subject: curr.subject,
          level: curr.level,
          currentTopic: curr.currentTopic,
          currentStep: curr.currentStep,
          totalSteps: curr.totalSteps,
          leftOffTopic: curr.leftOffTopic,
          nextSessionPlan: curr.nextSessionPlan,
          completedConcepts: curr.completedConcepts,
          keyTakeaways: curr.keyTakeaways,
          practiceChallenge: curr.practiceChallenge,
          streakDays: curr.streakDays,
          message: `Study progress loaded. Active topic: "${curr.currentTopic}". Left off at: "${curr.leftOffTopic}". Tomorrow's plan: "${curr.nextSessionPlan}".`,
        };
      }

      case 'updateStudyCurriculum': {
        const updates: any = {};
        if (args.subject) updates.subject = args.subject;
        if (args.level) updates.level = args.level;
        if (args.currentTopic) updates.currentTopic = args.currentTopic;
        if (typeof args.currentStep === 'number') updates.currentStep = args.currentStep;
        if (typeof args.totalSteps === 'number') updates.totalSteps = args.totalSteps;
        if (args.leftOffTopic) updates.leftOffTopic = args.leftOffTopic;
        if (args.nextSessionPlan) updates.nextSessionPlan = args.nextSessionPlan;
        if (args.practiceChallenge) updates.practiceChallenge = args.practiceChallenge;

        const updated = globalCurriculumManager.updateCurriculum(updates);
        SoundEffects.playCurriculumUpdated();

        if (this.callbacks.onCurriculumChanged) {
          this.callbacks.onCurriculumChanged(updated);
        }

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'info',
            title: `Study Progress Logged: "${updated.subject}"`,
            description: `Left off at: "${updated.leftOffTopic}" // Tomorrow: "${updated.nextSessionPlan}"`,
            actionLabel: 'Open Study Matrix',
            timestamp: Date.now(),
          });
        }

        return {
          status: 'success',
          action: 'curriculum_updated',
          subject: updated.subject,
          leftOffTopic: updated.leftOffTopic,
          nextSessionPlan: updated.nextSessionPlan,
          currentStep: updated.currentStep,
          message: `Curriculum updated. Tomorrow we will resume right from: "${updated.nextSessionPlan}".`,
        };
      }

      case 'advanceStudyStep': {
        const completedConcept = (args.completedConcept as string) || 'Current Concept';
        const nextTopic = (args.nextTopic as string) || undefined;
        const takeawayNote = (args.takeawayNote as string) || undefined;

        const updated = globalCurriculumManager.advanceStep(completedConcept, nextTopic, takeawayNote);
        SoundEffects.playLessonStepAdvance();

        if (this.callbacks.onCurriculumChanged) {
          this.callbacks.onCurriculumChanged(updated);
        }

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'info',
            title: `Concept Mastered: "${completedConcept}"`,
            description: `Advanced to Step ${updated.currentStep}/${updated.totalSteps}: "${updated.currentTopic}"`,
            actionLabel: 'View Syllabus',
            timestamp: Date.now(),
          });
        }

        return {
          status: 'success',
          action: 'step_advanced',
          masteredConcept: completedConcept,
          newCurrentStep: updated.currentStep,
          newTopic: updated.currentTopic,
          leftOffTopic: updated.leftOffTopic,
          message: `Congratulations Commander! Mastered "${completedConcept}". Advanced to Step ${updated.currentStep}: "${updated.currentTopic}".`,
        };
      }

      case 'recordStudyNote': {
        const note = (args.note as string) || '';
        globalCurriculumManager.recordTakeaway(note);
        SoundEffects.playMemoryStored();

        if (this.callbacks.onCurriculumChanged) {
          this.callbacks.onCurriculumChanged(globalCurriculumManager.getCurriculum());
        }

        return {
          status: 'success',
          action: 'study_note_recorded',
          note,
          message: `Key takeaway recorded in student study notebook: "${note}".`,
        };
      }

      case 'openCodeWorkbench': {
        const code = (args.code as string) || undefined;
        const language = (args.language as string) || 'javascript';
        SoundEffects.playSubtleBeep();
        this.callbacks.onOpenWorkbench?.(code, language);
        globalTranscriptManager.addEntry('tool', `Opened Stark Holographic Workbench${code ? ' with provided code snippet' : ''}.`, 'openCodeWorkbench');

        return {
          status: 'success',
          action: 'code_workbench_opened',
          message: 'Stark Holographic Workbench and Circuit Simulator opened on HUD.',
        };
      }

      case 'triggerProtocol': {
        const rawProto = (args.protocolId as string) || 'morning_briefing';
        const protoId = rawProto as ProtocolId;
        this.callbacks.onTriggerProtocol?.(protoId);
        globalTranscriptManager.addEntry('tool', `Initiated tactical protocol: ${protoId}`, 'triggerProtocol');

        return {
          status: 'success',
          action: 'protocol_triggered',
          protocolId: protoId,
          message: `Initiated autonomous Stark protocol: ${protoId}.`,
        };
      }

      case 'openKnowledgeGraph': {
        SoundEffects.playSubtleBeep();
        this.callbacks.onOpenKnowledgeGraph?.();
        globalTranscriptManager.addEntry('tool', 'Opened D3.js Neural Memory & Concept Knowledge Graph.', 'openKnowledgeGraph');

        return {
          status: 'success',
          action: 'knowledge_graph_opened',
          message: 'Neural Memory & Concept Knowledge Graph displayed on HUD.',
        };
      }

      case 'openSessionDebrief': {
        SoundEffects.playSubtleBeep();
        this.callbacks.onOpenDebrief?.();
        globalTranscriptManager.addEntry('tool', 'Opened Mission Debrief & Audio Transcript Log.', 'openSessionDebrief');

        return {
          status: 'success',
          action: 'session_debrief_opened',
          message: 'Mission Debrief & Audio Transcript Exporter opened on HUD.',
        };
      }

      case 'calculateMath': {
        const rawExpr = (args.expression as string) || '';
        let evalResult = 'Syntax Error';
        try {
          let clean = rawExpr
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/π/g, 'Math.PI')
            .replace(/sqrt\(/g, 'Math.sqrt(')
            .replace(/sin\(/g, 'Math.sin(')
            .replace(/cos\(/g, 'Math.cos(')
            .replace(/tan\(/g, 'Math.tan(')
            .replace(/log\(/g, 'Math.log10(')
            .replace(/ln\(/g, 'Math.log(')
            .replace(/\^/g, '**');

          // Handle percentage e.g. "15% of 8500" -> "(15/100) * 8500"
          const percentMatch = clean.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of)?\s*(\d+(?:\.\d+)?)/i);
          if (percentMatch) {
            const p = parseFloat(percentMatch[1]);
            const total = parseFloat(percentMatch[2]);
            evalResult = ((p / 100) * total).toString();
          } else if (
            // Strict math-only allowlist: blocks code injection from model input.
            // Allows digits, whitespace, +-*/%().**, commas, and Math.PI/sqrt/sin/cos/tan/log10/log.
            /[^0-9+\-*/%().,\s*]/.test(clean.replace(/Math\.(PI|sqrt|sin|cos|tan|log10|log)/g, '')) ||
            /(constructor|prototype|__proto__|function|=>|import|require|process|globalThis|window|document|fetch|XMLHttpRequest|eval|Function|setTimeout|setInterval|while|for|class|new)/i.test(clean)
          ) {
            evalResult = 'Syntax Error';
          } else {
            // eslint-disable-next-line no-new-func
            const res = Function(`"use strict"; return (${clean});`)();
            if (typeof res === 'number' && !isNaN(res)) {
              evalResult = Number.isInteger(res) ? res.toString() : parseFloat(res.toFixed(6)).toString();
            }
          }
        } catch {
          evalResult = 'Syntax Error';
        }

        SoundEffects.playSubtleBeep();
        this.callbacks.onOpenCalculator?.(rawExpr);

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'calc',
            title: `Mathematical Solution: ${evalResult}`,
            description: `${rawExpr} = ${evalResult}`,
            timestamp: Date.now(),
          });
        }

        return {
          status: 'success',
          action: 'math_calculated',
          expression: rawExpr,
          result: evalResult,
          message: `Expression "${rawExpr}" evaluated to: ${evalResult}. Calculator displayed on HUD.`,
        };
      }

      case 'openCalculator': {
        const expression = (args.expression as string) || '';
        SoundEffects.playSubtleBeep();
        this.callbacks.onOpenCalculator?.(expression);
        globalTranscriptManager.addEntry('tool', 'Opened Stark Holographic Calculator.', 'openCalculator');

        return {
          status: 'success',
          action: 'calculator_opened',
          expression,
          message: 'Stark Holographic Calculator opened on HUD.',
        };
      }

      case 'openPrivateVault': {
        SoundEffects.playSubtleBeep();
        this.callbacks.onOpenPrivateVault?.();
        const unlocked = globalPrivateVault.isUnlocked();
        globalTranscriptManager.addEntry(
          'tool',
          `Opened Classified Private Vault (${unlocked ? 'Unlocked' : 'Requires PIN'}).`,
          'openPrivateVault'
        );

        return {
          status: 'success',
          action: 'private_vault_opened',
          isUnlocked: unlocked,
          message: unlocked
            ? 'Classified Private Vault opened. Clearance Level 5 verified.'
            : 'Classified Private Vault opened on HUD. Commander PIN is required to decrypt contents.',
        };
      }

      case 'lockPrivateVault': {
        SoundEffects.playSubtleBeep();
        globalPrivateVault.lock();
        globalTranscriptManager.addEntry('tool', 'Locked Classified Private Vault.', 'lockPrivateVault');

        return {
          status: 'success',
          action: 'private_vault_locked',
          message: 'Classified Private Vault successfully locked and encrypted. Zero-knowledge isolation active.',
        };
      }

      case 'searchPrivateVault': {
        const query = (args.query as string) || '';
        const files = globalPrivateVault.searchFiles(query);
        const unlocked = globalPrivateVault.isUnlocked();

        return {
          status: 'success',
          action: 'private_vault_searched',
          query,
          isUnlocked: unlocked,
          matchCount: files.length,
          files: files.map((f) => ({
            name: f.name,
            classification: f.classification,
            category: f.category,
            contentSnippet: unlocked ? f.content.slice(0, 200) : '[ENCRYPTED - UNLOCK VAULT TO VIEW]',
          })),
          message: unlocked
            ? `Found ${files.length} private file(s) matching "${query}".`
            : `Vault is currently locked. Found ${files.length} confidential file(s) matching "${query}", but Commander must unlock the vault on the HUD to decrypt content.`,
        };
      }

      case 'explainPrivateFile': {
        const fileName = (args.fileName as string) || '';
        const file = globalPrivateVault.getFile(fileName);

        if (!file) {
          return {
            status: 'file_not_found',
            searchedName: fileName,
            message: `Private file "${fileName}" was not found in the Classified Vault.`,
          };
        }

        const isUnlocked = globalPrivateVault.isUnlocked();
        if (!isUnlocked) {
          this.callbacks.onOpenPrivateVault?.();
          return {
            status: 'vault_locked',
            fileName: file.name,
            message: `Private file "${file.name}" is locked under Level 5 encryption. Commander, please enter your PIN on the Private Vault HUD to authorize decryption.`,
          };
        }

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'file',
            title: `Explaining Classified File: ${file.name}`,
            description: `Classification: ${file.classification} • ${(file.size / 1024).toFixed(1)} KB`,
            timestamp: Date.now(),
            data: file,
          });
        }

        return {
          status: 'success',
          action: 'private_file_read',
          fileName: file.name,
          classification: file.classification,
          content: file.content,
          message: `Successfully decrypted and inspected "${file.name}". You may now explain its contents to Commander Enayet.`,
        };
      }

      case 'getRoutineAndPreferences': {
        const digest = globalRoutinePreferenceManager.getDigestForPrompt();
        const routines = globalRoutinePreferenceManager.getRoutines();
        const prefs = globalRoutinePreferenceManager.getPreferences();

        return {
          status: 'success',
          action: 'routine_and_prefs_retrieved',
          routinesCount: routines.length,
          preferencesCount: prefs.length,
          digest,
          likes: prefs.filter((p) => p.type === 'like').map((p) => p.title),
          dislikes: prefs.filter((p) => p.type === 'dislike').map((p) => p.title),
          message: `Retrieved Commander's daily routine and preference matrix.`,
        };
      }

      case 'savePreference': {
        const type = (args.type as any) || 'like';
        const title = (args.title as string) || 'Preference';
        const description = (args.description as string) || '';
        const category = (args.category as any) || 'lifestyle';
        const intensity = (args.intensity as any) || 'favorite';

        const pref = globalRoutinePreferenceManager.addPreference(
          type,
          title,
          description,
          category,
          intensity
        );
        SoundEffects.playCurriculumUpdated();

        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'note',
            title: `${type === 'like' ? 'Pasand (Like)' : 'Napasand (Dislike)'} Recorded: ${title}`,
            description,
            timestamp: Date.now(),
          });
        }

        return {
          status: 'success',
          action: 'preference_saved',
          preference: pref,
          message: `Recorded ${type === 'like' ? 'Pasand (Like)' : 'Napasand (Dislike)'}: "${title}" in Commander's behavioral profile.`,
        };
      }

      case 'openRoutinePreferences': {
        SoundEffects.playSubtleBeep();
        this.callbacks.onOpenRoutinePreferences?.();
        globalTranscriptManager.addEntry('tool', 'Opened Commander Routine & Preferences Matrix.', 'openRoutinePreferences');

        return {
          status: 'success',
          action: 'routine_preferences_opened',
          message: 'Commander Routine & Preferences Matrix (दिनचर्या & पसंद/नापसंद) opened on HUD.',
        };
      }

      case 'openDesktopBridge': {
        SoundEffects.playSubtleBeep();
        this.callbacks.onOpenDesktopBridge?.();
        globalTranscriptManager.addEntry('tool', 'Opened PC Voice Control & Desktop Companion Bridge.', 'openDesktopBridge');

        return {
          status: 'success',
          action: 'desktop_bridge_opened',
          message: 'PC Voice Control & Native Desktop Bridge modal displayed on HUD.',
        };
      }

      case 'getBatteryStatus': {
        try {
          const nav = navigator as any;
          if (nav.getBattery) {
            const battery = await nav.getBattery();
            const level = Math.round(battery.level * 100);
            return {
              status: 'success',
              level,
              charging: battery.charging,
            };
          }
          return { status: 'error', message: 'Battery API not supported on this device' };
        } catch {
          return { status: 'error', message: 'Failed to read battery status' };
        }
      }

      case 'toggleSurveillanceMode': {
        const active = !!args.active;
        this.callbacks.onSurveillanceMode?.(active);
        return { status: 'success', active };
      }

      case 'controlSmartDevice': {
        const device = (args.device as string) || 'unknown';
        const action = (args.action as string) || 'toggle';
        
        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `iot-${Date.now()}`,
            type: 'info',
            title: `Smart Home / IoT: ${device.toUpperCase()}`,
            description: `Executed action: ${action.toUpperCase()}`,
            timestamp: Date.now(),
          });
        }
        return { status: 'success', device, action };
      }

      case 'sendToPhone': {
        // REAL delivery: paired device ke relay inbox me jaata hai.
        // Paired device nahi to honestly error (fake delivered:true kabhi nahi).
        const payload = (args.payload as string) || '';
        if (!payload.trim()) {
          return { status: 'error', message: 'Khali message nahi bhej sakta. Kya bhejna hai, wo batao.' };
        }
        try {
          const id = await globalDeviceLink.send(payload.trim());
          if (this.callbacks.onActionCard) {
            this.callbacks.onActionCard({
              id: `phone-${Date.now()}`,
              type: 'info',
              title: 'Pushed to Paired Device',
              description: payload,
              timestamp: Date.now(),
            });
          }
          return { status: 'success', delivered: true, id, message: 'Message paired device ke inbox me pahunch gaya hai.' };
        } catch (e: any) {
          return { status: 'error', message: e?.message || 'Koi paired device nahi hai. Pehle Device Link se phone pair karo.' };
        }
      }

      case 'scanFace': {
        // REAL face verification via face-api.js (100% local).
        // Koi enrolled face nahi / camera off / chehra na dikhe to honestly error.
        try {
          const video = this.cameraVideoProvider?.() || null;
          if (!video) {
            return { status: 'error', message: 'Camera is not active. Please turn on the camera first, then ask for a face scan.' };
          }
          if (!globalFaceAuthManager.isEnrolled()) {
            return { status: 'error', message: 'No owner face enrolled. Please enroll your face from Face Verification setup first.' };
          }
          const r = await globalFaceAuthManager.verifyFrame(video);
          if (!r.faceDetected) {
            return { status: 'error', message: 'No face visible in the camera frame. Please face the camera in good light.' };
          }
          const confidence = Math.max(0, Math.min(1, 1 - r.distance));
          if (this.callbacks.onActionCard) {
            this.callbacks.onActionCard({
              id: `face-${Date.now()}`,
              type: 'info',
              title: r.verified ? 'Face Verified: Owner Match' : 'Face Scan: No Match',
              description: r.verified
                ? `Biometric match confirmed (distance ${r.distance.toFixed(3)}).`
                : `Face detected but does not match the enrolled owner (distance ${r.distance.toFixed(3)}).`,
              timestamp: Date.now(),
            });
          }
          try {
            if (r.verified) SoundEffects.playAccessGranted();
            else SoundEffects.playAccessDenied();
          } catch {}
          return {
            status: r.verified ? 'success' : 'unauthorized',
            verified: r.verified,
            distance: Number(r.distance.toFixed(3)),
            confidence: Number(confidence.toFixed(3)),
          };
        } catch (e: any) {
          const code = (e as any)?.code;
          if (code === 'MODEL_LOAD_ERROR') {
            return { status: 'error', message: 'Face models load nahi ho paye. Face Verification setup dobara kholo.' };
          }
          if (code === 'MODEL_INFERENCE_ERROR') {
            return { status: 'error', message: 'Camera verification temporarily failed. Please try again.' };
          }
          if (code === 'FRAME_NOT_READY' || code === 'FACE_NOT_DETECTED') {
            return { status: 'error', message: 'No face visible in the camera frame. Please face the camera in good light.' };
          }
          return { status: 'error', message: e?.message || 'Face scan failed.' };
        }
      }

      case 'getRecentEmails': {
        if (!globalWorkspaceManager.getToken()) {
           return { status: 'error', message: 'Google Workspace not connected. User must link their account.' };
        }
        try {
          const emails = await globalWorkspaceManager.getRecentEmails(args.maxResults as number || 5);
          if (this.callbacks.onActionCard) {
            this.callbacks.onActionCard({
              id: `email-${Date.now()}`,
              type: 'info',
              title: `Gmail: Retrieved ${emails.length} Emails`,
              description: 'Emails synced successfully.',
              timestamp: Date.now(),
            });
          }
          return { status: 'success', emails };
        } catch (e: any) {
          return { status: 'error', message: e.message };
        }
      }

      case 'getUpcomingEvents': {
        if (!globalWorkspaceManager.getToken()) {
           return { status: 'error', message: 'Google Workspace not connected. User must link their account.' };
        }
        try {
          const events = await globalWorkspaceManager.getUpcomingEvents(args.maxResults as number || 5);
          if (this.callbacks.onActionCard) {
            this.callbacks.onActionCard({
              id: `cal-${Date.now()}`,
              type: 'info',
              title: `Calendar: Next Events`,
              description: 'Calendar synced successfully.',
              timestamp: Date.now(),
            });
          }
          return { status: 'success', events };
        } catch (e: any) {
          return { status: 'error', message: e.message };
        }
      }

      case 'createCalendarEvent': {
        if (!globalWorkspaceManager.getToken()) {
           return { status: 'error', message: 'Google Workspace not connected. User must link their account.' };
        }
        try {
          const event = await globalWorkspaceManager.createEvent(
            args.summary as string,
            (args.description as string) || '',
            args.startTime as string,
            args.endTime as string
          );
          if (this.callbacks.onActionCard) {
            this.callbacks.onActionCard({
              id: `cal-create-${Date.now()}`,
              type: 'info',
              title: `Calendar: Event Created`,
              description: args.summary as string,
              timestamp: Date.now(),
            });
          }
          return { status: 'success', event };
        } catch (e: any) {
          return { status: 'error', message: e.message };
        }
      }

      case 'createHologram': {
        const object = ((args.object as string) || '').trim();
        const quality = (args.quality as string) === 'low' ? 'low' : (args.quality as string) === 'high' ? 'high' : 'auto';
        if (!object) {
          return { status: 'error', message: 'No object specified. VoiceResponse: Sir, kis cheez ka hologram banau?' };
        }
        const { loadCatalog, searchCatalog } = await import('../hologram/registry');
        await loadCatalog().catch(() => []);
        const found = searchCatalog(object);
        if (found && 'ambiguous' in found) {
          return {
            status: 'needs_clarification',
            options: found.options,
            message: `Sir, kaunsa hologram dikhana hai — ${found.options.join(', ')}?`,
          };
        }
        if (found && 'unavailable' in found) {
          return {
            status: 'error',
            message: `Sir, ${found.entry.label} ka verified free REAL 3D model abhi library me available nahi hai. Koi aur model boliye, ya .glb/.gltf/.obj file import kar dijiye.`,
          };
        }
        if (found && 'approxConfirm' in found) {
          if (this.callbacks.onActionCard) {
            this.callbacks.onActionCard({
              id: `holo-approx-${Date.now()}`,
              type: 'info',
              title: `Approximation available: ${found.entry.label}`,
              description: 'Verified REAL model nahi hai. "Haan dikhao" for approximation, "cancel" to abort.',
              timestamp: Date.now(),
            });
          }
          return {
            status: 'needs_approx_confirmation',
            object,
            entryId: found.entry.id,
            label: found.entry.label,
            message: `Sir, iska verified REAL model nahi hai — sirf approximation available hai. Dikhau? Reply "haan dikhao" or "cancel".`,
          };
        }
        const match = (found && 'entry' in found ? found.entry : null) || matchObject(object);
        if (!match) {
          // Free routes exhausted (uploads, procedural). Paid route needs explicit confirmation — never auto-spend.
          const paid = paidProvider(await getProviders());
          if (!paid) {
            return {
              status: 'error',
              message: `No buildable model for "${object}". The offline library holds 127 models (say "open library" or browse ❖ BROWSE in the HUD) — or you can import a .glb/.gltf/.obj file.`,
            };
          }
          if (this.callbacks.onActionCard) {
            this.callbacks.onActionCard({
              id: `holo-paid-${Date.now()}`,
              type: 'info',
              title: `Paid generation needed: ${object}`,
              description: paid.estimated_cost
                ? `Estimated cost: ${paid.estimated_cost}. Reply "use paid generation" to confirm, or "low poly" / "free version" for the free route.`
                : 'This provider needs paid credits, but I cannot determine the exact cost. Reply "use paid generation" to confirm, or "low poly" / "free version" for the free route.',
              timestamp: Date.now(),
            });
          }
          return {
            status: 'needs_paid_confirmation',
            object,
            provider: paid.provider_name,
            estimated_cost: paid.estimated_cost,
            message: 'Free options exhausted. Ask the user to choose paid generation or the low-poly/free route. Do NOT proceed without explicit confirmation.',
          };
        }
        const holo: HologramState = {
          isOpen: true,
          object,
          entryId: match.id,
          label: match.label,
          category: match.category,
          kind: match.kind,
          isApproximation: match.isApproximation,
          note: match.description || (match.kind === 'procedural' && !match.url ? 'Resolving procedural geometry on-device.' : `Loading model file: ${match.url}`),
          status: match.kind === 'procedural' && !match.url ? 'resolving' : 'loading',
          modelUrl: match.url,
          format: match.format,
          progress: 0,
          quality,
        };
        try { this.callbacks.onOpenHologram?.(holo); } catch { /* UI-only */ }
        if (this.callbacks.onActionCard) {
          this.callbacks.onActionCard({
            id: `holo-${Date.now()}`,
            type: 'info',
            title: `Hologram: ${match.label}`,
            description: match.isApproximation ? 'Procedural approximation — opening viewer…' : 'Opening hologram viewer…',
            timestamp: Date.now(),
          });
        }
        // NOTE: final "ready" is reported by the viewer itself after real geometry loads.
        return { status: 'opening_viewer', entryId: match.id, label: match.label, isApproximation: match.isApproximation };
      }

      case 'confirmHologram': {
        const choice = ((args.choice as string) || '').toLowerCase();
        const cObject = ((args.object as string) || '').trim();
        if (choice === 'cancel' || choice === 'no' || choice === 'free' || choice === 'dont_spend') {
          return { status: 'cancelled', message: 'Cancelled, Sir. Koi kharcha nahi, koi model nahi khola.' };
        }
        if (choice === 'approx' || choice === 'yes_show' || choice === 'haan') {
          const { loadCatalog: lcA, searchCatalog: scA } = await import('../hologram/registry');
          await lcA().catch(() => []);
          const h = scA(cObject);
          const m = (h && ('entry' in h || 'approxConfirm' in h) ? (h as { entry: HologramEntry }).entry : null) || matchObject(cObject);
          if (!m || !m.url) return { status: 'error', message: `Sir, "${cObject}" ke liye approximation bhi available nahi hai.` };
          try {
            this.callbacks.onOpenHologram?.({
              isOpen: true, object: cObject, entryId: m.id, label: m.label, category: m.category,
              kind: m.kind, isApproximation: true,
              note: `Approximation (user-confirmed). ${m.description || ''}`.trim(),
              status: 'loading', modelUrl: m.url, format: m.format, progress: 0,
            });
          } catch { /* UI-only */ }
          return { status: 'opening_viewer', entryId: m.id, approximation: true };
        }
        if (choice === 'lowpoly' || choice === 'low_poly' || choice === 'cheap') {
          const m = cObject ? matchObject(cObject) : null;
          if (m && m.kind === 'procedural') {
            try {
              this.callbacks.onOpenHologram?.({
                isOpen: true, object: cObject, entryId: m.id, label: `${m.label} (low-poly)`,
                category: m.category, kind: 'procedural', isApproximation: true,
                note: 'Low-poly procedural build — free route.', status: 'resolving', progress: 0, quality: 'low',
              });
            } catch { /* UI-only */ }
            return { status: 'opening_viewer', entryId: m.id, quality: 'low' };
          }
          return { status: 'error', message: `No low-poly option for "${cObject}". Import a .glb/.gltf/.obj file, or pick a buildable shape.` };
        }
        if (choice === 'paid' || choice === 'yes' || choice === 'confirm') {
          if (!cObject) return { status: 'error', message: 'No object to generate.' };
          const r = await requestPaidGeneration(cObject, 'high');
          if (!r.ok) return { status: 'error', message: r.error };
          const fmt = ['glb', 'gltf', 'obj'].includes((r.type || '').toLowerCase()) ? (r.type.toLowerCase() as 'glb' | 'gltf' | 'obj') : null;
          if (!fmt) return { status: 'error', message: `Provider returned unsupported format "${r.type}". Model rejected.` };
          try {
            this.callbacks.onOpenHologram?.({
              isOpen: true, object: cObject, entryId: `paid-${Date.now()}`, label: cObject,
              category: 'general', kind: 'external', isApproximation: false,
              note: `Paid generation via ${r.provider}.`, status: 'loading',
              modelUrl: r.url, format: fmt, progress: 0, quality: 'high',
            });
          } catch { /* UI-only */ }
          return { status: 'opening_viewer', provider: r.provider };
        }
        return { status: 'error', message: `Say "use paid generation", "low poly", or "cancel".` };
      }

      case 'controlHologram': {
        const action = (args.action as HologramControlAction) || 'reset';
        const valid: HologramControlAction[] = ['rotate_left', 'rotate_right', 'rotate_deg', 'zoom_in', 'zoom_out', 'move_up', 'move_down', 'move_left', 'move_right', 'reset', 'spin_start', 'spin_stop', 'bigger', 'smaller', 'hide', 'close', 'view_holo', 'view_solid', 'view_wire', 'view_xray', 'labels_show', 'labels_hide', 'anim_play', 'anim_pause', 'anim_restart', 'quality_low', 'quality_med', 'quality_high', 'sync_on', 'sync_off'];
        if (!valid.includes(action)) {
          return { status: 'error', message: `Unknown hologram action "${action}".` };
        }
        try { this.callbacks.onControlHologram?.(action, args.degrees as number | undefined); } catch { /* UI-only */ }
        return { status: 'dispatched', action };
      }

      case 'openHologramLibrary': {
        try { this.callbacks.onOpenHologramLibrary?.(); } catch { /* UI-only */ }
        return { status: 'opening_library', message: 'Hologram library browser opening in HUD.' };
      }

      case 'compareHolograms': {
        const aName = ((args.a as string) || '').trim();
        const bName = ((args.b as string) || '').trim();
        if (!aName || !bName) {
          return { status: 'error', message: 'Compare needs two model names. VoiceResponse: Sir, kin do models ko compare karu?' };
        }
        const { loadCatalog: lc2, searchCatalog: sc2 } = await import('../hologram/registry');
        await lc2().catch(() => []);
        const ha = sc2(aName);
        const hb = sc2(bName);
        const ea = (ha && 'entry' in ha ? ha.entry : null) || matchObject(aName);
        const eb = (hb && 'entry' in hb ? hb.entry : null) || matchObject(bName);
        if (!ea || !eb) {
          return { status: 'error', message: `Sir, ${!ea ? `"${aName}"` : `"${bName}"`} library me available nahi hai.` };
        }
        const mk = (m: typeof ea, raw: string): HologramState => ({
          isOpen: true, object: raw, entryId: m.id, label: m.label, category: m.category,
          kind: m.kind, isApproximation: m.isApproximation,
          note: m.description || 'Compare mode — synchronized rotation on.',
          status: m.kind === 'procedural' && !m.url ? 'resolving' : 'loading',
          modelUrl: m.url, format: m.format, progress: 0,
        });
        try { this.callbacks.onCompareHolograms?.(mk(ea, aName), mk(eb, bName)); } catch { /* UI-only */ }
        return { status: 'opening_compare', a: ea.label, b: eb.label };
      }

      default:
        return {
          status: 'unsupported_tool',
          name: call.name,
        };

    }
  }
}
