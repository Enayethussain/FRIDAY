import React, { useEffect, useState } from 'react';
import { XCircle, Check, RefreshCw } from 'lucide-react';
import { getEntitlements, refreshEntitlements, subscribeEntitlements, type EntitlementSnapshot } from '../services/EntitlementService';
import { getProducts, purchaseProduct, restorePurchases, currentSubscriptionToken, describeOffer, lifecycleMessage, type ProductsResult, type ProductItem, type PlayOffer } from '../services/BillingService';
import type { ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface HUDSubscriptionProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeAccent;
}

const FREE_FEATURES = [
  'FRIDAY chat (Hindi / English / Hinglish)',
  'FRIDAY female voice + voice commands',
  'Phone controls (Android permissions)',
  'Orb / HUD + basic gestures',
  'Vault (basic), Memory (basic)',
  'FRIDAY Share (basic)',
  'AI access within server quota',
];
const PRO_FEATURES = [
  'Everything in FREE',
  'Ad-free FRIDAY',
  'JARVIS voice mode',
  'Advanced phone control + Share',
  'Screen awareness (permission-gated)',
  'Advanced gestures + Hologram / 3D library',
  'App Builder + Protocols + Knowledge Graph',
  'Higher AI limits + more devices',
];
const PLUS_FEATURES = [
  'Everything in PRO',
  'Highest AI limits + most devices',
  '3D model upload',
  'Early-access features (as they land)',
];

export function HUDSubscription({ isOpen, onClose, theme }: HUDSubscriptionProps) {
  const currentTheme = THEMES[theme] || THEMES.amber;
  const [snap, setSnap] = useState<EntitlementSnapshot>(() => getEntitlements());
  const [products, setProducts] = useState<ProductsResult | null>(null);
  const [pricesState, setPricesState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const loadPrices = async () => {
    setPricesState('loading');
    try {
      const p = await getProducts();
      setProducts(p);
      // Backend always returns 6 items when reachable; empty = failure, never
      // silent. Prices shown only from this response (never hard-coded).
      setPricesState(p.items.length > 0 ? 'ready' : 'failed');
    } catch {
      setPricesState('failed');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const off = subscribeEntitlements(setSnap);
    setSnap(getEntitlements());
    // Renewal/expiry refresh triggers: screen open always re-verifies.
    void refreshEntitlements();
    void loadPrices();
    setNotice('');
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const planLabel = snap.plan === 'PRO' ? 'FRIDAY Pro' : snap.plan === 'PLUS' ? 'FRIDAY Plus' : 'FRIDAY Free';
  const stateNote = snap.state === 'confirmed' ? '' : snap.state === 'cached' ? ' (cached — server unreachable)' : ' (server unreachable)';
  const renewal = snap.subscription.expiryAt > 0
    ? new Date(snap.subscription.expiryAt).toLocaleDateString()
    : '';

  const tryPurchase = async (item: ProductItem, offer?: PlayOffer) => {
    if (!item?.productId) {
      setNotice('Subscriptions are not available yet.');
      return;
    }
    setBusy(true);
    setNotice('Verifying your subscription...');
    // Plan change (e.g. PRO monthly -> yearly): pass the current purchase
    // token so Play manages replacement. Old access stays until verified.
    let oldPurchaseToken: string | undefined;
    try {
      if ((snap.plan === 'PRO' || snap.plan === 'PLUS') && snap.state === 'confirmed') {
        const cur = await currentSubscriptionToken();
        if (cur && cur.productId !== item.productId) oldPurchaseToken = cur.purchaseToken;
      }
    } catch { /* plan-change best-effort */ }
    const r = await purchaseProduct(item.productId, offer ? { offer, oldPurchaseToken } : oldPurchaseToken ? { oldPurchaseToken } : undefined);
    setNotice(r.message);
    setBusy(false);
  };
  const onRestore = async () => {
    setBusy(true);
    setNotice('');
    const r = await restorePurchases();
    setNotice(r.message);
    setBusy(false);
  };

  const card = (title: string, features: string[], footer: React.ReactNode, highlight: boolean, current: boolean) => (
    <div
      className={`rounded-2xl border p-4 flex flex-col ${highlight ? 'bg-amber-500/10' : 'bg-slate-900/60'}`}
      style={{ borderColor: highlight ? currentTheme.primary : 'rgba(51,65,85,0.8)' }}
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-display font-bold text-slate-100">{title}</h3>
        {current && (
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded" style={{ backgroundColor: currentTheme.primary, color: '#020617' }}>
            CURRENT{snap.state !== 'confirmed' ? '*' : ''}
          </span>
        )}
      </div>
      <ul className="mt-2 space-y-1.5 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
            <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: currentTheme.primaryLight }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3">{footer}</div>
    </div>
  );

  const buyBtn = (plan: 'PRO' | 'PLUS', period: string, label: string) => {
    if (pricesState === 'loading') {
      return (
        <div className="w-full min-h-[44px] rounded-xl bg-slate-800/70 border border-slate-800 flex items-center justify-center text-xs font-mono text-slate-500 animate-pulse">
          Loading prices…
        </div>
      );
    }
    const item = products?.items.find((i) => i.plan === plan && i.period === period);
    if (!item) {
      return (
        <button
          type="button"
          onClick={() => void loadPrices()}
          className="w-full min-h-[44px] rounded-xl border border-amber-500/50 text-amber-300 font-bold text-sm"
        >
          Prices unavailable — Retry
        </button>
      );
    }
    const price = item.playPrice || item.price || '';
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void tryPurchase(item)}
        className="w-full min-h-[44px] rounded-xl font-bold text-sm transition disabled:opacity-50"
        style={{ backgroundColor: currentTheme.primary, color: '#020617' }}
      >
        {label}{price ? ` — ${price}` : ''}{item.badge ? ` · ${item.badge}` : ''}
      </button>
    );
  };

  /** Offer rows: only offers Play actually returned, described factually. */
  const offerRows = (plan: 'PRO' | 'PLUS', period: string) => {
    const item = products?.items.find((i) => i.plan === plan && i.period === period);
    const offers = item?.playOffers || [];
    if (offers.length < 2) return null; // default row already covers the base offer
    return (
      <div className="space-y-1.5">
        {offers.slice(1).map((o) => {
          const lines = describeOffer(o, item.playPrice || item.price);
          if (!lines) return null;
          return (
            <button
              key={o.offerToken || o.offerId}
              type="button"
              disabled={busy || !o.offerToken}
              onClick={() => void tryPurchase(item, o)}
              className="w-full text-left rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 transition disabled:opacity-50"
            >
              {lines.map((l) => (
                <div key={l} className="text-xs text-emerald-300 font-semibold">{l}</div>
              ))}
              <div className="text-[10px] text-slate-500 mt-0.5">Tap to buy with this offer</div>
            </button>
          );
        })}
      </div>
    );
  };

  /** Honest lifecycle line for the current verified subscription. */
  const statusLine = (() => {
    const st = snap.subscription.status || 'FREE';
    if (snap.plan === 'FREE' && (st === 'FREE' || !st)) return '';
    const planName = snap.plan === 'PLUS' ? 'Plus' : 'Pro';
    const dateStr = snap.subscription.expiryAt > 0 ? new Date(snap.subscription.expiryAt).toLocaleDateString() : '';
    const map: Record<string, string> = {
      PENDING: 'PENDING', ACCOUNT_HOLD: 'ACCOUNT_HOLD', PAUSED: 'PAUSED',
      CANCELLED: 'CANCELLED', EXPIRED: 'EXPIRED', REFUNDED: 'REFUNDED', REVOKED: 'REVOKED',
    };
    const ui = map[st] || (snap.plan === 'FREE' ? 'NOT_PURCHASED' : 'ACTIVE');
    if (ui === 'NOT_PURCHASED') return '';
    return lifecycleMessage(ui, planName, dateStr);
  })();

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
      onClick={onClose}
      role="dialog"
      aria-label="Upgrade FRIDAY"
    >
      <div
        className="friday-sheet w-full sm:max-w-lg rounded-2xl border border-amber-500/30 bg-gradient-to-br from-slate-900 to-slate-800 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display font-bold text-lg text-slate-100">Upgrade FRIDAY</h2>
          <button onClick={onClose} aria-label="Close subscription" className="p-2 text-slate-400 hover:text-white">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-1">
          CURRENT PLAN: {planLabel}{stateNote} · Status: {snap.subscriptionStatus}
          {renewal ? ` · Renews/expires: ${renewal}` : ''}
        </p>
        <p className="text-[11px] text-slate-500 mb-4">
          Devices: {snap.devicesUsed}{snap.maxDevices ? ` / ${snap.maxDevices}` : ''} · Entitlements verified server-side.
        </p>
        {pricesState === 'failed' && (
          <div className="mb-4 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
            <span>Prices load nahi ho paye (backend unreachable).</span>
            <button type="button" onClick={() => void loadPrices()} className="shrink-0 px-3 py-1.5 min-h-[44px] rounded-lg border border-amber-500/50 font-bold">
              Retry
            </button>
          </div>
        )}
        {statusLine && (
          <p className="mb-4 text-xs text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-xl px-3 py-2">{statusLine}</p>
        )}

        <div className="space-y-3">
          {card('FREE · ₹0', FREE_FEATURES, (
            <div className="text-xs font-mono text-slate-400">Always free · App Open Ads enabled</div>
          ), false, snap.plan === 'FREE')}
          {card('PRO', PRO_FEATURES, (
            <div className="space-y-2">
              {buyBtn('PRO', 'MONTHLY', 'Go Pro Monthly')}
              {offerRows('PRO', 'MONTHLY')}
              <div className="grid grid-cols-2 gap-2">
                {buyBtn('PRO', '3_MONTH', '3-Month')}
                {buyBtn('PRO', 'YEARLY', 'Yearly')}
              </div>
              {offerRows('PRO', '3_MONTH')}
              {offerRows('PRO', 'YEARLY')}
              <p className="text-[11px] text-slate-500">Ad-free FRIDAY. Google Play price is final at checkout.</p>
            </div>
          ), true, snap.plan === 'PRO')}
          {card('PLUS', PLUS_FEATURES, (
            <div className="space-y-2">
              {buyBtn('PLUS', 'MONTHLY', 'Go Plus Monthly')}
              {offerRows('PLUS', 'MONTHLY')}
              <div className="grid grid-cols-2 gap-2">
                {buyBtn('PLUS', '3_MONTH', '3-Month')}
                {buyBtn('PLUS', 'YEARLY', 'Yearly')}
              </div>
              {offerRows('PLUS', '3_MONTH')}
              {offerRows('PLUS', 'YEARLY')}
            </div>
          ), false, snap.plan === 'PLUS')}
        </div>

        {notice && (
          <p className="mt-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">{notice}</p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onRestore}
          className="mt-3 w-full min-h-[44px] rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4" /> Restore Purchases
        </button>
        <p className="mt-2 text-[10px] text-slate-500 text-center">
          {products && !products.paymentsConfigured ? 'Payments not configured yet — purchases unavailable.' : 'Purchases verified server-side when billing lands.'}
        </p>
      </div>
    </div>
  );
}
