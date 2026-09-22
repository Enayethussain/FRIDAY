import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, ShieldCheck, X, Volume2, VolumeX, Moon } from 'lucide-react';
import { ProactiveAssistantEngine } from '../services/ProactiveAssistantEngine';
import { ScreenContextService } from '../services/ScreenContextService';
import { THEMES } from '../utils/theme';
import { ThemeAccent } from '../types';

interface HUDScreenAssistProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeAccent;
  onChanged?: (on: boolean) => void;
}

export function HUDScreenAssist({ isOpen, onClose, theme, onChanged }: HUDScreenAssistProps) {
  const currentTheme = THEMES[theme] || THEMES.amber;
  const [assistOn, setAssistOn] = useState(false);
  const [mode, setMode] = useState<'app' | 'smart'>('smart');
  const [voice, setVoice] = useState(true);
  const [hasPerm, setHasPerm] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMsg('');
    ScreenContextService.hasPermission().then(setHasPerm).catch(() => setHasPerm(false));
    const cfg = ProactiveAssistantEngine.getConfig();
    setAssistOn(ProactiveAssistantEngine.isAssistOn());
    setMode(cfg.screenAwareness === 'app' ? 'app' : 'smart');
    setVoice(cfg.proactiveVoice);
  }, [isOpen]);

  if (!isOpen) return null;

  const toggle = async () => {
    setBusy(true);
    setMsg('');
    try {
      if (!assistOn) {
        if (!hasPerm) {
          setMsg('Pehle Usage Access permission do, phir Screen Assist on karo.');
          await ScreenContextService.openSettings();
          return;
        }
        const ok = await ProactiveAssistantEngine.setAssistEnabled(true, mode);
        if (!ok) {
          setMsg('Screen Assist on nahi hua. Usage permission check karo.');
          return;
        }
        ProactiveAssistantEngine.updateConfig({ proactiveVoice: voice });
        setAssistOn(true);
        onChanged?.(true);
        setMsg('Screen Assist ON. Indicator dikhega jab active ho.');
      } else {
        await ProactiveAssistantEngine.setAssistEnabled(false);
        setAssistOn(false);
        onChanged?.(false);
        setMsg('Screen Assist OFF. Watching poori tarah band.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div
        className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border shadow-2xl"
        style={{ backgroundColor: '#090e1a', borderColor: `${currentTheme.primary}44` }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/60 sticky top-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg border" style={{ borderColor: `${currentTheme.primary}44`, color: currentTheme.primary }}>
              {assistOn ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white font-mono">SCREEN ASSIST</h2>
              <p className="text-[10px] text-slate-400 font-mono">{assistOn ? '● ACTIVE — sirf aapke control me' : '○ OFF — kuch watch nahi ho raha'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className={`p-3 rounded-xl border text-[11px] font-mono ${assistOn ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-slate-800/50 border-slate-700 text-slate-300'}`}>
            {assistOn
              ? 'Screen Assist ACTIVE hai. Sirf kaun sa app khula hai — ye detect hota hai. Screen record, screenshot save ya server upload NAHI hota.'
              : 'Screen Assist OFF hai. FRIDAY aapki screen nahi dekh raha. On karne par hi app detection chalega.'}
          </div>

          <button
            onClick={toggle}
            disabled={busy}
            className={`w-full py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50 ${assistOn ? 'bg-red-600' : 'bg-emerald-600'}`}
          >
            {assistOn ? 'Screen Assist Band Karo' : 'Screen Assist On Karo'}
          </button>

          <div>
            <p className="text-xs text-slate-400 font-mono font-bold mb-2">MODE</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setMode('app'); ProactiveAssistantEngine.updateConfig({ screenAwareness: 'app' }); }}
                className={`py-2 rounded-lg text-xs font-mono border ${mode === 'app' ? 'text-white' : 'text-slate-400 border-slate-700 bg-slate-800/50'}`}
                style={mode === 'app' ? { backgroundColor: `${currentTheme.primary}33`, borderColor: currentTheme.primary } : {}}
              >
                App Awareness
                <span className="block text-[10px] opacity-70">sirf app ka naam</span>
              </button>
              <button
                onClick={() => { setMode('smart'); ProactiveAssistantEngine.updateConfig({ screenAwareness: 'smart' }); }}
                className={`py-2 rounded-lg text-xs font-mono border ${mode === 'smart' ? 'text-white' : 'text-slate-400 border-slate-700 bg-slate-800/50'}`}
                style={mode === 'smart' ? { backgroundColor: `${currentTheme.primary}33`, borderColor: currentTheme.primary } : {}}
              >
                Smart Awareness
                <span className="block text-[10px] opacity-70">app + context</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700">
            <span className="text-xs text-slate-300 font-mono flex items-center gap-2">
              {voice ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />} Proactive voice
            </span>
            <button
              onClick={() => { const v = !voice; setVoice(v); ProactiveAssistantEngine.updateConfig({ proactiveVoice: v }); }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold ${voice ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              {voice ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700">
            <span className="text-xs text-slate-300 font-mono">Usage Access permission</span>
            {hasPerm
              ? <span className="text-xs text-emerald-400 font-mono font-bold">GRANTED</span>
              : <button onClick={() => ScreenContextService.openSettings()} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold">Enable</button>}
          </div>

          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-1">
            <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Banking, payment, OTP aur password apps kabhi watch nahi hote.</p>
            <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5"><Moon className="w-3.5 h-3.5 text-slate-500" /> Raat 11–7 quiet hours me FRIDAY khud nahi bolega.</p>
          </div>

          {msg && <p className="text-xs text-amber-300 font-mono">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
