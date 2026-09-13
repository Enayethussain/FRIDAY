import { PrivateFileItem } from '../types';
import { PinHash, EncryptedPayload, hashPin, verifyPin, encryptJSON, decryptJSON, newSalt } from './CryptoVault';

/**
 * PrivateVaultManager — REAL security (spec section 21):
 * - PIN kabhi plaintext me store nahi hota (sirf PBKDF2 hash)
 * - Files at-rest AES-GCM-256 se encrypted (PIN-derived key)
 * - Unlock par decrypt karke memory me, lock par memory wipe
 * - Access log (unlock/lock/failed attempts)
 * - Koi hard-coded default PIN nahi (legacy installs migrate ho jaate hain)
 */

const VAULT_META_KEY = 'friday_vault_meta_v2';
const LEGACY_PASSCODE_KEY = 'friday_vault_passcode';
const LEGACY_FILES_KEY = 'friday_classified_private_vault';

interface VaultMeta {
  pinHash: PinHash | null;
  encSalt: string;
  payload: EncryptedPayload | null;
  accessLog: { t: number; event: string }[];
}

const SEED_PRIVATE_FILES: PrivateFileItem[] = [
  {
    id: 'priv-doc-1',
    name: 'Classified_Mark_85_Neural_Blueprint.sec',
    category: 'confidential_project',
    classification: 'TOP SECRET',
    size: 2450,
    extension: 'sec',
    content: `// [CLASSIFIED] MARK LXXXV NEURAL RELAY SCHEMATIC
// SOLE AUTHORIZED OPERATOR: COMMANDER ENAYET HUSSAIN
// CLEARANCE LEVEL: 5 (EYES ONLY)

[SUB-SYSTEM: COGNITIVE ARC BYPASS]
Primary Palladium Resonance: 4.88 GHz
Quantum Flux Encryption: AES-GCM-256 Poly1305
Auto-Destruct Safeguard: Enabled on 3 failed biometric handshakes.

[PRIVATE PROTOCOL OVERRIDES]
1. Neural Wakeword "Hey FRIDAY" triggers instant encrypted tunnel.
2. In case of hostile interception, execute Protocol Clean Slate.
3. Private file storage must remain zero-knowledge in local memory.
`,
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
    tags: ['neural', 'schematic', 'mark85'],
  },
  {
    id: 'priv-doc-2',
    name: 'Personal_Private_Credentials_Log.txt',
    category: 'credentials',
    classification: 'EYES ONLY',
    size: 1120,
    extension: 'txt',
    content: `[COMMANDER ENAYET'S CLASSIFIED PERSONAL LOG]
Security Status: Vault Encrypted (AES-GCM-256)

- Neural Matrix Master Key: 0x9F4A...B821
- Private Server Port: 3000 / Local Bridge: 3821
- Mission Notes: Always maintain strict voice isolation. Nobody else is authorized to review this folder.
`,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    tags: ['personal', 'keys', 'secure'],
  },
];

const MASKED = '[RESTRICTED // VAULT LOCKED // AUTHORIZE WITH PIN TO DECRYPT]';

export class PrivateVaultManager {
  private files: PrivateFileItem[] = [];
  private unlocked: boolean = false;
  private sessionKey: CryptoKey | null = null;
  private meta: VaultMeta = { pinHash: null, encSalt: newSalt(), payload: null, accessLog: [] };
  private listeners: ((unlocked: boolean, files: PrivateFileItem[]) => void)[] = [];
  private ready: Promise<void>;

  constructor() {
    this.ready = this.init();
  }

  /** Init complete hone ka wait karo (migration + load) */
  async whenReady(): Promise<void> {
    return this.ready;
  }

  private async init(): Promise<void> {
    try {
      const raw = localStorage.getItem(VAULT_META_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as VaultMeta;
        if (parsed && typeof parsed.encSalt === 'string') {
          this.meta = { pinHash: parsed.pinHash || null, encSalt: parsed.encSalt, payload: parsed.payload || null, accessLog: parsed.accessLog || [] };
          return;
        }
      }
    } catch (e) {
      console.error('[PrivateVaultManager] Meta read error:', e);
    }
    await this.migrateLegacy();
  }

  /** Purane plaintext installs ko encrypted format me migrate karo, legacy keys wipe karo */
  private async migrateLegacy(): Promise<void> {
    let legacyPin: string | null = null;
    let legacyFiles: PrivateFileItem[] | null = null;
    try {
      const p = localStorage.getItem(LEGACY_PASSCODE_KEY);
      if (p && p.length >= 4) legacyPin = p;
      const f = localStorage.getItem(LEGACY_FILES_KEY);
      if (f) {
        const parsed = JSON.parse(f);
        if (Array.isArray(parsed) && parsed.length > 0) legacyFiles = parsed;
      }
    } catch {}

    if (legacyPin) {
      this.meta.pinHash = await hashPin(legacyPin);
      this.meta.encSalt = newSalt();
      const files = legacyFiles && legacyFiles.length > 0 ? legacyFiles : [...SEED_PRIVATE_FILES];
      this.meta.payload = await encryptJSON(legacyPin, this.meta.encSalt, files);
      this.logEvent('migrated-legacy');
      console.log('[PrivateVaultManager] Legacy vault migrated to AES-GCM encryption');
    } else if (legacyFiles && legacyFiles.length > 0) {
      // Files theen lekin PIN nahi — seed ki tarah rakho, PIN setup par encrypt hoga
      this.meta.payload = null;
      this.pendingLegacyFiles = legacyFiles;
    }
    try {
      localStorage.removeItem(LEGACY_PASSCODE_KEY);
      localStorage.removeItem(LEGACY_FILES_KEY);
    } catch {}
    this.persistMeta();
  }

  private pendingLegacyFiles: PrivateFileItem[] | null = null;

  /** Kya vault ka PIN set hai? (false = pehli baar setup chahiye) */
  hasPin(): boolean {
    return this.meta.pinHash !== null;
  }

  private persistMeta(): void {
    try {
      localStorage.setItem(VAULT_META_KEY, JSON.stringify(this.meta));
    } catch (e) {
      console.error('[PrivateVaultManager] Meta persist error:', e);
    }
  }

  private logEvent(event: string): void {
    this.meta.accessLog.push({ t: Date.now(), event });
    if (this.meta.accessLog.length > 50) {
      this.meta.accessLog = this.meta.accessLog.slice(-50);
    }
    this.persistMeta();
  }

  getAccessLog(): { t: number; event: string }[] {
    return [...this.meta.accessLog].reverse();
  }

  private notify(): void {
    const list = this.getFiles();
    this.listeners.forEach((fn) => {
      try {
        fn(this.unlocked, list);
      } catch (err) {
        console.error('[PrivateVaultManager] Listener error:', err);
      }
    });
  }

  subscribe(listener: (unlocked: boolean, files: PrivateFileItem[]) => void): () => void {
    this.listeners.push(listener);
    listener(this.unlocked, this.getFiles());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  getPasscodeHint(): string {
    return this.hasPin() ? 'PIN set hai' : 'PIN setup required';
  }

  /** Pehli baar PIN setup (koi default PIN nahi) */
  async setupPin(newPin: string): Promise<{ success: boolean; message: string }> {
    await this.ready;
    if (this.hasPin()) {
      return { success: false, message: 'PIN already set hai. Change karne ke liye current PIN use karo.' };
    }
    if (!newPin || newPin.trim().length < 4) {
      return { success: false, message: 'PIN kam se kam 4 characters ka ho.' };
    }
    const pin = newPin.trim();
    this.meta.pinHash = await hashPin(pin);
    this.meta.encSalt = newSalt();
    const seed = this.pendingLegacyFiles || [...SEED_PRIVATE_FILES];
    this.pendingLegacyFiles = null;
    this.meta.payload = await encryptJSON(pin, this.meta.encSalt, seed);
    this.logEvent('pin-setup');
    this.persistMeta();
    return { success: true, message: 'Vault PIN set ho gaya. Ab unlock karo.' };
  }

  async unlock(enteredCode: string): Promise<{ success: boolean; message: string }> {
    await this.ready;
    if (!this.meta.pinHash) {
      return { success: false, message: 'Vault PIN setup nahi hua. Pehle PIN set karo.', needsSetup: true } as any;
    }
    const ok = await verifyPin(enteredCode.trim(), this.meta.pinHash);
    if (!ok) {
      this.logEvent('unlock-failed');
      return { success: false, message: 'Access Denied: Invalid Security Passcode.' };
    }
    try {
      if (!this.meta.payload) throw new Error('Vault data missing');
      const { deriveKeyForSession } = await import('./CryptoVaultSession');
      this.sessionKey = await deriveKeyForSession(enteredCode.trim(), this.meta.encSalt);
      const files = await this.decryptWithSession<PrivateFileItem[]>(this.meta.payload);
      this.files = files;
      this.unlocked = true;
      this.logEvent('unlock');
      this.notify();
      return { success: true, message: 'Classified Private Vault Unlocked. Clearance verified.' };
    } catch {
      this.sessionKey = null;
      this.logEvent('unlock-failed');
      return { success: false, message: 'Access Denied: Decryption failed.' };
    }
  }

  private async decryptWithSession<T>(payload: EncryptedPayload): Promise<T> {
    if (!this.sessionKey) throw new Error('No session key');
    const { decryptWithKey } = await import('./CryptoVaultSession');
    return decryptWithKey<T>(this.sessionKey, payload);
  }

  private async encryptWithSession(data: unknown): Promise<EncryptedPayload> {
    if (!this.sessionKey) throw new Error('No session key');
    const { encryptWithKey } = await import('./CryptoVaultSession');
    return encryptWithKey(this.sessionKey, data);
  }

  /** Lock = session key + plaintext memory wipe (at-rest hamesha encrypted) */
  lock(): void {
    this.sessionKey = null;
    this.files = [];
    this.unlocked = false;
    this.logEvent('lock');
    this.notify();
  }

  private async persistEncrypted(): Promise<void> {
    if (!this.unlocked || !this.sessionKey) return;
    this.meta.payload = await this.encryptWithSession(this.files);
    this.persistMeta();
  }

  async setPasscode(currentCode: string, newCode: string): Promise<{ success: boolean; message: string }> {
    await this.ready;
    if (!this.meta.pinHash) {
      return { success: false, message: 'Pehle vault PIN setup karo.' };
    }
    if (!(await verifyPin(currentCode.trim(), this.meta.pinHash))) {
      this.logEvent('pin-change-failed');
      return { success: false, message: 'Current passcode verification failed.' };
    }
    if (!newCode || newCode.trim().length < 4) {
      return { success: false, message: 'New passcode must be at least 4 characters/digits.' };
    }
    const pin = newCode.trim();
    this.meta.pinHash = await hashPin(pin);
    this.meta.encSalt = newSalt();
    if (this.unlocked) {
      // Naye PIN se re-encrypt karo
      const { deriveKeyForSession } = await import('./CryptoVaultSession');
      this.sessionKey = await deriveKeyForSession(pin, this.meta.encSalt);
      await this.persistEncrypted();
    } else {
      this.meta.payload = null;
      this.files = [];
    }
    this.logEvent('pin-changed');
    this.persistMeta();
    return { success: true, message: 'Security passcode successfully updated.' };
  }

  /**
   * Locked: sirf metadata (content masked). At-rest data hamesha ciphertext hai.
   */
  getFiles(): PrivateFileItem[] {
    if (!this.unlocked) {
      // Metadata bhi sirf tab jab kabhi decrypt hua ho; warna khaali
      return this.files.map((f) => ({ ...f, content: MASKED }));
    }
    return [...this.files].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getFile(nameOrId: string): PrivateFileItem | null {
    const f = this.files.find(
      (item) =>
        item.id === nameOrId ||
        item.name.toLowerCase() === nameOrId.toLowerCase() ||
        item.name.toLowerCase().includes(nameOrId.toLowerCase())
    );
    if (!f) return null;
    if (!this.unlocked) {
      return { ...f, content: MASKED };
    }
    return f;
  }

  async addFile(
    name: string,
    content: string,
    category: PrivateFileItem['category'] = 'confidential_project',
    classification: PrivateFileItem['classification'] = 'TOP SECRET',
    tags: string[] = []
  ): Promise<{ success: boolean; file?: PrivateFileItem; message: string }> {
    if (!this.unlocked) {
      return { success: false, message: 'Vault is locked. Authorize with PIN first.' };
    }
    const cleanName = name.trim();
    if (!cleanName) {
      return { success: false, message: 'File name cannot be blank.' };
    }
    const ext = cleanName.split('.').pop() || 'txt';
    const newDoc: PrivateFileItem = {
      id: `priv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      content,
      category,
      classification,
      size: new Blob([content]).size,
      extension: ext,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags,
    };
    this.files.unshift(newDoc);
    await this.persistEncrypted();
    this.notify();
    return { success: true, file: newDoc, message: `File "${cleanName}" securely archived in Private Vault.` };
  }

  async updateFile(id: string, updates: Partial<Pick<PrivateFileItem, 'name' | 'content' | 'category' | 'classification' | 'tags'>>): Promise<boolean> {
    if (!this.unlocked) return false;
    const idx = this.files.findIndex((f) => f.id === id);
    if (idx === -1) return false;
    const current = this.files[idx];
    const newContent = updates.content !== undefined ? updates.content : current.content;
    const newName = updates.name !== undefined ? updates.name : current.name;
    this.files[idx] = {
      ...current,
      ...updates,
      name: newName,
      content: newContent,
      size: new Blob([newContent]).size,
      updatedAt: Date.now(),
    };
    await this.persistEncrypted();
    this.notify();
    return true;
  }

  async deleteFile(id: string): Promise<boolean> {
    if (!this.unlocked) return false;
    const initialLen = this.files.length;
    this.files = this.files.filter((f) => f.id !== id);
    if (this.files.length !== initialLen) {
      await this.persistEncrypted();
      this.notify();
      return true;
    }
    return false;
  }

  searchFiles(query: string): PrivateFileItem[] {
    const q = query.toLowerCase().trim();
    const list = this.getFiles();
    if (!q) return list;
    return list.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.classification.toLowerCase().includes(q) ||
        (f.tags && f.tags.some((t) => t.toLowerCase().includes(q))) ||
        (this.unlocked && f.content.toLowerCase().includes(q))
    );
  }
}

export const globalPrivateVault = new PrivateVaultManager();
