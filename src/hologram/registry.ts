/**
 * Universal 3D Hologram Generator — catalog-driven registry.
 * Deterministic, offline-first: keyword + alias + fuzzy matching with a
 * confidence threshold. NO AI needed for matching. Low confidence or
 * ambiguity returns a clarification request — never a random model.
 */

export type HologramSourceKind = 'procedural' | 'local' | 'external' | 'upload';

export type ModelStatus = 'REAL' | 'APPROX' | 'USER_IMPORTED' | 'UNAVAILABLE' | 'PAID_UNAVAILABLE' | 'LICENSE_REVIEW_REQUIRED' | 'INVALID';

export interface CatalogModel {
  id: string;
  name: string;
  display_name: string;
  category: string;
  subcategory: string;
  filename: string;
  path: string;
  aliases: string[];
  description: string;
  format: 'glb' | 'gltf' | 'obj';
  polygon_count?: number;
  animation: boolean;
  license?: string;
  licenseUrl?: string;
  source?: string;
  author?: string;
  approx?: boolean;
  mobile_path?: string;
  status?: ModelStatus;
}

export function modelStatus(m: CatalogModel): ModelStatus {
  if (m.status) return m.status;
  return m.approx ? 'APPROX' : 'REAL';
}

export interface HologramEntry {
  id: string;
  label: string;
  category: string;
  kind: HologramSourceKind;
  isApproximation: boolean;
  url?: string;
  format?: 'glb' | 'gltf' | 'obj';
  description?: string;
  polygon_count?: number;
  animation?: boolean;
}

export interface SearchHit {
  entry: HologramEntry;
  confidence: number;
  ambiguousWith?: string[];
}

const CONFIDENCE_MIN = 0.45;
const AMBIGUITY_GAP = 0.08;

let catalogCache: CatalogModel[] | null = null;
let catalogFailed = false;

export async function loadCatalog(): Promise<CatalogModel[]> {
  if (catalogCache) return catalogCache;
  if (catalogFailed) return [];
  try {
    const r = await fetch('/holograms/catalog.json');
    const j = await r.json();
    const models = Array.isArray(j?.models) ? (j.models as CatalogModel[]) : [];
    catalogCache = models;
    return models;
  } catch {
    catalogFailed = true;
    return [];
  }
}

/** Synchronous snapshot if already loaded (deterministic fallback path). */
export function loadedCatalog(): CatalogModel[] {
  return catalogCache ?? [];
}

function normalize(text: string): string {
  return (text || '').toLowerCase().replace(/[^a-z\u0900-\u097F\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  for (const [g, n] of ga) inter += Math.min(n, gb.get(g) ?? 0);
  return (2 * inter) / (a.length + b.length - 2);
}

function scoreModel(q: string, qTokens: string[], m: CatalogModel): number {
  let best = 0;
  const pool = [m.name, m.display_name, m.id.replace(/_/g, ' '), ...m.aliases].map(normalize).filter(Boolean);
  for (const alias of pool) {
    if (!alias) continue;
    if (q === alias) return 1;
    if (q.includes(alias) || alias.includes(q)) {
      best = Math.max(best, 0.85 + 0.1 * (Math.min(q.length, alias.length) / Math.max(q.length, alias.length)));
      continue;
    }
    const aTokens = alias.split(' ');
    const overlap = aTokens.filter((t) => qTokens.includes(t)).length;
    if (overlap > 0) {
      best = Math.max(best, 0.5 + 0.3 * (overlap / Math.max(aTokens.length, qTokens.length)));
    }
    best = Math.max(best, dice(q, alias) * 0.9);
  }
  // category word bonus (never enough alone to pass threshold)
  if (normalize(m.category) && qTokens.includes(normalize(m.category))) best = Math.max(best, 0.3);
  return Math.min(1, best);
}

function toEntry(m: CatalogModel): HologramEntry {
  return {
    id: m.id,
    label: m.display_name,
    category: m.category,
    kind: 'local',
    isApproximation: !!m.approx,
    url: `/holograms/${m.path}`,
    format: m.format,
    description: m.description,
    polygon_count: m.polygon_count,
    animation: m.animation,
  };
}

export type SearchResult =
  | SearchHit
  | { ambiguous: true; options: string[] }
  | { unavailable: true; entry: HologramEntry }
  | { approxConfirm: true; entry: HologramEntry; confidence: number }
  | null;

/** Status rank: REAL files first, then APPROX (needs confirmation), then UNAVAILABLE verdicts. */
const STATUS_RANK: Record<string, number> = { REAL: 0, APPROX: 1, UNAVAILABLE: 2 };

export function searchCatalog(query: string, models?: CatalogModel[]): SearchResult {
  const list = (models ?? loadedCatalog()).filter((m) => modelStatus(m) !== 'INVALID');
  const q = normalize(query);
  if (!q || list.length === 0) return null;
  const qTokens = q.split(' ');
  const scored = list
    .map((m) => ({ m, s: scoreModel(q, qTokens, m) }))
    .filter((x) => x.s >= CONFIDENCE_MIN)
    .sort((a, b) => (b.s - a.s) || ((STATUS_RANK[modelStatus(b.m)] ?? 3) - (STATUS_RANK[modelStatus(a.m)] ?? 3)));
  if (scored.length === 0) return null;
  // a near-exact UNAVAILABLE verdict beats a weak APPROX guess (0.95+: no hijack)
  const unav = scored.find((x) => modelStatus(x.m) === 'UNAVAILABLE' && x.s >= 0.95);
  if (unav) return { unavailable: true, entry: toEntry(unav.m) };
  const usable = scored.filter((x) => modelStatus(x.m) !== 'UNAVAILABLE');
  if (usable.length === 0) {
    const u = scored[0];
    return { unavailable: true, entry: toEntry(u.m) };
  }
  const top = usable[0];
  const near = usable.filter((x) => x.s >= top.s - AMBIGUITY_GAP && x.m.id !== top.m.id).slice(0, 2);
  if (near.length > 0 && top.s < 0.9) {
    return { ambiguous: true, options: [top.m.display_name, ...near.map((x) => x.m.display_name)] };
  }
  const entry = toEntry(top.m);
  const confidence = Math.round(top.s * 100) / 100;
  if (modelStatus(top.m) === 'APPROX') return { approxConfirm: true, entry, confidence };
  return { entry, confidence };
}

// ---- user uploads (LEVEL 4) ----
const USER_LIB_KEY = 'jarvis_hologram_uploads';

export interface UserModel {
  id: string;
  label: string;
  url: string;
  format: 'glb' | 'gltf' | 'obj';
}

function readUserLibrary(): UserModel[] {
  try {
    const raw = localStorage.getItem(USER_LIB_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((e) => e && typeof e.id === 'string' && typeof e.url === 'string');
  } catch {
    return [];
  }
}

export function saveUserModel(entry: { id: string; label: string; url: string; format: 'glb' | 'gltf' | 'obj' }): void {
  try {
    const lib = readUserLibrary().filter((e) => e.id !== entry.id);
    lib.unshift({ ...entry });
    localStorage.setItem(USER_LIB_KEY, JSON.stringify(lib.slice(0, 30)));
  } catch { /* storage full/blocked */ }
}

export function listUserModels(): UserModel[] {
  return readUserLibrary();
}

/**
 * Legacy-compatible resolver used by the ToolManager (deterministic, no AI).
 * Uploads first, then catalog search. Returns null when nothing passes
 * the confidence threshold.
 */
export function matchObject(request: string): HologramEntry | null {
  const q = normalize(request);
  if (!q) return null;
  for (const u of readUserLibrary()) {
    const label = normalize(u.label);
    if (label && (q.includes(label) || label.includes(q))) {
      return { id: u.id, label: u.label, category: 'uploads', kind: 'upload', isApproximation: false, url: u.url, format: u.format };
    }
  }
  const hit = searchCatalog(request);
  if (hit && 'entry' in hit) return hit.entry;
  // APPROX matches are usable once the user confirms — matchObject callers
  // treat confirmation upstream; direct match still resolves the entry.
  if (hit && 'approxConfirm' in hit) return hit.entry;
  return null;
}

export function listCatalog(): HologramEntry[] {
  return loadedCatalog().map(toEntry);
}
