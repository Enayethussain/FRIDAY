/**
 * TranscriptManager
 * Records real-time conversational exchanges, tool invocations, and mission events.
 * Provides export capabilities to Markdown (.md), JSON (.json), and Printable formats.
 */

import { TranscriptEntry, TranscriptSender, SessionDebriefStats } from '../types';
import { globalAuthManager } from './AuthManager';
import { globalCurriculumManager } from './CurriculumManager';

class TranscriptManagerService {
  private entries: TranscriptEntry[] = [];
  private sessionStartTime: number = Date.now();
  private listeners: ((entries: TranscriptEntry[]) => void)[] = [];

  constructor() {
    // Initial system entry
    this.addEntry('system', 'Neural Link initialized. FRIDAY Voice & Multimodal HUD Online.');
  }

  addEntry(
    sender: TranscriptSender,
    text: string,
    toolName?: string,
    metadata?: Record<string, any>
  ): void {
    if (!text || !text.trim()) return;

    const newEntry: TranscriptEntry = {
      id: `tr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      sender,
      text: text.trim(),
      toolName,
      metadata,
    };

    this.entries.push(newEntry);
    this.notify();
  }

  getEntries(): TranscriptEntry[] {
    return [...this.entries];
  }

  getStats(): SessionDebriefStats {
    const userTurns = this.entries.filter((e) => e.sender === 'user').length;
    const assistantTurns = this.entries.filter((e) => e.sender === 'friday').length;
    const toolsInvokedCount = this.entries.filter((e) => e.sender === 'tool' || !!e.toolName).length;
    const duration = Math.max(1, Math.round((Date.now() - this.sessionStartTime) / 1000));
    const curr = globalCurriculumManager.getCurriculum();

    return {
      sessionDurationSeconds: duration,
      userTurns,
      assistantTurns,
      toolsInvokedCount,
      conceptsReviewedCount: curr.completedConcepts.length,
      primaryTone: 'neutral',
    };
  }

  subscribe(listener: (entries: TranscriptEntry[]) => void): () => void {
    this.listeners.push(listener);
    listener([...this.entries]);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    const snapshot = [...this.entries];
    this.listeners.forEach((l) => l(snapshot));
  }

  clearSession(): void {
    this.entries = [];
    this.sessionStartTime = Date.now();
    this.addEntry('system', 'Neural Link session rebooted. New debrief log started.');
  }

  /**
   * Export to classified Stark Industries Markdown report
   */
  generateMarkdownReport(): string {
    const profile = globalAuthManager.getProfile();
    const stats = this.getStats();
    const curr = globalCurriculumManager.getCurriculum();
    const dateStr = new Date().toLocaleString();

    const durationMin = Math.floor(stats.sessionDurationSeconds / 60);
    const durationSec = stats.sessionDurationSeconds % 60;

    let md = `# STARK INDUSTRIES // MISSION DEBRIEF & TRANSCRIPT LOG\n`;
    md += `**CLASSIFICATION:** LEVEL 5 CLEARANCE // RESTRICTED\n`;
    md += `**DATE/TIME:** ${dateStr}\n`;
    md += `**COMMANDER:** ${profile.commanderName} (${profile.callSign})\n`;
    md += `**AI CORE:** F.R.I.D.A.Y. Cybernetic Neural Assistant\n\n`;

    md += `---\n\n`;
    md += `## 1. MISSION TELEMETRY SUMMARY\n\n`;
    md += `| Metric | Value |\n`;
    md += `| :--- | :--- |\n`;
    md += `| **Session Duration** | ${durationMin}m ${durationSec}s |\n`;
    md += `| **Commander Exchanges** | ${stats.userTurns} |\n`;
    md += `| **FRIDAY Vocal Responses** | ${stats.assistantTurns} |\n`;
    md += `| **Tools & Subsystems Triggered** | ${stats.toolsInvokedCount} |\n`;
    md += `| **Active Curriculum** | ${curr.subject} (Step ${curr.currentStep}/${curr.totalSteps}) |\n`;
    md += `| **Milestone Left Off** | ${curr.leftOffTopic} |\n\n`;

    md += `---\n\n`;
    md += `## 2. KEY STUDY TAKEAWAYS & MEMORY UPDATES\n\n`;
    if (curr.keyTakeaways.length > 0) {
      curr.keyTakeaways.forEach((t) => {
        md += `* ${t}\n`;
      });
    } else {
      md += `* No new study notes recorded during this turn.\n`;
    }
    md += `\n**Next Session Lesson Plan:** ${curr.nextSessionPlan}\n\n`;

    md += `---\n\n`;
    md += `## 3. FULL CHRONOLOGICAL TRANSCRIPT & MISSION LOG\n\n`;

    this.entries.forEach((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      let senderBadge = 'SYSTEM';
      if (entry.sender === 'user') senderBadge = `COMMANDER (${profile.callSign})`;
      else if (entry.sender === 'friday') senderBadge = 'FRIDAY';
      else if (entry.sender === 'tool') senderBadge = `TOOL [${entry.toolName || 'EXECUTION'}]`;

      md += `### [${time}] ${senderBadge}\n`;
      md += `${entry.text}\n\n`;
    });

    md += `---\n`;
    md += `*Report automatically compiled and digitally signed by F.R.I.D.A.Y. Core Systems.*`;

    return md;
  }

  downloadMarkdown(): void {
    const md = this.generateMarkdownReport();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FRIDAY_Debrief_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadJSON(): void {
    const data = {
      commander: globalAuthManager.getProfile(),
      stats: this.getStats(),
      curriculum: globalCurriculumManager.getCurriculum(),
      transcript: this.entries,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FRIDAY_Session_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const globalTranscriptManager = new TranscriptManagerService();
