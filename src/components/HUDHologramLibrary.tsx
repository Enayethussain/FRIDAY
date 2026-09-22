/**
 * HUDHologramLibrary — searchable offline model browser.
 * Category filter, text search, optional Web-Speech voice search (only shown
 * when the browser actually supports it), recent, favorites. No fake
 * thumbnails: category glyphs only. Every entry opens a REAL model.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { loadCatalog, type CatalogModel, type HologramEntry } from '../hologram/registry';

interface Props {
  accent: string;
  onOpen: (entry: HologramEntry) => void;
  onClose: () => void;
}

const CAT_GLYPH: Record<string, string> = {
  anatomy: '❤️', biology: '🧬', science: '⚛️', astronomy: '🌍', technology: '💻',
  vehicles: '🚗', engineering: '⚙️', architecture: '🏠', nature: '🌳', misc: '📦', uploads: '⤒',
};

const RECENT_KEY = 'jarvis_holo_recent';
const FAV_KEY = 'jarvis_holo_fav';

function readList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

export const HUDHologramLibrary: React.FC<Props> = ({ accent, onOpen, onClose }) => {
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'REAL' | 'APPROX' | 'UNAVAILABLE'>('all');
  const [favs, setFavs] = useState<string[]>(() => readList(FAV_KEY));
  const [recent] = useState<string[]>(() => readList(RECENT_KEY));
  const [voiceOn, setVoiceOn] = useState(false);
  const recogRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    let alive = true;
    loadCatalog().then((m) => { if (alive) setModels(m); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => () => { try { recogRef.current?.stop(); } catch { /* noop */ } }, []);

  const cats = useMemo(() => ['all', ...Array.from(new Set(models.map((m) => m.category)))], [models]);

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z\u0900-\u097F0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const statusOf = (m: CatalogModel) => m.status ?? (m.approx ? 'APPROX' : 'REAL');
  const counts = useMemo(() => {
    const c: Record<string, number> = { REAL: 0, APPROX: 0, UNAVAILABLE: 0 };
    for (const m of models) c[statusOf(m)] = (c[statusOf(m)] ?? 0) + 1;
    return c;
  }, [models]);
  const filtered = useMemo(() => {
    const nq = norm(q);
    return models.filter((m) => {
      if (cat !== 'all' && m.category !== cat) return false;
      if (statusFilter !== 'all' && statusOf(m) !== statusFilter) return false;
      if (!nq) return true;
      const hay = norm([m.display_name, m.name, m.id, ...m.aliases].join(' '));
      return nq.split(' ').every((t) => hay.includes(t));
    }).slice(0, 60);
  }, [models, q, cat, statusFilter]);

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev].slice(0, 30);
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const voiceSearch = () => {
    try {
      const SR = (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
      if (!SR) return;
      if (voiceOn) { recogRef.current?.stop(); setVoiceOn(false); return; }
      const r = new SR();
      recogRef.current = r;
      r.lang = 'hi-IN';
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.onresult = (e: { results: { transcript: string }[][] }) => {
        const t = e.results?.[0]?.[0]?.transcript;
        if (t) setQ(t);
        setVoiceOn(false);
      };
      r.onend = () => setVoiceOn(false);
      r.onerror = () => setVoiceOn(false);
      r.start();
      setVoiceOn(true);
    } catch { setVoiceOn(false); }
  };
  const voiceSupported = useMemo(() => {
    try { return !!(window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition; } catch { return false; }
  }, []);

  const openEntry = (m: CatalogModel) => {
    try {
      const r = [m.id, ...readList(RECENT_KEY).filter((x) => x !== m.id)].slice(0, 10);
      localStorage.setItem(RECENT_KEY, JSON.stringify(r));
    } catch { /* noop */ }
    onOpen({
      id: m.id, label: m.display_name, category: m.category, kind: 'local',
      isApproximation: !!m.approx, url: `/holograms/${m.path}`, format: m.format,
      description: m.description, polygon_count: m.polygon_count, animation: m.animation,
    });
  };

  const favSet = new Set(favs);
  const recentModels = recent.map((id) => models.find((m) => m.id === id)).filter(Boolean) as CatalogModel[];

  return (
    <div className="w-full rounded-2xl border bg-black/60 backdrop-blur-md overflow-hidden" style={{ borderColor: `${accent}55` }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search 127 holograms… (dil, brain, rocket)"
          aria-label="Search hologram library"
          className="flex-1 min-w-0 bg-white/5 border border-white/15 rounded-lg px-3 py-2 min-h-[44px] text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-400"
        />
        {voiceSupported && (
          <button type="button" onClick={voiceSearch} aria-label="Voice search holograms" aria-pressed={voiceOn}
            className="px-3 min-h-[44px] min-w-[44px] rounded-lg border text-lg"
            style={{ borderColor: voiceOn ? accent : 'rgba(255,255,255,0.15)', color: accent }}>
            {voiceOn ? '●' : '🎙'}
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Close library"
          className="px-3 min-h-[44px] min-w-[44px] rounded-lg border border-white/15 text-slate-200">✕</button>
      </div>
      <div className="flex gap-1.5 px-3 py-2 overflow-x-auto border-b border-white/10" role="tablist" aria-label="Categories">
        {cats.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)}
            className="px-3 py-1.5 min-h-[44px] rounded-full border text-[11px] font-mono whitespace-nowrap"
            style={cat === c ? { borderColor: accent, color: accent } : { borderColor: 'rgba(255,255,255,0.15)', color: '#94a3b8' }}>
            {(CAT_GLYPH[c] ?? '◉') + ' ' + c.toUpperCase()}
          </button>
        ))}
      </div>
      {recentModels.length > 0 && !q && cat === 'all' && (
        <div className="px-3 pt-2 font-mono text-[10px] tracking-widest text-slate-500">
          RECENT: {recentModels.slice(0, 5).map((m) => m.display_name).join(' • ')}
        </div>
      )}
      <div className="max-h-[260px] overflow-y-auto p-2 grid grid-cols-1 gap-1" role="list">
        {filtered.length === 0 && (
          <div className="p-4 text-center font-mono text-xs text-slate-400">
            Sir, ye model local library me available nahi hai. Kuch aur try kijiye.
          </div>
        )}
        {filtered.map((m) => {
          const st = statusOf(m);
          return (
          <div key={m.id} role="listitem" className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-white/10 bg-white/[0.03]">
            <span className="text-xl w-8 text-center shrink-0" aria-hidden="true">{CAT_GLYPH[m.category] ?? '◉'}</span>
            {st === 'UNAVAILABLE' ? (
              <div className="flex-1 min-w-0 py-2">
                <div className="text-sm text-slate-400 truncate">{m.display_name}</div>
                <div className="text-[10px] font-mono text-red-400/80">● UNAVAILABLE — no verified free model</div>
              </div>
            ) : (
            <button type="button" onClick={() => openEntry(m)} className="flex-1 min-w-0 text-left py-2"
              aria-label={`Show ${m.display_name} hologram`}>
              <div className="text-sm text-slate-100 truncate">{m.display_name} {st === 'APPROX' && <span className="text-[9px] text-amber-300/80 font-mono">APPROX</span>} {st === 'REAL' && <span className="text-[9px] text-emerald-300/80 font-mono">REAL</span>}</div>
              <div className="text-[10px] font-mono text-slate-500 truncate">{m.category} • {(m.polygon_count ?? 0).toLocaleString('en-IN')} tris</div>
            </button>
            )}
            <button type="button" onClick={() => toggleFav(m.id)} aria-label={favSet.has(m.id) ? `Remove ${m.display_name} from favorites` : `Add ${m.display_name} to favorites`} aria-pressed={favSet.has(m.id)}
              className="px-2 min-h-[44px] min-w-[44px] text-lg" style={{ color: favSet.has(m.id) ? accent : '#475569' }}>
              {favSet.has(m.id) ? '★' : '☆'}
            </button>
          </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 px-3 py-2 border-t border-white/10" role="group" aria-label="Status filter">
        {(['all', 'REAL', 'APPROX', 'UNAVAILABLE'] as const).map((s) => (
          <button key={s} type="button" aria-pressed={statusFilter === s} onClick={() => setStatusFilter(s)}
            className="px-2.5 py-1.5 min-h-[44px] rounded-full border text-[10px] font-mono"
            style={statusFilter === s ? { borderColor: accent, color: accent } : { borderColor: 'rgba(255,255,255,0.15)', color: '#94a3b8' }}>
            {s === 'all' ? 'ALL' : `${s} (${counts[s] ?? 0})`}
          </button>
        ))}
      </div>
      <div className="px-3 py-1.5 font-mono text-[10px] text-slate-500 border-t border-white/10">
        {`FRIDAY HOLOGRAM LIBRARY — REAL ${counts.REAL ?? 0} • APPROX ${counts.APPROX ?? 0} • UNAVAILABLE ${counts.UNAVAILABLE ?? 0} • cost ₹0 • offline OK`}
      </div>
    </div>
  );
};
