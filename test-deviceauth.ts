/**
 * Secure pairing/auth test suite. Run: npx tsx test-deviceauth.ts
 * Spins the REAL production bundle (dist/server.cjs) on a test port and
 * exercises the v2 protocol with REAL Ed25519 keys (node:crypto for the
 * simulated devices + WebCrypto interop proof for the browser path).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';

const PORT = 3989;
const BASE = `http://localhost:${PORT}`;
let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.error(`FAIL ${name}`, extra ?? ''); }
}

async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await res.json()) as Record<string, unknown>;
  return { status: res.status, j };
}

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

interface SimDev { id: string; name: string; kind: string; token: string; pub: crypto.KeyObject; priv: crypto.KeyObject; spkiB64: string; }
async function registerSim(name: string, kind: string): Promise<SimDev> {
  const id = `test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const spkiB64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const r = await api('POST', '/api/devices/register', { deviceId: id, name, kind });
  if (!r.j.success) throw new Error(`register failed: ${JSON.stringify(r.j)}`);
  return { id, name, kind, token: r.j.token as string, pub: publicKey, priv: privateKey, spkiB64 };
}

function signMsg(dev: SimDev, method: string, path: string, bodyStr: string, ts: number, nonce: string): string {
  const msg = `v1|${ts}|${nonce}|${method}|${path}|${sha256Hex(bodyStr)}`;
  return crypto.sign(null, Buffer.from(msg, 'utf8'), dev.priv).toString('base64');
}

async function getAccess(dev: SimDev): Promise<string> {
  const n = await api('POST', '/api/v2/auth/nonce', { deviceId: dev.id });
  if (!n.j.success) throw new Error(`nonce failed: ${JSON.stringify(n.j)}`);
  const ts = Date.now();
  const sig = crypto.sign(null, Buffer.from(`auth|${n.j.nonce}|${ts}|${dev.id}`, 'utf8'), dev.priv).toString('base64');
  const v = await api('POST', '/api/v2/auth/verify', { deviceId: dev.id, nonce: n.j.nonce, ts, signature: sig });
  if (!v.j.success) throw new Error(`verify failed: ${JSON.stringify(v.j)}`);
  return v.j.accessToken as string;
}

async function signed(dev: SimDev, token: string, method: string, path: string, body?: Record<string, unknown>, over?: { ts?: number; nonce?: string; sig?: string }) {
  const bodyStr = body ? JSON.stringify(body) : '';
  const ts = over?.ts ?? Date.now();
  const nonce = over?.nonce ?? `t-${ts.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const sig = over?.sig ?? signMsg(dev, method, path, bodyStr, ts, nonce);
  return api(method, path, body, { Authorization: `Bearer ${token}`, 'X-Dev-Id': dev.id, 'X-TS': String(ts), 'X-Nonce': nonce, 'X-Sig': sig });
}

async function waitHealth(tries = 40): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  // 0. WebCrypto (browser path) <-> node:crypto (server path) interop proof
  try {
    const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' } as AlgorithmIdentifier, true, ['sign', 'verify'])) as unknown as CryptoKeyPair;
    const msg = new TextEncoder().encode('interop|123');
    const sig = await crypto.subtle.sign({ name: 'Ed25519' } as AlgorithmIdentifier, pair.privateKey, msg);
    const spki = Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey));
    const pub = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
    check('webcrypto_ed25519_interop', crypto.verify(null, msg, pub, Buffer.from(sig)));
  } catch (e) {
    check('webcrypto_ed25519_interop', false, String(e));
  }

  const A = await registerSim('FRIDAY-PC', 'pc');
  const B = await registerSim('FRIDAY-PHONE', 'android');
  // identity upload (public keys only)
  for (const d of [A, B]) {
    const r = await api('POST', '/api/v2/identity', { token: d.token, deviceId: d.id, name: d.name, kind: d.kind, pubkey: d.spkiB64 });
    check(`identity_${d.kind}`, r.j.success === true, r.j);
  }

  // 1-2. host begins: 5-min expiry sanity + code shape
  const begin = await api('POST', '/api/v2/pair/begin', { token: A.token });
  check('pair_begin', begin.j.success === true && /^\d{6}$/.test(begin.j.code as string), begin.j);
  const ttl = (begin.j.expiresAt as number) - Date.now();
  check('pair_expiry_5min', ttl > 4 * 60 * 1000 && ttl <= 5 * 60 * 1000 + 5000, ttl);
  const session = begin.j.sessionId as string;

  // 3. wrong code denied
  const bad = await api('POST', '/api/v2/pair/join', { token: B.token, sessionId: session, code: '000000', pubkey: B.spkiB64 });
  check('pair_bad_code_denied', bad.status === 400 && /DENIED/i.test((bad.j.error as string) || ''), bad.j);

  // 4. join ok -> host sees guest, still pending
  const join = await api('POST', '/api/v2/pair/join', { token: B.token, sessionId: session, code: begin.j.code, pubkey: B.spkiB64 });
  check('pair_join_pending', join.j.success === true && join.j.pending === true, join.j);
  const poll = await api('GET', `/api/v2/pair/poll?token=${A.token}&sessionId=${session}`);
  check('pair_host_sees_guest', poll.j.success === true && (poll.j.guest as { deviceId: string })?.deviceId === B.id, poll.j);

  // 5. deny path
  const deny = await api('POST', '/api/v2/pair/decide', { token: A.token, sessionId: session, approve: false });
  const bres = await api('GET', `/api/v2/pair/result?token=${B.token}&sessionId=${session}`);
  check('pair_deny', deny.j.success === true && (deny.j as { decided: string }).decided === 'denied' && bres.j.state === 'denied', { deny: deny.j, res: bres.j });

  // 6. re-begin -> approve with perms -> guest allowed
  const begin2 = await api('POST', '/api/v2/pair/begin', { token: A.token });
  const s2 = begin2.j.sessionId as string;
  await api('POST', '/api/v2/pair/join', { token: B.token, sessionId: s2, code: begin2.j.code, pubkey: B.spkiB64 });
  const allow = await api('POST', '/api/v2/pair/decide', {
    token: A.token, sessionId: s2, approve: true, perms: { basic: true, ft: true, cmd: false, notify: true, screen: false },
  });
  const bres2 = await api('GET', `/api/v2/pair/result?token=${B.token}&sessionId=${s2}`);
  check('pair_allow', (allow.j as { decided: string }).decided === 'allowed' && bres2.j.state === 'allowed', { allow: allow.j, res: bres2.j });

  // 7. auth: good signature -> token; bad signature -> 401
  const aTok = await getAccess(A);
  check('auth_verify_ok', typeof aTok === 'string' && aTok.startsWith('at_'));
  const n2 = await api('POST', '/api/v2/auth/nonce', { deviceId: A.id });
  const badSig = await api('POST', '/api/v2/auth/verify', { deviceId: A.id, nonce: n2.j.nonce, ts: Date.now(), signature: 'AAAA' });
  check('auth_bad_sig_401', badSig.status === 401, badSig.j);

  // 8. signed registry works; tampered body/stale ts/replay rejected
  const reg = await signed(A, aTok, 'GET', '/api/v2/devices');
  const devs = (reg.j as { devices: Array<{ deviceId: string; online: boolean }> }).devices || [];
  check('registry_lists_peer_online', reg.j.success === true && devs.some((d) => d.deviceId === B.id && d.online === true), reg.j);
  const tamper = await signed(A, aTok, 'POST', '/api/v2/device/rename', { alias: 'Hax' }, (() => {
    const ts = Date.now();
    const nonce = `x-${ts}`;
    const sig = signMsg(A, 'POST', '/api/v2/device/rename', JSON.stringify({ alias: 'Legit' }), ts, nonce);
    return { ts, nonce, sig }; // signature over different body
  })());
  check('tampered_body_401', tamper.status === 401, tamper.j);
  const stale = await signed(A, aTok, 'GET', '/api/v2/devices', undefined, { ts: Date.now() - 10 * 60 * 1000, nonce: 'stale-1' });
  check('stale_ts_401', stale.status === 401, stale.j);
  const ts3 = Date.now();
  const nonce3 = `replay-${ts3}`;
  const first = await signed(A, aTok, 'GET', '/api/v2/devices', undefined, { ts: ts3, nonce: nonce3 });
  const replay = await signed(A, aTok, 'GET', '/api/v2/devices', undefined, { ts: ts3, nonce: nonce3 });
  check('replay_rejected', first.j.success === true && replay.status === 401, replay.j);

  // 9. rename + permissions + audit
  const rn = await signed(A, aTok, 'POST', '/api/v2/device/rename', { alias: 'Main PC' });
  check('rename_ok', rn.j.success === true, rn.j);
  const pm = await signed(A, aTok, 'POST', '/api/v2/device/permissions', { targetId: B.id, perms: { basic: true, ft: false, cmd: false, notify: true, screen: false } });
  check('perms_change_ok', pm.j.success === true, pm.j);
  const au = await signed(A, aTok, 'GET', '/api/v2/audit');
  const entries = ((au.j as { entries: Array<{ action: string }> }).entries || []).map((e) => e.action);
  check('audit_has_entries', entries.includes('PAIR_ALLOW') && entries.includes('DEVICE_RENAME'), entries);

  // 10. FT: permission denied without ft, then allowed; hash plumbing end-to-end
  const bTok = await getAccess(B);
  const ftDeny2 = await api('POST', '/api/ft/begin', { token: B.token, name: 'x.bin', size: 10, chunks: 1, toDeviceId: A.id });
  check('ft_perm_denied', ftDeny2.status === 403 && /PERMISSION_DENIED/i.test((ftDeny2.j.error as string) || ''), ftDeny2.j);
  await signed(A, aTok, 'POST', '/api/v2/device/permissions', { targetId: B.id, perms: { basic: true, ft: true, cmd: false, notify: true, screen: false } });
  const data = Buffer.from('hello-friday-transfer').toString('base64');
  const hash = crypto.createHash('sha256').update(Buffer.from('hello-friday-transfer')).digest('hex');
  const fb = await api('POST', '/api/ft/begin', { token: B.token, name: 'hello.txt', size: 22, chunks: 1, sha256: hash, toDeviceId: A.id });
  check('ft_begin_hash', fb.j.success === true, fb.j);
  const fid = fb.j.id as string;
  const fc = await api('POST', '/api/ft/chunk', { token: B.token, id: fid, idx: 0, data });
  check('ft_chunk', fc.j.success === true, fc.j);
  const fr = await api('POST', '/api/ft/receipt', { token: A.token, id: fid, receivedSize: 22, hashOk: true });
  const poll2 = await api('GET', `/api/ft/receipt?token=${encodeURIComponent(B.token)}&id=${fid}`);
  check('ft_hash_verified_complete', (fr.j as { success: boolean }).success === true && (poll2.j as { complete: boolean }).complete === true, poll2.j);

  // 11. revoke: tokens die, v1 + v2 blocked, registry shows REVOKED
  const rev = await signed(A, aTok, 'POST', '/api/v2/device/revoke', { targetId: B.id });
  check('revoke_ok', rev.j.success === true, rev.j);
  const afterRev = await signed(B, bTok, 'GET', '/api/v2/devices');
  check('revoked_token_403', afterRev.status === 403, afterRev.j);
  const reauth = await (async () => {
    try { await getAccess(B); return 'unexpected-ok'; }
    catch (e) { return e instanceof Error ? e.message : String(e); }
  })();
  check('revoked_reauth_blocked', /revoked|unknown/i.test(reauth), reauth);
  const v1send = await api('POST', '/api/devices/send', { token: B.token, payload: 'hi' });
  check('revoked_v1_send_blocked', v1send.status === 403 || v1send.status === 400, v1send.j);
  const regA = await signed(A, aTok, 'GET', '/api/v2/devices');
  check('revoked_excluded_from_registry', (regA.j as { devices: unknown[] }).devices.length === 0, regA.j);

  console.log(`\n${pass} passed, ${fail} failed`);
  return fail;
}

let server: ChildProcess | null = null;
async function boot(): Promise<boolean> {
  server = spawn(process.execPath, ['dist/server.cjs'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  return waitHealth();
}

try {
  const ok = await boot();
  if (!ok) {
    console.error('Server did not boot on test port');
    process.exit(2);
  }
  const failed = await main();
  server?.kill();
  process.exit(failed === 0 ? 0 : 1);
} catch (e) {
  console.error('FATAL', e);
  server?.kill();
  process.exit(2);
}
