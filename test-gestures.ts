/**
 * Gesture engine tests. Run: npx tsx test-gestures.ts
 * Verifies mode machine, pause, and per-mode mappings with synthetic hands.
 * Bridge calls degrade honestly (NOT_SUPPORTED, no crash) outside the shell.
 */
import { globalGestureEngine, type GestureMode } from './src/services/GestureControlEngine';
import type { RawHand } from './src/components/FridayOrb/handTracking';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.error(`FAIL ${name}`, extra ?? ''); }
}

function hand(cx: number, cy: number, openness: number, pinched: boolean): RawHand {
  const points = Array.from({ length: 21 }, () => ({ x: cx, y: cy }));
  points[0] = { x: cx, y: cy + 0.2 }; // wrist
  points[9] = { x: cx, y: cy }; // middle knuckle (palm center proxy)
  const spread = pinched ? 0.02 : openness > 0.5 ? 0.2 : 0.06;
  points[4] = { x: cx - spread / 2, y: cy - 0.02 }; // thumb tip
  points[8] = { x: cx + (pinched ? spread / 2 : spread), y: cy - 0.05 }; // index tip
  for (const t of [12, 16, 20]) points[t] = { x: cx + 0.01 * t, y: cy - (openness > 0.5 ? 0.18 : 0.05) };
  for (const p of [6, 10, 14, 18]) points[p] = { x: cx, y: cy - 0.08 };
  return { points, cx, cy, openness };
}

async function main() {
  const seen: string[] = [];
  let rotates = 0;
  let zooms = 0;
  let expands = 0;
  let pausedEv: boolean[] = [];
  globalGestureEngine.configure({
    onMode: (m: GestureMode) => seen.push(m),
    onPause: (p: boolean) => pausedEv.push(p),
    onOrbRotate: () => rotates++,
    onOrbZoom: () => zooms++,
    onOrbExpand: () => expands++,
  });

  // 1. mode machine
  globalGestureEngine.setMode('CURSOR');
  check('mode_cursor', globalGestureEngine.getMode() === 'CURSOR' && seen.includes('CURSOR'));
  globalGestureEngine.setMode('ORB');

  // 2. ORB single-hand movement rotates + expands (no bridge needed)
  globalGestureEngine.onFrame([hand(0.5, 0.5, 0.9, false)]);
  globalGestureEngine.onFrame([hand(0.55, 0.5, 0.9, false)]);
  check('orb_rotate_expand', rotates > 0 && expands > 0, { rotates, expands });

  // 3. ORB two-hand spread reports zoom delta
  globalGestureEngine.onFrame([hand(0.4, 0.5, 0.9, false), hand(0.6, 0.5, 0.9, false)]);
  globalGestureEngine.onFrame([hand(0.35, 0.5, 0.9, false), hand(0.65, 0.5, 0.9, false)]);
  check('orb_zoom_delta', zooms > 0, { zooms });

  // 4. CURSOR pinch works without shell (honest NOT_SUPPORTED inside, no throw)
  globalGestureEngine.setMode('CURSOR');
  let threw = false;
  try {
    for (let i = 0; i < 5; i++) globalGestureEngine.onFrame([hand(0.5, 0.5, 0.3, true)]);
    globalGestureEngine.onFrame([hand(0.5, 0.5, 0.3, false)]);
  } catch { threw = true; }
  check('cursor_pinch_no_crash', !threw);

  // 5. open-palm hold ~1.2s toggles pause (real timing)
  globalGestureEngine.setMode('ORB');
  if (globalGestureEngine.isPaused()) globalGestureEngine.setPaused(false);
  pausedEv = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 1500) {
    globalGestureEngine.onFrame([hand(0.5, 0.5, 0.95, false)]);
    await new Promise((r) => setTimeout(r, 50));
  }
  check('palm_hold_pauses', globalGestureEngine.isPaused() === true && pausedEv.includes(true), pausedEv);
  // while paused, no orb rotation
  const r0 = rotates;
  globalGestureEngine.onFrame([hand(0.5, 0.5, 0.9, false)]);
  globalGestureEngine.onFrame([hand(0.6, 0.5, 0.9, false)]);
  check('paused_suppresses_output', rotates === r0, { r0, rotates });
  globalGestureEngine.setPaused(false);

  // 6. empty frame resets without crash
  threw = false;
  try { globalGestureEngine.onFrame([]); } catch { threw = true; }
  check('empty_frame_safe', !threw);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
