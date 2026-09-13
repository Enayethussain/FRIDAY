// Calculator template — real working app. Pure logic (testable) + UI.
import type { AppSpec } from '../types.js';

export function calculatorFiles(spec: AppSpec): Record<string, string> {
  const title = spec.name.replace(/_/g, ' ').toUpperCase();
  const dark = spec.theme !== 'light';
  const bg = dark ? '#0b1020' : '#f1f5f9';
  const fg = dark ? '#e2e8f0' : '#0f172a';
  const accent = spec.theme === 'friday' ? '#06b6d4' : '#22c55e';

  const logic = `// Pure calculator logic — no DOM, unit-testable in Node.
export function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) num += expr[i++];
      if (num.split('.').length > 2) throw new Error('Invalid number: ' + num);
      tokens.push({ t: 'n', v: parseFloat(num) });
      continue;
    }
    if ('+-*/%^()'.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
    throw new Error('Invalid character: ' + c);
  }
  return tokens;
}
export function evaluate(expr) {
  const tokens = tokenize(expr);
  let pos = 0;
  function peek() { return tokens[pos]; }
  function eat(v) { const t = tokens[pos]; if (!t || (v && t.v !== v)) throw new Error('Syntax error near ' + (t ? t.v : 'end')); pos++; return t; }
  function parseExpr() { let v = parseTerm(); while (peek() && (peek().v === '+' || peek().v === '-')) { const op = eat().v; const r = parseTerm(); v = op === '+' ? v + r : v - r; } return v; }
  function parseTerm() { let v = parseFactor(); while (peek() && (peek().v === '*' || peek().v === '/' || peek().v === '%')) { const op = eat().v; const r = parseFactor(); if (op === '*') v *= r; else if (op === '/') { if (r === 0) throw new Error('Division by zero'); v /= r; } else v %= r; } return v; }
  function parseFactor() { let v = parseUnary(); while (peek() && peek().v === '^') { eat('^'); v = Math.pow(v, parseUnary()); } return v; }
  function parseUnary() { if (peek() && peek().v === '-') { eat('-'); return -parseUnary(); } if (peek() && peek().v === '+') { eat('+'); return parseUnary(); } return parseAtom(); }
  function parseAtom() { const t = peek(); if (!t) throw new Error('Empty expression'); if (t.t === 'n') { eat(); return t.v; } if (t.v === '(') { eat('('); const v = parseExpr(); eat(')'); return v; } throw new Error('Unexpected token: ' + t.v); }
  const result = parseExpr();
  if (pos !== tokens.length) throw new Error('Unexpected token: ' + tokens[pos].v);
  return result;
}
`;

  const ui = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui;background:${bg};color:${fg};display:flex;justify-content:center;padding:24px} .c{width:320px} #d{width:100%;font-size:28px;text-align:right;padding:12px;box-sizing:border-box;background:transparent;color:${fg};border:2px solid ${accent};border-radius:12px} .g{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px} button{font-size:20px;padding:14px;border-radius:10px;border:1px solid ${accent};background:transparent;color:${fg};cursor:pointer} button:hover{background:${accent};color:#000} #h{margin-top:12px;font-size:13px;opacity:.8;max-height:120px;overflow:auto}</style></head><body>
<div class="c"><h2>${title}</h2><input id="d" readonly value="0"><div class="g" id="g"></div><div id="h"></div></div>
<script type="module">import { evaluate } from './logic.js';
const d = document.getElementById('d'), g = document.getElementById('g'), h = document.getElementById('h');
let expr = '';
const keys = ['C','(',')','/','7','8','9','*','4','5','6','-','1','2','3','+','0','.','%','='];
keys.forEach(k => { const b = document.createElement('button'); b.textContent = k; b.onclick = () => press(k); g.appendChild(b); });
function press(k) {
  if (k === 'C') { expr = ''; d.value = '0'; return; }
  if (k === '=') { try { const v = evaluate(expr); h.innerHTML = expr + ' = <b>' + v + '</b><br>' + h.innerHTML; d.value = String(v); expr = String(v); } catch (e) { d.value = 'Error'; expr = ''; } return; }
  expr += k; d.value = expr;
}
document.addEventListener('keydown', e => { if (/[0-9+\\-*/%().]/.test(e.key)) press(e.key); else if (e.key === 'Enter') press('='); else if (e.key === 'Backspace') { expr = expr.slice(0, -1); d.value = expr || '0'; } else if (e.key === 'Escape') press('C'); });
</script></body></html>`;

  const tests = `import { evaluate } from '../logic.js';
import assert from 'node:assert/strict';
const cases = [
  ['2+3*4', 14], ['(2+3)*4', 20], ['10/4', 2.5], ['2^3', 8],
  ['-5+3', -2], ['10%3', 1], ['3.5*2', 7], ['((1+2)*(3+4))/7', 3],
];
let pass = 0;
for (const [expr, want] of cases) { assert.equal(evaluate(expr), want, expr); pass++; }
assert.throws(() => evaluate('1/0'), /zero/);
assert.throws(() => evaluate('2+*3'), /Unexpected/);
assert.throws(() => evaluate('abc'), /Invalid/);
assert.throws(() => evaluate(''), /Empty/);
console.log(JSON.stringify({ passed: pass + 4, failed: 0 }));
`;

  const pkg = JSON.stringify({ name: spec.name, version: '1.0.0', type: 'module', scripts: { test: 'node tests/run.mjs', start: 'npx serve .' } }, null, 2);
  const readme = `# ${title}\n\nGenerated by FRIDAY App Builder (v1).\n\n- \`node tests/run.mjs\` — run unit tests\n- Open \`index.html\` in a browser (or \`npx serve .\`) to run.\n\nFeatures: ${spec.features.join(', ')}\nTheme: ${spec.theme}\n`;
  return { 'logic.js': logic, 'index.html': ui, 'tests/run.mjs': tests, 'package.json': pkg, 'README.md': readme };
}
