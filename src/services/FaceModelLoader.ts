/**
 * FaceModelLoader — integrity-verified loading for face-api.js nets.
 *
 * ROOT CAUSE it fixes: face-api.js fetches weight shards with plain fetch()
 * and hands them to TensorFlow.js with no size check. A truncated shard
 * (network cut, stale partial cache, corrupt asset) makes tfjs throw
 * "based on the provided shape, [1,1,32,64], the tensor should have 2048
 * values but has 746" deep inside weight decode. That error used to surface
 * as "Camera nahi khul paya" even though the camera was fine.
 *
 * This loader: fetches manifest + shards itself (retry + backoff), verifies
 * total bytes against the manifest-implied size, then serves the VERIFIED
 * bytes to face-api.js via a temporary fetch interceptor — so tfjs can only
 * ever decode complete data. Any mismatch aborts BEFORE inference with a
 * typed MODEL_LOAD_ERROR. No face images or biometric data are ever logged.
 */

export type FaceErrorCode =
  | 'MODEL_LOAD_ERROR'
  | 'MODEL_INFERENCE_ERROR'
  | 'CAMERA_PERMISSION_ERROR'
  | 'CAMERA_INIT_ERROR'
  | 'FRAME_NOT_READY'
  | 'FRAME_ERROR'
  | 'FACE_NOT_DETECTED'
  | 'VERIFICATION_FAILED';

export class FaceError extends Error {
  readonly code: FaceErrorCode;
  /** Machine sub-detail for DEBUG logs only (never biometric data). */
  readonly detail: string;
  constructor(code: FaceErrorCode, message: string, detail = '') {
    super(message);
    this.name = 'FaceError';
    this.code = code;
    this.detail = detail;
  }
}

interface NetSpec {
  net: string;
  manifest: string;
  shards: string[];
}

const NET_SPECS: NetSpec[] = [
  { net: 'tinyFaceDetector', manifest: 'tiny_face_detector_model-weights_manifest.json', shards: ['tiny_face_detector_model-shard1'] },
  { net: 'faceLandmark68Net', manifest: 'face_landmark_68_model-weights_manifest.json', shards: ['face_landmark_68_model-shard1'] },
  { net: 'faceRecognitionNet', manifest: 'face_recognition_model-weights_manifest.json', shards: ['face_recognition_model-shard1', 'face_recognition_model-shard2'] },
];

const FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 20000;

function debugLog(...args: unknown[]): void {
  try {
    if (typeof process !== 'undefined' && process.env && /^(1|true|debug)$/i.test(process.env.FRIDAY_FACE_DEBUG || '')) {
      // eslint-disable-next-line no-console
      console.log('[FaceModel]', ...args);
    }
  } catch { /* logging never breaks loading */ }
}

/** Bytes per element for a manifest weight entry (quantized uint8/int8 = 1). */
function bytesPerElement(entry: { dtype?: string; quantization?: { dtype?: string } }): number {
  const q = entry.quantization?.dtype?.toLowerCase();
  if (q === 'uint8' || q === 'int8' || q === 'bool') return 1;
  const dt = (entry.dtype || 'float32').toLowerCase();
  if (dt === 'uint8' || dt === 'int8' || dt === 'bool' || dt === 'uint16' || dt === 'int16') return dt.includes('16') ? 2 : 1;
  if (dt === 'float64' || dt === 'int64' || dt === 'complex64') return 8;
  return 4; // float32 / int32 default
}

/** Manifest-implied total shard bytes. Source of truth for completeness. */
export function expectedShardBytes(manifest: unknown): number {
  if (!Array.isArray(manifest)) throw new FaceError('MODEL_LOAD_ERROR', 'Face model manifest kharab hai.', 'manifest not an array');
  let total = 0;
  for (const group of manifest as any[]) {
    const weights = group?.weights;
    if (!Array.isArray(weights)) throw new FaceError('MODEL_LOAD_ERROR', 'Face model manifest kharab hai.', 'group without weights');
    for (const w of weights) {
      if (!Array.isArray(w?.shape)) throw new FaceError('MODEL_LOAD_ERROR', 'Face model manifest kharab hai.', `bad shape for ${w?.name}`);
      let n = 1;
      for (const d of w.shape) {
        if (!Number.isInteger(d) || d < 0) throw new FaceError('MODEL_LOAD_ERROR', 'Face model manifest kharab hai.', `bad dim for ${w?.name}`);
        n *= d;
      }
      total += n * bytesPerElement(w);
    }
  }
  return total;
}

/** Strict gate: actual bytes must EXACTLY equal manifest-implied bytes. */
export function assertShardComplete(net: string, expected: number, actual: number): void {
  if (actual !== expected) {
    debugLog('MODEL_INPUT_MISMATCH', `net=${net} expectedBytes=${expected} actualBytes=${actual}`);
    throw new FaceError(
      'MODEL_LOAD_ERROR',
      'Face models poori tarah load nahi ho paye. Dobara try karo.',
      `net=${net} expectedBytes=${expected} actualBytes=${actual}`
    );
  }
}

async function fetchBuffer(url: string, label: string): Promise<ArrayBuffer> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      debugLog('fetch', `${label} attempt=${attempt}`);
      const res = await fetch(url, { cache: 'reload', signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      debugLog('fetch ok', `${label} bytes=${buf.byteLength}`);
      return buf;
    } catch (e) {
      lastErr = e;
      debugLog('fetch fail', `${label} attempt=${attempt} err=${(e as Error)?.message || e}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new FaceError(
    'MODEL_LOAD_ERROR',
    'Face models download nahi ho paye. Internet check karke dobara try karo.',
    `${label} fetch failed after ${FETCH_ATTEMPTS} attempts: ${(lastErr as Error)?.message || lastErr}`
  );
}

/** Per-net load state for DEBUG diagnostics (never biometric data). */
export type NetLoadState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
const netStatus = new Map<string, { state: NetLoadState; expectedBytes: number; actualBytes: number; attempts: number; lastError: string }>();

export function getNetDiagnostics(): Record<string, { state: NetLoadState; expectedBytes: number; actualBytes: number; attempts: number; lastError: string }> {
  const out: Record<string, { state: NetLoadState; expectedBytes: number; actualBytes: number; attempts: number; lastError: string }> = {};
  for (const [k, v] of netStatus) out[k] = { ...v };
  return out;
}

function setNetState(net: string, patch: Partial<{ state: NetLoadState; expectedBytes: number; actualBytes: number; attempts: number; lastError: string }>): void {
  const prev = netStatus.get(net) || { state: 'IDLE' as NetLoadState, expectedBytes: 0, actualBytes: 0, attempts: 0, lastError: '' };
  netStatus.set(net, { ...prev, ...patch });
}

/** Verified in-memory assets: manifest text + shard bytes per net. */
export interface VerifiedNetAssets {
  manifestText: string;
  shardBuffers: ArrayBuffer[];
}

const VERIFY_ROUNDS = 2;

export async function fetchVerifiedAssets(baseUrl: string): Promise<Map<string, VerifiedNetAssets>> {
  const base = baseUrl.replace(/\/$/, '');
  const out = new Map<string, VerifiedNetAssets>();
  for (const spec of NET_SPECS) {
    setNetState(spec.net, { state: 'LOADING', attempts: 0, lastError: '' });
    debugLog('FACE_MODEL_LOAD_START', `net=${spec.net}`);
    let lastErr: unknown = null;
    let done = false;
    // Real retry: each round re-fetches manifest + shards and re-verifies.
    // A truncated shard fails the round; only all-rounds failure throws.
    for (let round = 1; round <= VERIFY_ROUNDS && !done; round++) {
      try {
        const manifestUrl = `${base}/${spec.manifest}`;
        let manifestText: string;
        try {
          const buf = await fetchBuffer(manifestUrl, spec.manifest);
          manifestText = new TextDecoder().decode(buf);
          JSON.parse(manifestText); // must be valid JSON before use
          debugLog('FACE_MODEL_FILE_FOUND', `net=${spec.net} manifest bytes=${buf.byteLength}`);
        } catch (e) {
          if (e instanceof FaceError) throw e;
          throw new FaceError(
            'MODEL_LOAD_ERROR',
            'Face model ki jaankari load nahi ho payi. Dobara try karo.',
            `${spec.net} manifest error: ${(e as Error)?.message || e}`
          );
        }
        const expected = expectedShardBytes(JSON.parse(manifestText));
        const shardBuffers: ArrayBuffer[] = [];
        let actual = 0;
        for (const shard of spec.shards) {
          const buf = await fetchBuffer(`${base}/${shard}`, shard);
          shardBuffers.push(buf);
          actual += buf.byteLength;
        }
        debugLog('FACE_MODEL_FILE_SIZE', `net=${spec.net} expected=${expected} actual=${actual} round=${round}`);
        // THE regression gate: 746-bytes-vs-2048 class failures die here,
        // before any tensor is ever created.
        assertShardComplete(spec.net, expected, actual);
        debugLog('FACE_MODEL_LOAD_SUCCESS', `net=${spec.net} bytes=${actual}`);
        setNetState(spec.net, { state: 'READY', expectedBytes: expected, actualBytes: actual, attempts: round, lastError: '' });
        out.set(spec.net, { manifestText, shardBuffers });
        done = true;
      } catch (e) {
        lastErr = e;
        setNetState(spec.net, { lastError: (e instanceof FaceError ? e.detail : String((e as Error)?.message || e)).slice(0, 160) });
        if (round < VERIFY_ROUNDS) {
          debugLog('FACE_MODEL_LOAD_FAILURE', `net=${spec.net} round=${round} retrying`);
          await new Promise((r) => setTimeout(r, 800 * round));
        }
      }
    }
    if (!done) {
      setNetState(spec.net, { state: 'ERROR' });
      debugLog('FACE_MODEL_LOAD_FAILURE', `net=${spec.net} all rounds exhausted`);
      if (lastErr instanceof FaceError) throw lastErr;
      throw new FaceError('MODEL_LOAD_ERROR', 'Face models poori tarah load nahi ho paye. Dobara try karo.', `${spec.net} verification failed`);
    }
  }
  return out;
}

// Serialize concurrent ensure() calls: load once, share the result.
let inflight: Promise<void> | null = null;

/**
 * Run `loadFn` with window.fetch temporarily serving the verified model
 * bytes, so face-api.js/tfjs decode exactly what was verified. All other
 * requests pass through untouched. Restored in `finally`.
 */
export function ensureVerifiedModels(baseUrl: string, loadFn: () => Promise<void>): Promise<void> {
  // Load once per session; concurrent callers share the in-flight attempt.
  // A failed attempt clears so the next call genuinely retries (new fetch).
  if (!inflight) {
    inflight = (async () => {
      const assets = await fetchVerifiedAssets(baseUrl);
      const base = baseUrl.replace(/\/$/, '');
      const byUrl = new Map<string, { body: ArrayBuffer | string; type: string }>();
      for (const spec of NET_SPECS) {
        const a = assets.get(spec.net)!;
        byUrl.set(`${base}/${spec.manifest}`, { body: a.manifestText, type: 'application/json' });
        spec.shards.forEach((shard, i) => {
          byUrl.set(`${base}/${shard}`, { body: a.shardBuffers[i], type: 'application/octet-stream' });
        });
      }
      const originalFetch = window.fetch.bind(window);
      const servingFetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        try {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          const clean = url.split('?')[0];
          const hit = byUrl.get(clean) || byUrl.get(url);
          if (hit) {
            debugLog('serve-verified', clean);
            return new Response(hit.body as BodyInit, {
              status: 200,
              headers: { 'Content-Type': hit.type, 'Content-Length': String((hit.body as ArrayBuffer).byteLength ?? (hit.body as string).length) },
            });
          }
        } catch { /* fall through to network */ }
        return originalFetch(input as RequestInfo, init);
      }) as typeof fetch;
      (window as any).fetch = servingFetch;
      try {
        await loadFn();
      } finally {
        (window as any).fetch = originalFetch;
      }
    })().catch((e) => {
      throw e;
    });
    // Clear inflight on failure so a later retry actually retries.
    inflight.then(
      () => {},
      () => { inflight = null; }
    );
  }
  return inflight;
}

/** Parse tfjs shape errors like "...[1,1,32,64]...should have 2048 values but has 746". */
export function parseTensorMismatch(message: string): { shape: string; expected: number; actual: number } | null {
  const m = /\[([\d,\s]+)\][\s\S]*?should have (\d+) values? but has (\d+)/i.exec(message || '');
  if (!m) return null;
  return { shape: `[${m[1].replace(/\s+/g, '')}]`, expected: Number(m[2]), actual: Number(m[3]) };
}

export interface Box { x: number; y: number; width: number; height: number }

/** Clamp a detection box into frame bounds; null when nothing valid remains. */
export function clampBox(box: Box, imgW: number, imgH: number): Box | null {
  if (!box || !(imgW > 0) || !(imgH > 0)) return null;
  const x = Math.max(0, Math.min(imgW, box.x));
  const y = Math.max(0, Math.min(imgH, box.y));
  const w = Math.max(0, Math.min(imgW - x, box.width));
  const h = Math.max(0, Math.min(imgH - y, box.height));
  if (w <= 0 || h <= 0) return null;
  return { x, y, width: w, height: h };
}

/** A usable face descriptor is 128 finite floats — anything else is rejected. */
export function validateDescriptor(d: unknown): d is Float32Array {
  if (!(d instanceof Float32Array) && !Array.isArray(d)) return false;
  const arr = d as ArrayLike<number>;
  if (arr.length !== 128) return false;
  for (let i = 0; i < 128; i++) {
    const v = arr[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  }
  return true;
}
