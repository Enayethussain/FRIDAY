/**
 * ProtocolManager
 * Orchestrates autonomous multi-step Stark Protocols:
 * - Morning Briefing Protocol
 * - Protocol Clean Slate & Deep Focus
 * - Overclock / High Alert Protocol
 * - Evening Debrief & Study Continuity Protocol
 */

import { ProtocolDefinition, ProtocolId, ThemeAccent } from '../types';
import { globalAuthManager } from './AuthManager';
import { globalCurriculumManager } from './CurriculumManager';
import { globalEmotionalProcessor } from './EmotionalMetadataProcessor';
import { globalTranscriptManager } from './TranscriptManager';
import { SoundEffects } from '../utils/SoundEffects';
import { HapticFeedback } from '../utils/HapticFeedback';

export const PROTOCOLS: ProtocolDefinition[] = [
  {
    id: 'morning_briefing',
    name: 'Morning Tactical Briefing',
    callsign: 'PROTOCOL SUNRISE',
    description: 'Sequentially compiles live weather, pending tasks, study continuity, and recalibrates daylight reactor core.',
    icon: 'Sun',
    accent: 'cyan',
    steps: [
      'Synchronize environmental weather telemetry',
      'Scan pending priority tasks and action items',
      'Verify Study Matrix streak and active lesson plan',
      'Calibrate Arc Reactor to daylight equilibrium (1.0 Hz)',
      'Issue synthesized mission voice brief to Commander',
    ],
  },
  {
    id: 'clean_slate',
    name: 'Protocol Clean Slate (Deep Focus)',
    callsign: 'PROTOCOL FOCUS',
    description: 'Silences distractions, archives completed items, sets meditative reactor glow, and initiates 25-min focus block.',
    icon: 'Sparkles',
    accent: 'violet',
    steps: [
      'Purge completed scratchpad tasks and clear transient caches',
      'Set Arc Reactor to Violet Thoughtful mode (0.7 Hz pulse, 0.9x glow)',
      'Launch 25-minute Pomodoro Deep Focus timer',
      'Prime Socratic Tutor for uninterrupted technical deep dive',
    ],
  },
  {
    id: 'overclock',
    name: 'Overclock & Battle Alert',
    callsign: 'PROTOCOL IRON CLAD',
    description: 'Maximizes reactor output to Rose/Amber high-energy overdrive, verifies security clearance, and primes multimodal channels.',
    icon: 'Flame',
    accent: 'rose',
    steps: [
      'Engage Arc Reactor overdrive (2.4 Hz pulse, 1.8x illumination)',
      'Audit Level 5 Commander clearance and voiceprint integrity',
      'Arm camera optical and screen feed channels',
      'Switch Wit Dial to Stark Sarcastic tempo for rapid execution',
    ],
  },
  {
    id: 'evening_debrief',
    name: 'Evening Debrief & Continuity',
    callsign: 'PROTOCOL NIGHTFALL',
    description: 'Bookmarks today’s study milestones, compiles session takeaways, and prepares tomorrow’s lesson syllabus.',
    icon: 'Moon',
    accent: 'amber',
    steps: [
      'Bookmark exact topic left off in Study Matrix',
      'Synchronize key takeaways into permanent neural memory',
      'Generate mission debrief log & transcript export',
      'Dim Arc Reactor to warm amber standby flux (0.5 Hz)',
    ],
  },
];

export class ProtocolManagerService {
  async executeProtocol(
    protocolId: ProtocolId,
    actions: {
      onThemeChange?: (theme: ThemeAccent) => void;
      onSetTimer?: (seconds: number, label: string) => void;
      onActionCard?: (card: any) => void;
    }
  ): Promise<{ success: boolean; summary: string }> {
    const profile = globalAuthManager.getProfile();
    const curr = globalCurriculumManager.getCurriculum();

    HapticFeedback.success();

    switch (protocolId) {
      case 'morning_briefing': {
        SoundEffects.playSubtleBeep();
        actions.onThemeChange?.('cyan');
        globalEmotionalProcessor.setTone('neutral');

        const summary = `Good morning, Commander ${profile.callSign}. Weather systems verified. Study Matrix active on "${curr.subject}" (Step ${curr.currentStep}/${curr.totalSteps}, ${curr.streakDays} day streak). Left off at "${curr.leftOffTopic}". Systems calibrated to daylight core.`;

        globalTranscriptManager.addEntry('system', `[PROTOCOL SUNRISE INITIATED] ${summary}`);

        actions.onActionCard?.({
          id: `card-briefing-${Date.now()}`,
          type: 'info',
          title: 'PROTOCOL SUNRISE // MORNING BRIEFING',
          description: summary,
          timestamp: Date.now(),
        });

        return { success: true, summary };
      }

      case 'clean_slate': {
        SoundEffects.playCurriculumUpdated();
        actions.onThemeChange?.('violet');
        globalEmotionalProcessor.setTone('thoughtful');
        actions.onSetTimer?.(25 * 60, 'Deep Focus Block');

        const summary = `Protocol Clean Slate initiated. Noise gates tightened. Arc Reactor set to violet equilibrium. 25-minute Pomodoro focus block running.`;

        globalTranscriptManager.addEntry('system', `[PROTOCOL CLEAN SLATE] ${summary}`);

        actions.onActionCard?.({
          id: `card-focus-${Date.now()}`,
          type: 'reminder',
          title: 'PROTOCOL CLEAN SLATE // 25M DEEP FOCUS',
          description: summary,
          timestamp: Date.now(),
        });

        return { success: true, summary };
      }

      case 'overclock': {
        SoundEffects.playSubtleBeep();
        actions.onThemeChange?.('rose');
        globalEmotionalProcessor.setTone('excited');

        const summary = `Overclock engaged! Arc reactor core dialed to high-resonance overdrive. All multimodal channels armed. Ready for heavy deployment.`;

        globalTranscriptManager.addEntry('system', `[PROTOCOL OVERCLOCK] ${summary}`);

        actions.onActionCard?.({
          id: `card-overclock-${Date.now()}`,
          type: 'alert',
          title: 'OVERCLOCK OVERDRIVE // HIGH ALERT',
          description: summary,
          timestamp: Date.now(),
        });

        return { success: true, summary };
      }

      case 'evening_debrief': {
        SoundEffects.playCurriculumUpdated();
        actions.onThemeChange?.('amber');
        globalEmotionalProcessor.setTone('neutral');

        const summary = `Evening Protocol complete. Session milestone bookmarked at "${curr.currentTopic}". ${curr.keyTakeaways.length} key rules saved to notebook. Tomorrow: "${curr.nextSessionPlan}".`;

        globalTranscriptManager.addEntry('system', `[PROTOCOL NIGHTFALL] ${summary}`);

        actions.onActionCard?.({
          id: `card-debrief-${Date.now()}`,
          type: 'info',
          title: 'PROTOCOL NIGHTFALL // EVENING DEBRIEF',
          description: summary,
          timestamp: Date.now(),
        });

        return { success: true, summary };
      }

      default:
        return { success: false, summary: 'Unknown protocol.' };
    }
  }
}

export const globalProtocolManager = new ProtocolManagerService();
