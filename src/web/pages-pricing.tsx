import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageShell } from './layout';
import { apiUrl } from '../lib/serverUrl';

interface CatalogItem {
  key: string;
  productId: string;
  plan: 'PRO' | 'PLUS';
  period: string;
  displayName: string;
  price: string;
  currency: string;
  badge: string;
  configured: boolean;
}

const FREE_POINTS = [
  'Basic FRIDAY chat (Hindi / English / Hinglish)',
  'FRIDAY female voice + basic voice commands',
  'Basic phone controls (Android permissions)',
  'Orb / HUD + basic gestures',
  'Basic memory, vault, FRIDAY Share',
  'Updates + AI access within server quota',
  'App Open Ads enabled',
];
const PRO_POINTS = [
  'Everything in Free, plus:',
  'Ad-free FRIDAY + JARVIS voice',
  'Advanced phone control + Share',
  'Screen awareness (permission-gated)',
  'Advanced gestures, hologram viewer + library',
  'App Builder, protocols, knowledge graph',
  'Higher AI quota (300/day default), up to 5 devices',
];
const PLUS_POINTS = [
  'Everything in Pro, plus:',
  'Highest AI quota (1000/day default), up to 10 devices',
  '3D model upload + early-access shelf',
];

export function PricingPage() {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(apiUrl('/api/v1/billing/products'), { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json().catch(() => null);
      if (Array.isArray(j?.items) && j.items.length > 0) setItems(j.items);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priceFor = (plan: 'PRO' | 'PLUS', period: string): string => {
    const it = items?.find((i) => i.plan === plan && i.period === period);
    return it?.price || '';
  };

  const periodBlock = (plan: 'PRO' | 'PLUS') => (
    <div className="mt-3 space-y-2">
      {(['MONTHLY', '3_MONTH', 'YEARLY'] as const).map((p) => {
        const label = p === 'MONTHLY' ? 'Monthly' : p === '3_MONTH' ? '3 Months' : 'Yearly';
        const price = priceFor(plan, p);
        return (
          <div key={p} className="flex items-center justify-between rounded-xl border border-slate-800 bg-black/40 px-3 py-2.5">
            <span className="text-sm text-slate-300">{label}</span>
            <span className="font-mono font-bold text-amber-300">{price || '…'}</span>
          </div>
        );
      })}
      <p className="text-[11px] text-slate-500">Google Play price is final at checkout. Purchases verify server-side.</p>
    </div>
  );

  return (
    <PageShell title="Pricing" description="FRIDAY AI pricing: Free ₹0, Pro from ₹99/month, Plus from ₹199/month. Verified entitlements, no fake discounts.">
      <h1 className="font-display font-black text-3xl">Pricing</h1>
      <p className="mt-2 text-slate-400">Live catalog from the FRIDAY backend — no invented discounts or trials.</p>
      {loading && !failed && (
        <p className="mt-4 text-sm text-slate-400 bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 animate-pulse">
          Loading live prices from FRIDAY backend…
        </p>
      )}
      {failed && (
        <div className="mt-4 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <span>Pricing is temporarily unavailable (backend unreachable). Please try again later.</span>
          <button type="button" onClick={() => void load()} className="px-4 py-2 min-h-[44px] rounded-xl border border-amber-500/50 font-bold">
            Retry
          </button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3 mt-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 flex flex-col">
          <h2 className="font-display font-bold text-lg">FREE</h2>
          <div className="font-mono text-2xl font-bold mt-1">₹0</div>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-300 flex-1">
            {FREE_POINTS.map((f) => <li key={f}>✓ {f}</li>)}
          </ul>
          <Link to="/dashboard" className="mt-4 block text-center px-4 py-2.5 rounded-xl border border-slate-700 font-bold text-sm min-h-[44px]">Open FRIDAY</Link>
        </div>
        <div className="rounded-2xl border border-amber-500/50 bg-amber-500/5 p-5 flex flex-col">
          <h2 className="font-display font-bold text-lg">PRO <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500 text-slate-950 ml-1">BEST VALUE · Yearly</span></h2>
          <div className="font-mono text-2xl font-bold mt-1 text-amber-300">{priceFor('PRO', 'MONTHLY') || '…'}</div>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-300 flex-1">
            {PRO_POINTS.map((f) => <li key={f}>✓ {f}</li>)}
          </ul>
          {periodBlock('PRO')}
          <Link to="/login" className="mt-4 block text-center px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-sm text-slate-950 min-h-[44px]">Login to upgrade</Link>
        </div>
        <div className="rounded-2xl border border-violet-500/50 bg-violet-500/5 p-5 flex flex-col">
          <h2 className="font-display font-bold text-lg">PLUS</h2>
          <div className="font-mono text-2xl font-bold mt-1 text-violet-300">{priceFor('PLUS', 'MONTHLY') || '…'}</div>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-300 flex-1">
            {PLUS_POINTS.map((f) => <li key={f}>✓ {f}</li>)}
          </ul>
          {periodBlock('PLUS')}
          <Link to="/login" className="mt-4 block text-center px-4 py-2.5 rounded-xl border border-violet-500/60 text-violet-300 font-bold text-sm min-h-[44px]">Login to upgrade</Link>
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-500">Headline prices show intended INR values until the backend catalog loads; Play Console may localize checkout prices.</p>
    </PageShell>
  );
}
