/**
 * DeviceIdentity — per-installation Ed25519 identity.
 * Private key lives in IndexedDB as a NON-EXTRACTABLE CryptoKey: usable for
 * signing but never readable by JS, never sent anywhere, never logged.
 * (Android Keystore / Windows DPAPI binding = documented future hardening.)
 */

const DB_NAME = 'friday-identity';
const STORE = 'keys';
const ID_KEY = 'device-id';
const PRIV_KEY = 'ed-priv';
const PUB_KEY = 'ed-pub';

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
}
function b64decode(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const rq = tx.objectStore(STORE).get(key);
    rq.onsuccess = () => resolve((rq.result as T) ?? null);
    rq.onerror = () => reject(rq.error);
  });
}

async function idbSet(key: string, val: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function needCrypto(): SubtleCrypto {
  const sc = crypto?.subtle;
  if (!sc) throw new Error('WebCrypto unavailable (insecure context?). Pairing needs HTTPS/localhost.');
  return sc;
}

export interface IdentityInfo {
  deviceId: string;
  pubkeyB64: string;
}

class DeviceIdentityService {
  private cachedPub: CryptoKey | null = null;
  private cachedPriv: CryptoKey | null = null;
  private cachedId: string | null = null;

  async ensure(): Promise<IdentityInfo> {
    const subtle = needCrypto();
    let id = this.cachedId;
    let priv = this.cachedPriv;
    let pub = this.cachedPub;
    if (!id) id = await idbGet<string>(ID_KEY);
    if (!priv) priv = await idbGet<CryptoKey>(PRIV_KEY);
    if (!pub) pub = await idbGet<CryptoKey>(PUB_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
      await idbSet(ID_KEY, id);
    }
    if (!priv || !pub) {
      let pair: CryptoKeyPair;
      try {
        pair = (await subtle.generateKey({ name: 'Ed25519' } as AlgorithmIdentifier, false, ['sign', 'verify'])) as unknown as CryptoKeyPair;
      } catch {
        throw new Error('Ed25519 not supported by this browser/WebView. Update Chrome/WebView.');
      }
      priv = pair.privateKey;
      pub = pair.publicKey;
      await idbSet(PRIV_KEY, priv);
      await idbSet(PUB_KEY, pub);
    }
    this.cachedId = id;
    this.cachedPriv = priv;
    this.cachedPub = pub;
    const spki = await subtle.exportKey('spki', pub);
    return { deviceId: id, pubkeyB64: b64encode(spki) };
  }

  async deviceId(): Promise<string> {
    const { deviceId } = await this.ensure();
    return deviceId;
  }

  async signText(message: string): Promise<string> {
    const subtle = needCrypto();
    await this.ensure();
    if (!this.cachedPriv) throw new Error('No identity key.');
    const sig = await subtle.sign({ name: 'Ed25519' } as AlgorithmIdentifier, this.cachedPriv, new TextEncoder().encode(message));
    return b64encode(sig);
  }

  /** Fresh identity (recovery after reinstall/reset). Old trust does NOT carry over. */
  async wipe(): Promise<void> {
    this.cachedId = null;
    this.cachedPriv = null;
    this.cachedPub = null;
    await idbClear();
  }
}

export const globalIdentity = new DeviceIdentityService();
export { b64decode as b64ToBytes };
