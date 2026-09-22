/**
 * Hologram provider abstraction (PART W).
 * Free-first ordering enforced by resolveFree(); paid route NEVER runs
 * without explicit user confirmation (handled by the confirmHologram tool).
 * No prices are invented: estimatedCost is null unless a provider states one.
 */

export interface HologramProviderInfo {
  provider_name: string;
  free_available: boolean;
  /** null = provider did not state a price — callers must say so honestly */
  estimated_cost: string | null;
  supports_text_to_3d: boolean;
  supports_image_to_3d: boolean;
  supports_low_poly: boolean;
  model_formats: string[];
  paid: boolean;
}

interface ProvidersResponse {
  providers?: HologramProviderInfo[];
}

let cache: { at: number; list: HologramProviderInfo[] } | null = null;

export async function getProviders(): Promise<HologramProviderInfo[]> {
  if (cache && Date.now() - cache.at < 60000) return cache.list;
  try {
    const r = await fetch('/api/hologram/providers');
    const j = (await r.json().catch(() => null)) as ProvidersResponse | null;
    const list = Array.isArray(j?.providers) ? j.providers : [];
    cache = { at: Date.now(), list };
    return list;
  } catch {
    return cache?.list ?? [];
  }
}

export function paidProvider(list: HologramProviderInfo[]): HologramProviderInfo | null {
  return list.find((p) => p.paid && p.supports_text_to_3d) ?? null;
}

/** Request paid generation. Only call after explicit user confirmation. */
export async function requestPaidGeneration(object: string, quality: string): Promise<{ ok: true; url: string; type: string; provider: string } | { ok: false; error: string }> {
  try {
    const r = await fetch('/api/hologram/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object, quality, style: 'yellow hologram' }),
    });
    const j = await r.json().catch(() => null);
    if (j && j.success === true && typeof j.model_url === 'string') {
      return { ok: true, url: j.model_url, type: j.model_type || 'glb', provider: j.provider || 'external-3d' };
    }
    return { ok: false, error: (j && j.error) || '3D model generation unavailable' };
  } catch {
    return { ok: false, error: '3D generation service unreachable (network failure).' };
  }
}
