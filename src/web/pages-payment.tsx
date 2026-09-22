import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageShell } from './layout';
import { formatINR, getOrderStatus, pollOrderStatus, type OrderQueryStatus } from '../services/PaymentService';
import { refreshEntitlements } from '../services/EntitlementService';

/**
 * Post-checkout landing (provider redirectUrl points here with ?orderId=).
 * NEVER declares success from the redirect — only from backend order status.
 */
export function PaymentStatusPage() {
  const [params] = useSearchParams();
  const orderId = (params.get('orderId') || '').slice(0, 128);
  const [status, setStatus] = useState<OrderQueryStatus | 'loading'>('loading');
  const [planId, setPlanId] = useState('');
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError('Order ID missing hai.');
      setStatus('failed');
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let alive = true;
    void (async () => {
      try {
        const first = await getOrderStatus(orderId);
        if (!alive || ctrl.signal.aborted) return;
        setPlanId(first.planId);
        setAmount(first.amount);
        if (first.status === 'success' || first.status === 'failed' || first.status === 'cancelled' || first.status === 'expired') {
          setStatus(first.status);
          if (first.status === 'success') {
            try { await refreshEntitlements(); } catch { /* plan refresh best-effort */ }
          }
          return;
        }
        setStatus('pending');
        const final = await pollOrderStatus(orderId, {
          timeoutMs: 180000,
          intervalMs: 3000,
          signal: ctrl.signal,
          onTick: (s) => { if (alive) setStatus(s); },
        });
        if (!alive || ctrl.signal.aborted) return;
        setStatus(final);
        if (final === 'success') {
          try { await refreshEntitlements(); } catch { /* best-effort */ }
        }
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'Status check nahi ho paya.');
        setStatus('failed');
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [orderId]);

  const planName = planId === 'pro' ? 'FRIDAY Pro' : planId === 'plus' ? 'FRIDAY Plus' : 'FRIDAY plan';

  return (
    <PageShell title="Payment status" description="FRIDAY payment verification status.">
      <div className="max-w-md mx-auto text-center">
        {!orderId || status === 'loading' || status === 'pending' || status === 'created' ? (
          <>
            <h1 className="font-display font-black text-2xl sm:text-3xl">Payment processing…</h1>
            <p className="mt-2 text-slate-400 text-sm">
              Payment verify ho rahi hai. Aapka plan confirmation ke baad automatically activate hoga.
            </p>
            {orderId && <p className="mt-3 font-mono text-xs text-slate-500">Order: {orderId}</p>}
            <div className="mt-4 h-2 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
              <div className="h-full w-1/2 rounded-full bg-amber-500 animate-pulse" />
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 px-5 py-2.5 min-h-[44px] rounded-xl border border-slate-700 font-bold text-sm"
            >
              Check Status
            </button>
          </>
        ) : status === 'success' ? (
          <>
            <h1 className="font-display font-black text-2xl sm:text-3xl text-emerald-300">Payment successful</h1>
            <p className="mt-2 text-slate-300 text-sm">{planName} is now active.</p>
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-left text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-400">Order ID</span><span className="font-mono">{orderId}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Plan</span><span className="font-bold">{planName}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Amount</span><span className="font-mono">{formatINR(amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Status</span><span className="text-emerald-300 font-bold">Verified active</span></div>
            </div>
            <Link to="/dashboard" className="mt-4 inline-block px-6 py-3 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-sm text-slate-950">
              Open FRIDAY
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-display font-black text-2xl sm:text-3xl">Payment was not completed.</h1>
            <p className="mt-2 text-slate-400 text-sm">
              {status === 'expired' ? 'Order expire ho gaya.' : status === 'cancelled' ? 'Payment cancel ho gayi.' : (error || 'Koi paid plan activate nahi hua.')}
            </p>
            {orderId && <p className="mt-3 font-mono text-xs text-slate-500">Order: {orderId}</p>}
            <Link to="/upgrade" className="mt-4 inline-block px-6 py-3 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-sm text-slate-950">
              Try Again
            </Link>
          </>
        )}
      </div>
    </PageShell>
  );
}
