/**
 * Action-layer honesty tests. Run: npx tsx test-actionlayer.ts
 * These verify the ZERO-FAKE-SUCCESS rule at the unit level:
 * SUCCESS is only produced from verified outcomes, timeouts and
 * native errors always map to explicit non-success statuses.
 */
import {
  actionFail, actionOk, classifyNativeError, fromVerification,
  isTimeout, withTimeout,
} from './src/services/ActionResult';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.error(`FAIL ${name}`, extra ?? ''); }
}

async function main() {
  // 1. fast promise passes through
  check('timeout_passthrough', await withTimeout('t', 'x', Promise.resolve(7), 500) === 7);

  // 2. slow promise -> timeout mark -> TIMEOUT status (never success)
  try {
    await withTimeout('open_app', 'WhatsApp', new Promise(() => {}), 50);
    check('timeout_rejects', false);
  } catch (e) {
    check('timeout_rejects', isTimeout(e));
    const r = classifyNativeError('open_app', 'WhatsApp', e, 50);
    check('timeout_maps_TIMEOUT', r.status === 'TIMEOUT' && r.verified === false, r);
  }

  // 3. native error classification
  check('not_installed_FAILED',
    classifyNativeError('open_app', 'X', new Error('App not installed: com.x'), 5).status === 'FAILED');
  check('perm_REQUIRED',
    classifyNativeError('lock', 'Lock', new Error('Device-admin permission required'), 5).status === 'PERMISSION_REQUIRED');
  check('unavailable_NOT_SUPPORTED',
    classifyNativeError('bt', 'Bluetooth', new Error('Bluetooth not available'), 5).status === 'NOT_SUPPORTED');
  const generic = classifyNativeError('x', 'Y', new Error('weird crash'), 5);
  check('generic_FAILED_unverified', generic.status === 'FAILED' && generic.verified === false, generic);

  // 4. verification mapping — the heart of the honesty rule
  const ok = fromVerification('open_app', 'WhatsApp', true, true, undefined, 'com.whatsapp', 900);
  check('verified_SUCCESS', ok.status === 'SUCCESS' && ok.verified === true, ok);
  const noPerm = fromVerification('open_app', 'WhatsApp', true, false, 'usage_permission_required', 'com.friday.ai', 900);
  check('usage_perm_REQUIRED', noPerm.status === 'PERMISSION_REQUIRED' && noPerm.verified === false, noPerm);
  const mismatch = fromVerification('open_app', 'Insta', true, false, 'foreground_mismatch_or_timeout', 'com.android.chrome', 2500);
  check('mismatch_VERIFICATION_FAILED', mismatch.status === 'VERIFICATION_FAILED' && mismatch.verified === false, mismatch);
  const noLaunch = fromVerification('open_app', 'X', false, false, undefined, undefined, 100);
  check('no_launch_FAILED', noLaunch.status === 'FAILED' && noLaunch.verified === false, noLaunch);

  // 5. invariant: SUCCESS always verified, failures never verified
  const results = [ok, noPerm, mismatch, noLaunch, generic];
  check('invariant_success_iff_verified',
    results.every((r) => (r.status === 'SUCCESS') === r.verified), results.map((r) => r.status));
  check('actionOk_verified', actionOk('a', 't', 'm').verified === true);
  check('actionFail_unverified', actionFail('TIMEOUT', 'a', 't', 'm').verified === false);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
