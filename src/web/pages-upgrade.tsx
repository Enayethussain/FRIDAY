import { useEffect, useState } from 'react';
import { PageShell } from './layout';
import { PLANS, PLAN_ORDER, type WebPlanId } from './plans';
import { getEntitlements, refreshEntitlements } from '../services/EntitlementService';
import { createOrder, getPaymentPlans, loadPayer, savePayer, validatePayer, normMobile, type PayPlan } from '../services/PaymentService';

const SUPPORT_EMAIL = (import.meta as any).env?.VITE_CONTACT_EMAIL || '';
const SUPPORT_URL = (import.meta as any).env?.VITE_SUPPORT_URL || '';
function supportSuffix(): string {
  if (SUPPORT_EMAIL && SUPPORT_URL) return ` Support: ${SUPPORT_EMAIL} / ${SUPPORT_URL}.`;
  if (SUPPORT_EMAIL) return ` Support: ${SUPPORT_EMAIL}.`;
  if (SUPPORT_URL) return ` Support: ${SUPPORT_URL}.`;
  return ' Apna plan selection note karke support se sampark karo.';
}

type ServerPlan = 'FREE' | 'PRO' | 'PLUS';

function toWebPlan(serverPlan: string): WebPlanId {
  const p = (serverPlan || '').toUpperCase();
  if (p === 'PRO') return 'pro';
  if (p === 'PLUS') return 'plus';
  return 'free';
}

const COMPARISON: { feature: string; free: boolean; plus: boolean; pro: boolean }[] = [
  { feature: 'FRIDAY AI Chat', free: true, plus: true, pro: true },
  { feature: 'Voice Interaction', free: true, plus: true, pro: true },
  { feature: 'Orb / HUD + basic gestures', free: true, plus: true, pro: true },
  { feature: 'Memory, vault, FRIDAY Share (basic)', free: true, plus: true, pro: true },
  { feature: 'Ad-free experience', free: false, plus: true, pro: true },
  { feature: 'JARVIS voice + advanced controls', free: false, plus: true, pro: true },
  { feature: 'Screen awareness (permission-gated)', free: false, plus: true, pro: true },
  { feature: 'Hologram / 3D + App Builder', free: false, plus: false, pro: true },
  { feature: 'Protocols + knowledge graph', free: false, plus: false, pro: true },
  { feature: '3D model upload + early access', free: false, plus: false, pro: true },
];

const FAQS: [string, string][] = [
  ['What is FRIDAY Plus?', 'Plus removes ads and unlocks the JARVIS voice, advanced phone controls, screen awareness and higher AI limits.'],
  ['What is FRIDAY Pro?', 'Pro includes everything in Plus, plus holograms, App Builder, automation protocols, model upload and the highest limits.'],
  ['Can I upgrade later?', 'Yes. Your chats, memory, vault and settings stay intact when your plan changes.'],
  ['How does billing work?', 'Pay securely with UPI on the provider checkout page. Your plan activates automatically after backend verification — never from a button click.'],
];

export function UpgradePage() {
  const [current, setCurrent] = useState<WebPlanId>('free');
  const [planChecked, setPlanChecked] = useState(false);
  const [notice, setNotice] = useState('');
  const [busyPlan, setBusyPlan] = useState<WebPlanId | null>(null);
  const [payPlans, setPayPlans] = useState<PayPlan[]>([]);
  const [payConfigured, setPayConfigured] = useState(false);
  const [payerName, setPayerName] = useState(() => { try { return loadPayer().name; } catch { return ''; } });
  const [payerMobile, setPayerMobile] = useState(() => { try { return loadPayer().mobile; } catch { return ''; } });
  const [payerEmail, setPayerEmail] = useState(() => { try { return loadPayer().email || ''; } catch { return ''; } });

  useEffect(() => {
    let alive = true;
    void refreshEntitlements()
      .catch(() => null)
      .then(() => {
        if (!alive) return;
        try {
          setCurrent(toWebPlan(getEntitlements().plan as ServerPlan));
        } catch { /* keep Free default */ }
        setPlanChecked(true);
      });
    // Backend plan prices (single source). Placeholders stay until loaded.
    void getPaymentPlans()
      .then((p) => {
        if (!alive) return;
        setPayPlans(p.plans);
        setPayConfigured(p.configured);
      })
      .catch(() => null);
    return () => { alive = false; };
  }, []);

  const priceLabelFor = (id: WebPlanId): string => {
    if (id === 'free') return PLANS.free.priceLabel;
    const p = payPlans.find((x) => x.planId === id);
    if (!p) return PLANS[id].priceLabel; // placeholder until backend responds
    try {
      const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: p.currency, maximumFractionDigits: 0 }).format(p.amount);
      return `${inr} / ${p.duration_days} days`;
    } catch {
      return `₹${p.amount} / ${p.duration_days} days`;
    }
  };

  const onUpgradeClick = async (plan: WebPlanId) => {
    if (plan === current || plan === 'free') return;
    if (!payConfigured) {
      setNotice(`Secure UPI payment via EKQR (GPay, PhonePe, Paytm) abhi active nahi hai. Dobara try karo.${supportSuffix()}`);
      return;
    }
    const payerErr = validatePayer({ name: payerName, mobile: payerMobile, email: payerEmail });
    if (payerErr) {
      const help = `${payerErr} Pehle neeche Naam + Mobile likho, phir upgrade dabao.${supportSuffix()}`;
      setNotice(help);
      try { window.alert(help); } catch { /* alert best-effort */ }
      return;
    }
    savePayer({ name: payerName.trim(), mobile: payerMobile, email: payerEmail.trim() });
    setNotice('');
    setBusyPlan(plan);
    try {
      const order = await createOrder(plan, { name: payerName.trim(), mobile: normMobile(payerMobile), email: payerEmail.trim() });
      // Leave FRIDAY for the provider pay page (UPI intent on mobile,
      // dynamic QR on desktop). Verification happens server-side on return.
      window.location.href = order.checkoutUrl;
    } catch (e: any) {
      const base = e?.message || 'Payment order create nahi ho paya.';
      const help = `${base} UPI app khula nahi to dobara Try karo, ya GPay / PhonePe / Paytm se manual retry karo.${supportSuffix()}`;
      setNotice(help);
      try {
        window.alert(help);
      } catch { /* alert best-effort */ }
      setBusyPlan(null);
    }
  };

  const buttonFor = (plan: WebPlanId) => {
    if (plan === 'free') return null;
    if (current === plan) {
      return (
        <span className="block text-center px-4 py-2.5 min-h-[44px] rounded-xl border border-emerald-500/60 text-emerald-300 font-bold text-sm">
          Current Plan
        </span>
      );
    }
    const label = plan === 'plus' ? 'Upgrade to Plus' : 'Upgrade to Pro';
    const busy = busyPlan === plan;
    return (
      <button
        type="button"
        onClick={() => void onUpgradeClick(plan)}
        disabled={busy}
        aria-label={label}
        className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-amber-300 font-bold text-sm text-slate-950 transition disabled:opacity-50"
      >
        {busy ? 'Creating secure order…' : label}
      </button>
    );
  };

  const currentLabel = current === 'free' ? 'FREE' : current === 'plus' ? 'PLUS' : 'PRO';

  return (
    <PageShell title="Upgrade" description="Upgrade FRIDAY — compare Free, Plus and Pro plans.">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="font-display font-black text-3xl sm:text-4xl">Upgrade FRIDAY</h1>
        <p className="mt-2 text-slate-400">Unlock more powerful FRIDAY features with Plus and Pro.</p>
        <p className="mt-3 inline-block text-xs font-mono px-3 py-1.5 rounded-full border border-slate-700 text-slate-300" aria-live="polite">
          {planChecked ? `CURRENT PLAN: ${currentLabel}` : 'Checking current plan…'}
        </p>
      </div>

      <div className="max-w-2xl mx-auto mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="font-bold text-sm text-slate-100 mb-1">UPI payment details <span className="font-mono font-normal text-slate-500">(EkQR receipt ke liye — upgrade se pehle bhoro)</span></h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
            placeholder="Apna naam *"
            autoComplete="name"
            maxLength={60}
            className="px-3 py-2.5 min-h-[44px] rounded-xl bg-black/40 border border-slate-800 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
          <input
            value={payerMobile}
            onChange={(e) => setPayerMobile(e.target.value)}
            placeholder="10-digit mobile *"
            autoComplete="tel"
            inputMode="numeric"
            maxLength={13}
            className="px-3 py-2.5 min-h-[44px] rounded-xl bg-black/40 border border-slate-800 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
          <input
            value={payerEmail}
            onChange={(e) => setPayerEmail(e.target.value)}
            placeholder="Email *"
            autoComplete="email"
            inputMode="email"
            maxLength={80}
            className="px-3 py-2.5 min-h-[44px] rounded-xl bg-black/40 border border-slate-800 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mt-8">
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const isCurrent = current === id;
          return (
            <div
              key={id}
              className={`rounded-2xl border p-5 flex flex-col ${isCurrent ? 'border-emerald-500/60 bg-emerald-500/5' : id === 'pro' ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800 bg-slate-900/50'}`}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-lg">{p.name}</h2>
                {isCurrent && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500 text-slate-950">CURRENT PLAN</span>
                )}
              </div>
              <div className="font-mono text-2xl font-bold mt-1">{priceLabelFor(id)}</div>
              <p className="mt-1 text-sm text-slate-400">{p.tagline}</p>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-300 flex-1">
                {p.features.map((f) => <li key={f}>✓ {f}</li>)}
              </ul>
              <div className="mt-4">
                {id === 'free' ? (
                  isCurrent ? (
                    <span className="block text-center px-4 py-2.5 min-h-[44px] rounded-xl border border-emerald-500/60 text-emerald-300 font-bold text-sm">Current Plan</span>
                  ) : (
                    <span className="block text-center px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-700 text-slate-400 font-bold text-sm">Free forever</span>
                  )
                ) : buttonFor(id)}
              </div>
            </div>
          );
        })}
      </div>

      {notice && (
        <p role="status" className="mt-4 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-center">
          {notice}
        </p>
      )}

      <h2 className="font-display font-bold text-xl mt-12 mb-4 text-center">Compare plans</h2>
      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="text-left font-semibold p-3">Feature</th>
              <th className="p-3 text-center">Free</th>
              <th className="p-3 text-center">Plus</th>
              <th className="p-3 text-center">Pro</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row) => (
              <tr key={row.feature} className="border-b border-slate-800/60 last:border-0">
                <td className="p-3 text-slate-300">{row.feature}</td>
                {([row.free, row.plus, row.pro] as boolean[]).map((has, i) => (
                  <td key={i} className={`p-3 text-center font-bold ${has ? 'text-emerald-400' : 'text-slate-600'}`} aria-label={has ? 'Included' : 'Not included'}>
                    {has ? '✓' : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-display font-bold text-xl mt-12 mb-4 text-center">FAQ</h2>
      <div className="space-y-3 max-w-2xl mx-auto">
        {FAQS.map(([q, a]) => (
          <div key={q} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="font-bold text-slate-100">{q}</h3>
            <p className="mt-1 text-sm text-slate-400 leading-relaxed">{a}</p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
