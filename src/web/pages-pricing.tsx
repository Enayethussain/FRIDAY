import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageShell } from './layout';
import { apiUrl } from '../lib/serverUrl';
import { createEkqrOrder, openCheckoutUrl } from '../services/PaymentService';

const SUPPORT_EMAIL = (import.meta as any).env?.VITE_CONTACT_EMAIL || '';
const SUPPORT_URL = (import.meta as any).env?.VITE_SUPPORT_URL || '';
function supportSuffix(): string {
  if (SUPPORT_EMAIL && SUPPORT_URL) return ` Support: ${SUPPORT_EMAIL} / ${SUPPORT_URL}.`;
  if (SUPPORT_EMAIL) return ` Support: ${SUPPORT_EMAIL}.`;
  if (SUPPORT_URL) return ` Support: ${SUPPORT_URL}.`;
  return ' Apna selection note karke support se sampark karo.';
}

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

/**
 * Fallback standard pricing shown ONLY when the backend catalog is
 * unreachable. Same values as the server period table; the live backend
 * response always wins when available. EKQR UPI checkout
 * (GPay, PhonePe, Paytm) is the only checkout — no Play dependency.
 */
const FALLBACK_PRICES: Record<'PRO' | 'PLUS', Record<string, string>> = {
  PRO: { MONTHLY: '₹99/month', '3_MONTH': '₹249/3 months', YEARLY: '₹799/year' },
  PLUS: { MONTHLY: '₹199/month', '3_MONTH': '₹499/3 months', YEARLY: '₹1,499/year' },
};

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
  const nav = useNavigate();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [backendLive, setBackendLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(apiUrl('/api/v1/billing/products'), { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json().catch(() => null);
      if (Array.isArray(j?.items) && j.items.length > 0) {
        setItems(j.items);
        setBackendLive(true);
      } else {
        // Empty/unexpected payload: fall back to standard prices, no banner.
        setBackendLive(false);
      }
    } catch {
      // Backend unreachable: graceful fallback below, no error banner.
      setBackendLive(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priceFor = (plan: 'PRO' | 'PLUS', period: string): string => {
    // Live backend price wins; otherwise the standard fallback above.
    const it = items?.find((i) => i.plan === plan && i.period === period);
    if (it?.price) return it.price;
    return FALLBACK_PRICES[plan][period] || '';
  };

  const onPay = async (plan: 'plus' | 'pro', period: 'monthly' | '3_month' | 'yearly') => {
    const key = `${plan}:${period}`;
    if (busyKey) return;
    setBusyKey(key);
    setNotice('');
    try {
      // No Play dependency: server EKQR order -> UPI intent / pay page.
      // UPI deep-links auto-open the user's UPI app (GPay/PhonePe/Paytm).
      const order = await createEkqrOrder(plan, period);
      openCheckoutUrl(order.checkoutUrl);
      nav(`/payment/success?orderId=${encodeURIComponent(order.orderId)}`);
    } catch (e: any) {
      const base = e?.message || 'Payment start nahi ho paya.';
      const help = `${base} UPI app khula nahi to dobara Try karo, ya GPay / PhonePe / Paytm se manual retry karo.${supportSuffix()}`;
      setNotice(help);
      try {
        window.alert(help);
      } catch { /* alert best-effort */ }
    } finally {
      setBusyKey(null);
    }
  };

  const periodBlock = (plan: 'PRO' | 'PLUS') => (
    <div className="mt-3 space-y-2">
      {(['MONTHLY', '3_MONTH', 'YEARLY'] as const).map((p) => {
        const label = p === 'MONTHLY' ? 'Monthly' : p === '3_MONTH' ? '3 Months' : 'Yearly';
        const price = priceFor(plan, p);
        const key = `${plan.toLowerCase()}:${p.toLowerCase()}`;
        const busy = busyKey === key;
        return (
          <div key={p} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-black/40 px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm text-slate-300">{label}</div>
              <div className="font-mono font-bold text-amber-300">{loading && !price ? '…' : price}</div>
            </div>
            <button
              type="button"
              disabled={busy || busyKey !== null}
              onClick={() => void onPay(plan.toLowerCase() as 'plus' | 'pro', p.toLowerCase() as 'monthly' | '3_month' | 'yearly')}
              aria-label={`Pay for ${plan} ${label} at ${price}`}
              className="shrink-0 px-4 py-2 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-sm text-slate-950 transition disabled:opacity-50"
            >
              {busy ? 'Starting…' : 'Pay'}
            </button>
          </div>
        );
      })}
      <p className="text-[11px] text-slate-500">Secure UPI payment via EKQR (GPay, PhonePe, Paytm) — plan activates after verification.</p>
    </div>
  );

  return (
    <PageShell title="Pricing" description="FRIDAY AI pricing: Free ₹0, Pro from ₹99/month, Plus from ₹199/month. Verified entitlements, no fake discounts.">
      <h1 className="font-display font-black text-3xl">Pricing</h1>
      <p className="mt-2 text-slate-400">Live catalog from the FRIDAY backend — no invented discounts or trials.</p>
      {!loading && !backendLive && (
        <p className="mt-4 text-xs text-slate-400 bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
          Backend unreachable — showing standard prices. Checkout needs connection; your plan activates only after verified payment.
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          {notice}
        </p>
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
      <p className="mt-4 text-xs text-slate-500">Prices shown are standard INR values until the backend catalog loads; Secure UPI payment via EKQR (GPay, PhonePe, Paytm).</p>
    </PageShell>
  );
}
