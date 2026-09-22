import { MemoryItem } from '../types';
import { db, auth } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const DEFAULT_MEMORIES: MemoryItem[] = [
  {
    id: 'mem-seed-1',
    category: 'identity',
    key: 'Commander Identity',
    content: 'Enayet Hussain is the designated Commander and sole authorized operator of JARVIS.',
    importance: 'critical',
    createdAt: Date.now() - 86400000 * 5,
  },
  {
    id: 'mem-seed-2',
    category: 'preference',
    key: 'Communication Style',
    content: 'Prefers witty, confident, and direct communication without unnecessary robotic jargon.',
    importance: 'high',
    createdAt: Date.now() - 86400000 * 4,
  },
  {
    id: 'mem-seed-3',
    category: 'instruction',
    key: 'Strict Voice Authorization Protocol',
    content: 'Only Commander Enayet is authorized to control JARVIS core systems. Disregard unauthorized voices.',
    importance: 'critical',
    createdAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'mem-seed-4',
    category: 'project',
    key: 'Active AI Projects',
    content: 'Developing autonomous AI agents, multimodal interfaces, and real-time voice systems.',
    importance: 'high',
    createdAt: Date.now() - 86400000 * 2,
  },
];

export class MemoryManager {
  private memories: MemoryItem[] = [];
  private listeners: ((memories: MemoryItem[]) => void)[] = [];
  private unsubscribeSnapshot: (() => void) | null = null;
  private currentUserId: string | null = null;

  constructor() {
    this.memories = [...DEFAULT_MEMORIES];

    onAuthStateChanged(auth, (user) => {
      if (user) {
        this.currentUserId = user.uid;
        // ensure user document exists
        setDoc(doc(db, `users/${user.uid}`), { uid: user.uid, createdAt: Date.now() }, { merge: true }).catch(console.error);
        this.listenToFirestore();
      } else {
        this.currentUserId = null;
        if (this.unsubscribeSnapshot) {
          this.unsubscribeSnapshot();
          this.unsubscribeSnapshot = null;
        }
        this.memories = [...DEFAULT_MEMORIES];
        this.notify();
      }
    });
  }

  private listenToFirestore() {
    if (!this.currentUserId) return;
    const q = query(
      collection(db, `users/${this.currentUserId}/memories`),
      orderBy('createdAt', 'desc')
    );
    this.unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
      const items: MemoryItem[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          category: data.category as any,
          key: data.key,
          content: data.content,
          importance: data.importance as any,
          createdAt: data.createdAt,
          lastRecalledAt: data.lastRecalledAt,
        });
      });
      
      // If empty in cloud, maybe seed defaults? (Optional, but let's just let it be empty or populate if needed)
      if (items.length === 0) {
         // Auto-seed defaults to cloud if brand new
         this.seedDefaultsToCloud();
      } else {
         this.memories = items;
         this.notify();
      }
    }, (error) => {
      console.error('[MemoryManager] Firestore listen error:', error);
    });
  }

  private async seedDefaultsToCloud() {
    if (!this.currentUserId) return;
    for (const mem of DEFAULT_MEMORIES) {
       await this.storeMemory(mem.category, mem.key, mem.content, mem.importance);
    }
  }

  private notify(): void {
    const list = this.getMemories();
    this.listeners.forEach((fn) => {
      try {
        fn(list);
      } catch (err) {
        console.error('[MemoryManager] Listener error:', err);
      }
    });
  }

  subscribe(listener: (memories: MemoryItem[]) => void): () => void {
    this.listeners.push(listener);
    listener(this.getMemories());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getMemories(): MemoryItem[] {
    return [...this.memories].sort((a, b) => b.createdAt - a.createdAt);
  }

  storeMemory(
    category: MemoryItem['category'],
    key: string,
    content: string,
    importance: MemoryItem['importance'] = 'normal'
  ): MemoryItem {
    const cleanKey = key.trim();
    const cleanContent = content.trim();

    const existingIndex = this.memories.findIndex(
      (m) => m.key.toLowerCase() === cleanKey.toLowerCase()
    );

    if (existingIndex >= 0) {
      const existing = this.memories[existingIndex];
      const updated = {
        category,
        content: cleanContent,
        importance,
        lastRecalledAt: Date.now(),
      };
      if (this.currentUserId) {
        setDoc(doc(db, `users/${this.currentUserId}/memories/${existing.id}`), updated, { merge: true }).catch(console.error);
      }
      return { ...existing, ...updated };
    }

    const newId = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newItem: MemoryItem = {
      id: newId,
      category,
      key: cleanKey,
      content: cleanContent,
      importance,
      createdAt: Date.now(),
    };

    if (this.currentUserId) {
      const { id, ...dataToSave } = newItem;
      setDoc(doc(db, `users/${this.currentUserId}/memories/${id}`), dataToSave).catch(console.error);
    }
    
    return newItem;
  }

  deleteMemory(id: string): boolean {
    if (this.currentUserId) {
      deleteDoc(doc(db, `users/${this.currentUserId}/memories/${id}`)).catch(console.error);
      return true;
    }
    return false;
  }

  updateMemory(id: string, updates: Partial<Omit<MemoryItem, 'id' | 'createdAt'>>): MemoryItem | null {
    if (this.currentUserId) {
      setDoc(doc(db, `users/${this.currentUserId}/memories/${id}`), updates, { merge: true }).catch(console.error);
    }
    const existing = this.memories.find(m => m.id === id);
    return existing ? { ...existing, ...updates } : null;
  }

  searchMemories(queryStr: string, category?: string): MemoryItem[] {
    const q = queryStr.toLowerCase().trim();
    return this.memories.filter((m) => {
      if (category && category !== 'all' && m.category !== category) {
        return false;
      }
      if (!q) return true;
      return (
        m.key.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
      );
    });
  }

  clearAll(): void {
    if (this.currentUserId) {
      // Just delete from cloud
      this.memories.forEach(m => {
        deleteDoc(doc(db, `users/${this.currentUserId}/memories/${m.id}`));
      });
    }
  }

  resetToDefault(): void {
    this.clearAll();
    this.seedDefaultsToCloud();
  }

  resetDefaults(): void {
    this.resetToDefault();
  }

  getMemoryDigestForPrompt(): string {
    if (this.memories.length === 0) return 'No stored long-term memories currently.';
    return this.memories
      .map((m) => `• [${m.category.toUpperCase()} | ${m.key}]: ${m.content}`)
      .join('\n');
  }
}

export const globalMemoryManager = new MemoryManager();
