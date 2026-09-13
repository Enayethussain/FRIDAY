import React from 'react';
import { XCircle } from 'lucide-react';

export interface MoreAction {
  id: string;
  label: string;
  icon: string;
  onOpen: () => void;
}

interface HUDMoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
  actions: MoreAction[];
}

/** Mobile-first bottom sheet: saare FRIDAY panels ek "More" menu me. */
export function HUDMoreMenu({ isOpen, onClose, actions }: HUDMoreMenuProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[80vh] overflow-y-auto bg-gradient-to-br from-slate-900/98 to-slate-800/98 rounded-t-3xl sm:rounded-2xl border border-cyan-500/30 p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-white">⋯ More — saare features</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white" aria-label="Close menu"><XCircle className="w-6 h-6" /></button>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">Tap karo — panel khul jayega. Sab kuch working hai.</p>
        <div className="grid grid-cols-3 gap-2.5">
          {actions.map((a) => (
            <button
              key={a.id}
              onClick={() => { a.onOpen(); onClose(); }}
              className="flex flex-col items-center gap-1.5 py-3.5 px-1 rounded-2xl bg-slate-800/70 border border-slate-700 active:border-cyan-400 active:bg-cyan-500/10 text-slate-100"
            >
              <span className="text-2xl leading-none">{a.icon}</span>
              <span className="text-[11px] font-semibold text-center leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
