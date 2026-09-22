import { useSyncExternalStore } from 'react';
import { getEntitlements, hasEntitlement, subscribeEntitlements } from '../services/EntitlementService';

/** Central hook — use this instead of scattering plan checks. */
export function useEntitlement(feature: string): { allowed: boolean; plan: string; state: string } {
  const snap = useSyncExternalStore(subscribeEntitlements, getEntitlements, getEntitlements);
  return { allowed: hasEntitlement(feature), plan: snap.plan, state: snap.state };
}

interface UpgradePromptProps {
  isOpen: boolean;
  featureLabel: string;
  requiredPlan: 'PRO' | 'PLUS';
  onViewPlans: () => void;
  onLater: () => void;
}

/** Shown when a FREE user taps a PRO/PLUS feature. Never executes the feature. */
export function UpgradePrompt({ isOpen, featureLabel, requiredPlan, onViewPlans, onLater }: UpgradePromptProps) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
      onClick={onLater}
      role="dialog"
      aria-label="Upgrade required"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-amber-500/40 bg-gradient-to-br from-slate-900 to-slate-800 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-[10px] font-mono font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: requiredPlan === 'PLUS' ? '#7c3aed' : '#f59e0b', color: '#fff' }}
          >
            {requiredPlan}
          </span>
          <h3 className="font-display font-bold text-slate-100">{featureLabel}</h3>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">
          {featureLabel} {requiredPlan === 'PLUS' ? 'FRIDAY Plus' : 'FRIDAY Pro'} me available hai, Sir.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onViewPlans}
            className="flex-1 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition"
          >
            {requiredPlan === 'PLUS' ? 'View Plus' : 'View Pro'}
          </button>
          <button
            type="button"
            onClick={onLater}
            className="flex-1 min-h-[44px] rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-sm transition"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

/** Consistent PRO/PLUS badge for premium features. */
export function PlanBadge({ plan }: { plan: 'PRO' | 'PLUS' }) {
  return (
    <span
      className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ml-1.5 align-middle"
      style={{ backgroundColor: plan === 'PLUS' ? '#7c3aed33' : '#f59e0b33', color: plan === 'PLUS' ? '#c4b5fd' : '#fcd34d', border: `1px solid ${plan === 'PLUS' ? '#7c3aed88' : '#f59e0b88'}` }}
    >
      {plan}
    </span>
  );
}
