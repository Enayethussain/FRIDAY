import React from 'react';
import { XCircle } from 'lucide-react';
import { PlanBadge } from './UpgradePrompt';

export interface MoreAction {
  id: string;
  label: string;
  icon: string;
  badge?: 'PRO' | 'PLUS';
  onOpen: () => void;
}

export interface MoreSection {
  title: string;
  actions: MoreAction[];
}

interface HUDMoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
  sections: MoreSection[];
}

/** Mobile-first bottom sheet: categorized FRIDAY panels (all real features). */
export function HUDMoreMenu({ isOpen, onClose, sections }: HUDMoreMenuProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="friday-sheet w-full sm:max-w-lg bg-gradient-to-br from-slate-900/98 to-slate-800/98 rounded-t-3xl sm:rounded-2xl border border-amber-500/30 p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="More features menu"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-white">⋯ More</h2>
          <button onClick={onClose} className="p-2 min-w-[44px] min-h-[44px] text-slate-400 hover:text-white" aria-label="Close menu"><XCircle className="w-6 h-6" /></button>
        </div>
        {sections.map((s) => (
          <div key={s.title} className="mt-4 first:mt-2">
            <h3 className="text-[11px] font-mono uppercase tracking-widest text-amber-400/90 mb-2">{s.title}</h3>
            <div className="friday-more-grid">
              {s.actions.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { a.onOpen(); onClose(); }}
                  aria-label={a.label}
                  className="flex flex-col items-center gap-1.5 py-3.5 px-1 rounded-2xl bg-slate-800/70 border border-slate-700 active:border-amber-400 active:bg-amber-500/10 text-slate-100"
                >
                  <span className="text-2xl leading-none" aria-hidden="true">{a.icon}</span>
                  <span className="text-[11px] font-semibold text-center leading-tight">
                    {a.label}
                    {a.badge && <PlanBadge plan={a.badge} />}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
