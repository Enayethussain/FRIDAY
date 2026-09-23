import React, { useEffect, useState } from 'react';
import { XCircle, Check, Loader2 } from 'lucide-react';
import { getEntitlements, refreshEntitlements, subscribeEntitlements, type EntitlementSnapshot } from '../services/EntitlementService';
import { lifecycleMessage } from '../services/BillingService';
import { getPayPlans, createEkqrOrder, openCheckoutUrl, pollOrderStatus, getMyOrders, formatINR, type BillingPeriod, type OrderHistoryItem } from '../services/PaymentService';
import type { ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

const SUPPORT_EMAIL = (import.meta as any).env?.VITE_CONTACT_EMAIL || '';
const SUPPORT_URL = (import.meta as any).env?.VITE_SUPPORT_URL || '';
/** Graceful fallback: instructions + support contact, never Google Play. */
function supportSuffix(): string {
  if (SUPPORT_EMAIL && SUPPORT_URL) return ` Support: ${SUPPORT_EMAIL} / ${SUPPORT_URL}.`;
  if (SUPPORT_EMAIL) return ` Support: ${SUPPORT_EMAIL}.`;
  if (SUPPORT_URL) return ` Support: ${SUPPORT_URL}.`;
  return ' Apna Order ID note karke support se sampark karo.';
}

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
  /**
   * Default fallback pricing, initialized directly in component state so plan
   * buttons ALWAYS render with prices even if the backend never responds.
   * Live backend values overwrite these when the fetch succeeds.
   */
  const [payPrices, setPayPrices] = useState<Record<'plus' | 'pro', Record<BillingPeriod, number>>>({
    pro: { monthly: 99, '3_month': 249, yearly: 799 },
    plus: { monthly: 199, '3_month': 499, yearly: 1499 },
  });
  const [pricesLoading, setPricesLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderHistoryItem[] | null>(null);

  const loadPrices = async () => {
    setPricesLoading(true);
    try {
      const p = await getPayPlans();
      const table = p?.prices;
      const ok = table && ['plus', 'pro'].every((pl) =>
        ['monthly', '3_month', 'yearly'].every((per) => Number((table as any)?.[pl]?.[per]) > 0)
      );
      // Backend reachable: live prices win. Unreachable/invalid: keep the
      // defaults above — buttons stay enabled, no error banner for pricing.
      if (ok && table) setPayPrices(table as Record<'plus' | 'pro', Record<BillingPeriod, number>>);
    } catch {
      // Immediately stop loading; defaults already render. Never disable buys.
    } finally {
      setPricesLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const off = subscribeEntitlements(setSnap);
    setSnap(getEntitlements());
    // Renewal/expiry refresh triggers: screen open always re-verifies.
    void refreshEntitlements();
    void loadPrices();
    void getMyOrders().then(setOrders).catch(() => setOrders([]));
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

  /** EKQR UPI purchase: order -> open UPI app/pay page -> poll verified status. */
  const tryPurchase = async (plan: 'plus' | 'pro', period: BillingPeriod) => {
    const key = `${plan}:${period}`;
    if (busyKey) return;
    setBusyKey(key);
    setNotice('');
    try {
      const order = await createEkqrOrder(plan, period);
      setNotice(`Order ${order.orderId} bana — UPI app me payment complete karo. Verify hote hi plan activate hoga.`);
      openCheckoutUrl(order.checkoutUrl);
      const final = await pollOrderStatus(order.orderId, {
        timeoutMs: 180000,
        intervalMs: 3000,
        onTick: (s) => {
          if (s === 'pending' || s === 'created') {
            setNotice('Payment verify ho rahi hai. Plan confirmation ke baad automatically activate hoga.');
          }
        },
      });
      if (final === 'success') {
        await refreshEntitlements().catch(() => null);
        setNotice(`Payment successful — FRIDAY ${plan === 'pro' ? 'Pro' : 'Plus'} active ho gaya.`);
      } else if (final === 'failed') {
        setNotice('Payment was not completed. Koi plan activate nahi hua — Try Again.');
      } else if (final === 'cancelled') {
        setNotice('Payment cancel ho gayi. Koi charge nahi hua.');
      } else if (final === 'expired') {
        setNotice('Order expire ho gaya. Dobara try karo.');
      } else {
        setNotice('Payment is being verified. Plan confirmation ke baad automatically activate hoga.');
      }
      void getMyOrders().then(setOrders).catch(() => {});
    } catch (e: any) {
      const base = e?.message || 'Payment order create nahi ho paya.';
      setNotice(`${base} UPI app khula nahi to dobara Try karo, ya GPay / PhonePe / Paytm se manual retry karo.${supportSuffix()}`);
      try {
        window.alert(`${base}\n\nPayment link generate nahi ho paya. Dobara Try karo ya GPay / PhonePe / Paytm se retry karo.${supportSuffix()}`);
      } catch { /* alert best-effort (WebView) */ }
    } finally {
      setBusyKey(null);
    }
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

  const periodLabel: Record<BillingPeriod, string> = { monthly: 'month', '3_month': '3 months', yearly: 'year' };

  const buyBtn = (plan: 'plus' | 'pro', period: BillingPeriod, label: string) => {
    const key = `${plan}:${period}`;
    // payPrices always holds defaults, so buttons render with prices even
    // when the backend never responds. Buttons are never disabled by this.
    const price = Number(payPrices?.[plan]?.[period]) || 0;
    const busy = busyKey === key;
    let inr = `₹${price}`;
    try {
      inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);
    } catch { /* fallback above */ }
    return (
      <button
        type="button"
        disabled={busy || busyKey !== null}
        onClick={() => void tryPurchase(plan, period)}
        aria-label={`${label}, ${inr} per ${periodLabel[period]}`}
        className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-sm text-slate-950 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {busy ? 'Creating secure order…' : `${label} — ${inr}/${periodLabel[period]}`}
      </button>
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
        {statusLine && (
          <p className="mb-4 text-xs text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-xl px-3 py-2">{statusLine}</p>
        )}

        <div className="space-y-3">
          {card('FREE · ₹0', FREE_FEATURES, (
            <div className="text-xs font-mono text-slate-400">Always free · App Open Ads enabled</div>
          ), false, snap.plan === 'FREE')}
          {card('PRO', PRO_FEATURES, (
            <div className="space-y-2">
              {buyBtn('pro', 'monthly', 'Go Pro Monthly')}
              <div className="grid grid-cols-2 gap-2">
                {buyBtn('pro', '3_month', '3-Month')}
                {buyBtn('pro', 'yearly', 'Yearly')}
              </div>
              <p className="text-[11px] text-slate-500">Ad-free FRIDAY. Pay securely with UPI — plan activates after verification.</p>
            </div>
          ), true, snap.plan === 'PRO')}
          {card('PLUS', PLUS_FEATURES, (
            <div className="space-y-2">
              {buyBtn('plus', 'monthly', 'Go Plus Monthly')}
              <div className="grid grid-cols-2 gap-2">
                {buyBtn('plus', '3_month', '3-Month')}
                {buyBtn('plus', 'yearly', 'Yearly')}
              </div>
            </div>
          ), false, snap.plan === 'PLUS')}
        </div>

        {notice && (
          <p className="mt-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">{notice}</p>
        )}
        <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="font-bold text-sm text-slate-100 mb-2">Order History</h3>
          {orders === null ? (
            <p className="text-xs font-mono text-slate-500 animate-pulse">Loading orders…</p>
          ) : orders.length === 0 ? (
            <p className="text-xs text-slate-500">Koi order nahi hai.</p>
          ) : (
            <ul className="space-y-1.5">
              {orders.map((o) => (
                <li key={o.orderId} className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-300 border-b border-slate-800/60 last:border-0 pb-1.5">
                  <span className="truncate max-w-[140px]">{o.orderId}</span>
                  <span>{o.planId} · {formatINR(o.amount)}</span>
                  <span className={o.status === 'fulfilled' || o.status === 'success' ? 'text-emerald-300 font-bold' : 'text-slate-400'}>{o.status}</span>
                  <span className="text-slate-500">{new Date(o.createdAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-2 text-[10px] text-slate-500 text-center">
          Secure UPI checkout — plan activates only after verified payment.
        </p>
      </div>
    </div>
  );
}
