// Planner: natural-language request -> AppSpec. Rule-based v1 (no LLM dependency).
import type { AppKind, AppSpec } from './types.js';

export function planApp(request: string, counter: number): AppSpec {
  const r = request.toLowerCase();
  let kind: AppKind | null = null;
  if (/tic.?tac.?toe|cross|zero.?kaanta|x.?o.?game/.test(r)) kind = 'tictactoe';
  else if (/calculator|calc|hisab|ginti/.test(r)) kind = 'calculator';
  if (!kind) throw new Error(`Samajh nahi aaya kaunsi app chahiye. V1 me sirf "calculator" ya "tic-tac-toe" supported hai. Request: "${request}"`);

  const theme = /light/.test(r) ? 'light' : /friday|futuristic|hud|neon/.test(r) ? 'friday' : 'dark';
  const features: string[] = [];
  if (kind === 'calculator') {
    features.push('basic-arithmetic', 'keyboard-support', 'history');
    if (/scientific|sin|cos|sqrt|power/.test(r)) features.push('scientific');
  } else {
    features.push('2-player', 'win-detection', 'draw-detection', 'restart', 'score');
    if (/\bai\b|computer|bot/.test(r)) features.push('ai-mode');
  }
  const id = String(counter).padStart(3, '0');
  const name = kind === 'calculator' ? `calculator_${id}` : `tictactoe_${id}`;
  return { kind, name, theme, features, rawRequest: request };
}
