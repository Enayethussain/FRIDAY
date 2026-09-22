// Tic-Tac-Toe template — real playable game: 2-player + optional AI, score, restart.
import type { AppSpec } from '../types.js';

export function tictactoeFiles(spec: AppSpec): Record<string, string> {
  const title = spec.name.replace(/_/g, ' ').toUpperCase();
  const ai = spec.features.includes('ai-mode');
  const dark = spec.theme !== 'light';
  const bg = dark ? '#0b1020' : '#f1f5f9';
  const fg = dark ? '#e2e8f0' : '#0f172a';
  const accent = spec.theme === 'jarvis' ? '#06b6d4' : '#a78bfa';

  const logic = `// Pure game logic — no DOM, unit-testable in Node.
export const EMPTY = null;
export function newBoard() { return Array(9).fill(null); }
export function winner(b) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,c,d] of lines) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return null;
}
export function isDraw(b) { return b.every(x => x) && !winner(b); }
export function legalMoves(b) { const m = []; b.forEach((x, i) => { if (!x) m.push(i); }); return m; }
export function play(b, i, p) {
  if (b[i] || winner(b)) throw new Error('Illegal move');
  const n = b.slice(); n[i] = p; return n;
}
// Simple unbeatable-ish AI: win > block > center > corner > random
export function aiMove(b, me = 'O') {
  const opp = me === 'X' ? 'O' : 'X';
  for (const i of legalMoves(b)) { const n = b.slice(); n[i] = me; if (winner(n) === me) return i; }
  for (const i of legalMoves(b)) { const n = b.slice(); n[i] = opp; if (winner(n) === opp) return i; }
  if (!b[4]) return 4;
  for (const i of [0, 2, 6, 8]) if (!b[i]) return i;
  return legalMoves(b)[0];
}
`;

  const ui = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui;background:${bg};color:${fg};display:flex;flex-direction:column;align-items:center;padding:24px} #b{display:grid;grid-template-columns:repeat(3,90px);gap:8px} .c{width:90px;height:90px;font-size:42px;border-radius:12px;border:2px solid ${accent};background:transparent;color:${fg};cursor:pointer} #s{margin:12px;font-size:18px} button.a{margin:4px;padding:8px 16px;border-radius:8px;border:1px solid ${accent};background:transparent;color:${fg};cursor:pointer}</style></head><body>
<h2>${title}</h2><div id="s"></div><div id="b"></div>
<div><button class="a" id="r">Restart</button>${ai ? '<button class="a" id="m">Mode: vs AI</button>' : ''}</div>
<p>Score — X: <span id="sx">0</span> | O: <span id="so">0</span> | Draw: <span id="sd">0</span></p>
<script type="module">import { newBoard, winner, isDraw, play, aiMove } from './logic.js';
let b = newBoard(), turn = 'X', vsAI = ${ai ? 'true' : 'false'}, over = false;
const sx = { X: 0, O: 0, D: 0 };
const bel = document.getElementById('b'), s = document.getElementById('s');
for (let i = 0; i < 9; i++) { const btn = document.createElement('button'); btn.className = 'c'; btn.onclick = () => move(i); bel.appendChild(btn); }
${ai ? "document.getElementById('m').onclick = (e) => { vsAI = !vsAI; e.target.textContent = 'Mode: ' + (vsAI ? 'vs AI' : '2 players'); reset(); };" : ''}
document.getElementById('r').onclick = reset;
function draw() { [...bel.children].forEach((c, i) => c.textContent = b[i] || ''); document.getElementById('sx').textContent = sx.X; document.getElementById('so').textContent = sx.O; document.getElementById('sd').textContent = sx.D; }
function move(i) {
  if (over || b[i]) return;
  b = play(b, i, turn);
  const w = winner(b);
  if (w) { sx[w]++; s.textContent = w + ' wins! 🎉'; over = true; }
  else if (isDraw(b)) { sx.D++; s.textContent = 'Draw!'; over = true; }
  else { turn = turn === 'X' ? 'O' : 'X'; s.textContent = 'Turn: ' + turn; if (vsAI && turn === 'O' && !over) { setTimeout(() => move(aiMove(b, 'O')), 300); } }
  draw();
}
function reset() { b = newBoard(); turn = 'X'; over = false; s.textContent = 'Turn: X'; draw(); }
reset();
</script></body></html>`;

  const tests = `import { newBoard, winner, isDraw, legalMoves, play, aiMove } from '../logic.js';
import assert from 'node:assert/strict';
let pass = 0;
const t = (c, m) => { assert.ok(c, m); pass++; };
// rows / cols / diagonals
t(winner(['X','X','X',null,null,null,null,null,null]) === 'X', 'row win');
t(winner(['O',null,null,'O',null,null,'O',null,null]) === 'O', 'col win');
t(winner(['X',null,null,null,'X',null,null,null,'X']) === 'X', 'diag win');
t(winner(newBoard()) === null, 'empty no win');
// draw
t(isDraw(['X','O','X','X','O','O','O','X','X']) === true, 'draw detect');
t(isDraw(newBoard()) === false, 'empty no draw');
// moves
t(legalMoves(newBoard()).length === 9, '9 moves');
const b1 = play(newBoard(), 4, 'X'); t(b1[4] === 'X', 'play marks');
assert.throws(() => play(b1, 4, 'O'), /Illegal/); pass++;
// AI blocks + wins
t(aiMove(['O','O',null,null,null,null,null,null,null], 'X') !== undefined, 'ai returns');
const win = aiMove(['X','X',null,'O','O',null,null,null,null], 'X'); t(win === 2, 'ai takes win');
const blk = aiMove(['X','X',null,null,null,null,null,null,null], 'O'); t(blk === 2, 'ai blocks');
console.log(JSON.stringify({ passed: pass, failed: 0 }));
`;

  const pkg = JSON.stringify({ name: spec.name, version: '1.0.0', type: 'module', scripts: { test: 'node tests/run.mjs', start: 'npx serve .' } }, null, 2);
  const readme = `# ${title}\n\nGenerated by JARVIS App Builder (v1). Playable Tic-Tac-Toe.\n\n- \`node tests/run.mjs\` — run unit tests\n- Open \`index.html\` to play.\n\nFeatures: ${spec.features.join(', ')}\n`;
  return { 'logic.js': logic, 'index.html': ui, 'tests/run.mjs': tests, 'package.json': pkg, 'README.md': readme };
}
