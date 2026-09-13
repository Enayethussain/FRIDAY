import React, { useState, useEffect } from 'react';
import {
  Calculator as CalcIcon,
  X,
  RotateCcw,
  Copy,
  Check,
  Sparkles,
  History,
  Equal,
} from 'lucide-react';
import { CalculationHistoryItem, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';
import { SoundEffects } from '../utils/SoundEffects';

interface HUDCalculatorProps {
  isOpen: boolean;
  theme: ThemeAccent;
  initialExpression?: string;
  onClose: () => void;
}

export const HUDCalculator: React.FC<HUDCalculatorProps> = ({
  isOpen,
  theme,
  initialExpression = '',
  onClose,
}) => {
  const currentTheme = THEMES[theme] || THEMES.cyan;

  const [expression, setExpression] = useState(initialExpression);
  const [result, setResult] = useState('');
  const [history, setHistory] = useState<CalculationHistoryItem[]>([
    {
      id: 'calc-init-1',
      expression: '450 * 18 / 2.5',
      result: '3240',
      timestamp: Date.now() - 300000,
    },
    {
      id: 'calc-init-2',
      expression: 'sqrt(144) * 8',
      result: '96',
      timestamp: Date.now() - 600000,
    },
  ]);
  const [copied, setCopied] = useState(false);
  const [isScientific, setIsScientific] = useState(true);

  useEffect(() => {
    if (initialExpression) {
      setExpression(initialExpression);
      evaluateExpression(initialExpression);
    }
  }, [initialExpression]);

  if (!isOpen) return null;

  const sanitizeAndEvaluate = (expr: string): string => {
    try {
      let clean = expr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/π/g, 'Math.PI')
        .replace(/sqrt\(/g, 'Math.sqrt(')
        .replace(/sin\(/g, 'Math.sin(')
        .replace(/cos\(/g, 'Math.cos(')
        .replace(/tan\(/g, 'Math.tan(')
        .replace(/log\(/g, 'Math.log10(')
        .replace(/ln\(/g, 'Math.log(')
        .replace(/\^/g, '**');

      // Only allow safe math tokens
      if (!/^[0-9+\-*/().\s,MathPIsqrtsincostanlogeE**]+$/.test(clean)) {
        return 'Syntax Error';
      }

      // eslint-disable-next-line no-new-func
      const evalResult = Function(`"use strict"; return (${clean});`)();
      if (typeof evalResult === 'number' && !isNaN(evalResult)) {
        return Number.isInteger(evalResult)
          ? evalResult.toString()
          : parseFloat(evalResult.toFixed(8)).toString();
      }
      return 'Error';
    } catch {
      return 'Syntax Error';
    }
  };

  const evaluateExpression = (exprToEval?: string) => {
    const target = exprToEval || expression;
    if (!target.trim()) return;

    SoundEffects.playSubtleBeep();
    const res = sanitizeAndEvaluate(target);
    setResult(res);

    if (res !== 'Syntax Error' && res !== 'Error') {
      const newItem: CalculationHistoryItem = {
        id: `calc-${Date.now()}`,
        expression: target,
        result: res,
        timestamp: Date.now(),
      };
      setHistory((prev) => [newItem, ...prev.slice(0, 9)]);
    }
  };

  const handleButtonClick = (val: string) => {
    SoundEffects.playSubtleBeep();
    if (val === '=') {
      evaluateExpression();
    } else if (val === 'C') {
      setExpression('');
      setResult('');
    } else if (val === 'DEL') {
      setExpression((prev) => prev.slice(0, -1));
    } else {
      setExpression((prev) => prev + val);
    }
  };

  const handleCopyResult = () => {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    SoundEffects.playCurriculumUpdated();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUseHistory = (item: CalculationHistoryItem) => {
    SoundEffects.playSubtleBeep();
    setExpression(item.expression);
    setResult(item.result);
  };

  return (
    <div
      id="hud-calculator-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="hud-calculator-modal"
        className="w-full max-w-lg bg-[#080d19] border rounded-2xl flex flex-col shadow-2xl relative overflow-hidden font-mono"
        style={{
          borderColor: `${currentTheme.primary}77`,
          boxShadow: `0 0 50px rgba(0,0,0,0.9), 0 0 35px ${currentTheme.primary}25`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#050812]">
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-xl border flex items-center justify-center"
              style={{
                borderColor: `${currentTheme.primary}66`,
                background: `${currentTheme.primary}18`,
                color: currentTheme.primaryLight,
              }}
            >
              <CalcIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-slate-100 text-base">
                  STARK HOLOGRAPHIC CALCULATOR
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-400">
                  VOICE ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Mathematical core & instant real-time telemetry solver
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsScientific(!isScientific)}
              className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-[11px] text-slate-300 hover:text-white"
            >
              {isScientific ? 'Standard' : 'Scientific'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Voice Prompt Shortcut */}
        <div className="px-5 py-2 bg-slate-900/60 border-b border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-400">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>Voice: Say <strong className="text-slate-200">"FRIDAY, calculate (450 * 18) / 2.5"</strong> or <strong className="text-slate-200">"FRIDAY, open calculator"</strong></span>
        </div>

        {/* Digital Hologram Display */}
        <div className="p-5 bg-[#03060d] border-b border-slate-800 flex flex-col items-end justify-center min-h-[110px]">
          <div className="w-full text-right text-slate-400 text-sm font-mono tracking-wider truncate mb-1">
            {expression || '0'}
          </div>
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={handleCopyResult}
              disabled={!result}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400 hover:text-slate-200 disabled:opacity-30 cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <div
              className="text-2xl sm:text-3xl font-bold font-mono tracking-wider truncate"
              style={{ color: currentTheme.primaryLight }}
            >
              {result ? `= ${result}` : '—'}
            </div>
          </div>
        </div>

        {/* Calculator Main Grid & History Drawer */}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-[#060a15]">
          {/* Keypad */}
          <div className="sm:col-span-2 space-y-2">
            {isScientific && (
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {[
                  { label: 'sin', val: 'sin(' },
                  { label: 'cos', val: 'cos(' },
                  { label: 'tan', val: 'tan(' },
                  { label: 'sqrt', val: 'sqrt(' },
                  { label: 'log', val: 'log(' },
                  { label: 'ln', val: 'ln(' },
                  { label: '^', val: '^' },
                  { label: 'π', val: 'π' },
                ].map((op) => (
                  <button
                    key={op.label}
                    type="button"
                    onClick={() => handleButtonClick(op.val)}
                    className="py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-cyan-500/50 text-xs font-mono text-cyan-400 hover:bg-slate-800 active:scale-95 transition-all cursor-pointer"
                  >
                    {op.label}
                  </button>
                ))}
              </div>
            )}

            {/* Standard Keypad Grid */}
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleButtonClick('C')}
                className="py-3 rounded-xl bg-red-950/40 border border-red-500/50 hover:bg-red-900/50 text-red-300 font-bold text-sm active:scale-95 cursor-pointer"
              >
                C
              </button>
              <button
                type="button"
                onClick={() => handleButtonClick('(')}
                className="py-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold text-sm active:scale-95 cursor-pointer"
              >
                (
              </button>
              <button
                type="button"
                onClick={() => handleButtonClick(')')}
                className="py-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold text-sm active:scale-95 cursor-pointer"
              >
                )
              </button>
              <button
                type="button"
                onClick={() => handleButtonClick('÷')}
                className="py-3 rounded-xl bg-slate-800 border border-slate-700 hover:border-cyan-500/60 text-cyan-400 font-bold text-base active:scale-95 cursor-pointer"
              >
                ÷
              </button>

              {['7', '8', '9'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleButtonClick(n)}
                  className="py-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-slate-100 font-bold text-base active:scale-95 cursor-pointer"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleButtonClick('×')}
                className="py-3 rounded-xl bg-slate-800 border border-slate-700 hover:border-cyan-500/60 text-cyan-400 font-bold text-base active:scale-95 cursor-pointer"
              >
                ×
              </button>

              {['4', '5', '6'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleButtonClick(n)}
                  className="py-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-slate-100 font-bold text-base active:scale-95 cursor-pointer"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleButtonClick('-')}
                className="py-3 rounded-xl bg-slate-800 border border-slate-700 hover:border-cyan-500/60 text-cyan-400 font-bold text-base active:scale-95 cursor-pointer"
              >
                -
              </button>

              {['1', '2', '3'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleButtonClick(n)}
                  className="py-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-slate-100 font-bold text-base active:scale-95 cursor-pointer"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleButtonClick('+')}
                className="py-3 rounded-xl bg-slate-800 border border-slate-700 hover:border-cyan-500/60 text-cyan-400 font-bold text-base active:scale-95 cursor-pointer"
              >
                +
              </button>

              <button
                type="button"
                onClick={() => handleButtonClick('0')}
                className="py-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-slate-100 font-bold text-base active:scale-95 cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => handleButtonClick('.')}
                className="py-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-slate-100 font-bold text-base active:scale-95 cursor-pointer"
              >
                .
              </button>
              <button
                type="button"
                onClick={() => handleButtonClick('DEL')}
                className="py-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:bg-slate-800 text-slate-400 font-bold text-xs active:scale-95 cursor-pointer"
              >
                DEL
              </button>
              <button
                type="button"
                onClick={() => handleButtonClick('=')}
                className="py-3 rounded-xl font-bold text-lg active:scale-95 shadow-lg flex items-center justify-center cursor-pointer transition-all"
                style={{
                  backgroundColor: currentTheme.primary,
                  color: '#020617',
                  boxShadow: `0 0 20px ${currentTheme.primary}40`,
                }}
              >
                <Equal className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* History Tape Column */}
          <div className="flex flex-col bg-[#04060d] border border-slate-800 rounded-xl p-3 overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80 text-xs font-bold text-slate-300">
              <div className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-cyan-400" />
                <span>Tape History</span>
              </div>
              <button
                type="button"
                onClick={() => setHistory([])}
                className="text-[10px] text-slate-500 hover:text-slate-300"
                title="Clear tape"
              >
                Clear
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-60 sm:max-h-none">
              {history.length === 0 ? (
                <div className="text-center py-8 text-slate-600 text-xs">
                  No calculations recorded yet.
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleUseHistory(item)}
                    className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 hover:border-cyan-500/50 cursor-pointer transition-all text-right group"
                  >
                    <div className="text-[10px] text-slate-400 truncate">{item.expression}</div>
                    <div className="text-xs font-bold text-cyan-400 group-hover:text-cyan-300">
                      = {item.result}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-[#050812] border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <span>Stark Mathematical Core v4.2</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
