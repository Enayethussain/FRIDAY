/**
 * Hologram system tests: catalog integrity + search resolution + file validity.
 * Usage: npx tsx scripts/test-holograms.mjs  (exit 0 = all pass)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

// registry has browser deps (localStorage) — stub them
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.fetch = async (url) => {
  const p = path.join(root, 'public', String(url).replace(/^\//, ''));
  return { json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};

const { loadCatalog, searchCatalog } = await import('../src/hologram/registry.ts');
const models = await loadCatalog();
check('catalog loads 100+', models.length >= 100, `got ${models.length}`);

const ids = models.map((m) => m.id);
check('no duplicate ids', new Set(ids).size === ids.length);

let filesOk = 0;
let filesBad = [];
for (const m of models) {
  if (!m.path || (m.status ?? (m.approx ? 'APPROX' : 'REAL')) === 'UNAVAILABLE') continue;
  const fp = path.join(root, 'public', 'holograms', m.path);
  if (!fs.existsSync(fp)) { filesBad.push(`${m.id} missing file`); continue; }
  const b = fs.readFileSync(fp);
  if (m.format === 'glb' && b.subarray(0, 4).toString() !== 'glTF') { filesBad.push(`${m.id} bad magic`); continue; }
  filesOk++;
}
check('all model files exist + valid magic', filesBad.length === 0, filesBad.slice(0, 5).join('; '));

const mustReal = { cube: 'cube_prim', sphere: 'sphere_prim' };
for (const [q, want] of Object.entries(mustReal)) {
  const hit = searchCatalog(q, models);
  check(`REAL resolve "${q}"`, !!hit && 'entry' in hit && hit.entry.id === want, JSON.stringify(hit && ('entry' in hit ? hit.entry.id : hit)));
}
const mustApprox = {
  heart: 'human_heart', 'human heart': 'human_heart', dil: 'human_heart', 'दिल': 'human_heart',
  brain: 'human_brain', dimaag: 'human_brain', lungs: 'human_lungs', fefde: 'human_lungs',
  dna: 'dna_helix', earth: 'planet_earth', prithvi: 'planet_earth', rocket: 'rocket_falcon',
  skeleton: 'human_skeleton', car: 'sedan_car', dog: 'dog_buddy', chair: 'wood_chair',
};
for (const [q, want] of Object.entries(mustApprox)) {
  const hit = searchCatalog(q, models);
  check(`APPROX-confirm "${q}"`, !!hit && 'approxConfirm' in hit && hit.entry.id === want, JSON.stringify(hit && ('entry' in hit || 'approxConfirm' in hit ? hit.entry.id : hit)));
}
check('junk rejected', searchCatalog('xyzqwe asdf', models) === null);
const amb = searchCatalog('cell', models);
check('ambiguous handled', amb === null || 'ambiguous' in amb || 'entry' in amb, JSON.stringify(amb && ('entry' in amb ? amb.entry.id : amb)));

const rep = JSON.parse(fs.readFileSync(path.join(root, 'data', 'hologram_validation_report.json'), 'utf8'));
check('validation report valid>=100', rep.valid >= 100, `valid=${rep.valid}`);

const { searchCatalog: sc2 } = await import('../src/hologram/registry.ts');
const st = {};
for (const m of models) {
  const s = m.status ?? (m.approx ? 'APPROX' : 'REAL');
  st[s] = (st[s] ?? 0) + 1;
}
check('status taxonomy present', (st.REAL ?? 0) >= 1 && (st.APPROX ?? 0) >= 1 && (st.UNAVAILABLE ?? 0) >= 1, JSON.stringify(st));
const cubeHit = sc2('cube', models);
check('REAL cube opens direct', !!cubeHit && 'entry' in cubeHit, JSON.stringify(cubeHit && ('entry' in cubeHit ? cubeHit.entry.id : cubeHit)));
const heartHit = sc2('dil', models);
check('APPROX heart needs confirmation', !!heartHit && 'approxConfirm' in heartHit, JSON.stringify(heartHit && ('entry' in heartHit ? heartHit.entry.id : Object.keys(heartHit || {}))));
const tajHit = sc2('taj mahal', models);
check('taj mahal UNAVAILABLE verdict', !!tajHit && 'unavailable' in tajHit, JSON.stringify(tajHit && ('entry' in tajHit ? tajHit.entry.id : Object.keys(tajHit || {}))));
const lic = JSON.parse(fs.readFileSync(path.join(root, 'public', 'holograms', 'licenses', 'ASSET_LICENSES.json'), 'utf8'));
check('license DB covers bundled models', lic.assets.length === st.REAL + st.APPROX, `${lic.assets.length} vs ${st.REAL + st.APPROX}`);
check('licenses are CC0', lic.assets.every((a) => a.license === 'CC0'), 'non-CC0 found');

console.log(`\nRESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
