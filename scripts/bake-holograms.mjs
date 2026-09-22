/**
 * Bake hologram catalog: compose parts -> real .glb files -> catalog.json + validation report.
 * Usage: npx tsx scripts/bake-holograms.mjs
 * Every entry must produce real geometry or it is EXCLUDED (never faked).
 */
globalThis.FileReader = class {
  constructor() { this.result = null; this.onload = null; this.onloadend = null; this.onerror = null; }
  _fire() { if (this.onload) this.onload(); if (this.onloadend) this.onloadend(); }
  readAsArrayBuffer(b) {
    Promise.resolve().then(async () => {
      try { this.result = b && b.arrayBuffer ? await b.arrayBuffer() : b; }
      catch (e) { this.result = b; }
      this._fire();
    });
  }
  readAsDataURL(b) { this.readAsArrayBuffer(b); }
};

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { composeParts, countPolys } from '../src/hologram/composer.ts';
import { PART1 } from './hologram-data-1.mjs';
import { PART2 } from './hologram-data-2.mjs';
import { PART3 } from './hologram-data-3.mjs';
import { PART4 } from './hologram-data-4.mjs';
import { PART5 } from './hologram-data-5.mjs';

/** Exact geometric primitives: genuinely REAL. Everything else self-made is APPROX. */
const REAL_IDS = new Set(['cube_prim', 'sphere_prim', 'cylinder_prim', 'torus_prim', 'cone_prim', 'pyramid_prim']);
const VERIFIED_AT = new Date().toISOString().slice(0, 10);

function licenseBlock() {
  return {
    source: 'Self-created parametric geometry (JARVIS hologram bake)',
    author: 'JARVIS project',
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
    commercialUseAllowed: true,
    redistributionAllowed: true,
    verified: VERIFIED_AT,
  };
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'holograms', 'models');
const MAX_TRIS = 60000;

const ALL = [...PART1, ...PART2, ...PART3, ...PART4];
const UNAV = [...PART5];
const seen = new Set();
const catalog = [];
const report = { generated_at: new Date().toISOString(), total: ALL.length, valid: 0, invalid: 0, entries: [] };

const exporter = new GLTFExporter();
for (const e of ALL) {
  const rec = { id: e.id, ok: false, reason: '', meshes: 0, tris: 0, bytes: 0 };
  try {
    if (seen.has(e.id)) throw new Error('duplicate id');
    seen.add(e.id);
    const group = composeParts(e.parts);
    const { meshes, tris } = countPolys(group);
    rec.meshes = meshes; rec.tris = tris;
    if (meshes === 0) throw new Error('no renderable meshes');
    if (tris > MAX_TRIS) throw new Error(`too heavy (${tris} tris)`);
    // normalize to ~2.2 units
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3()).length() || 2;
    const k = 2.2 / size;
    group.scale.multiplyScalar(k);
    const c = box.getCenter(new THREE.Vector3());
    group.position.sub(c.multiplyScalar(k));
    const out = await exporter.parseAsync(group, { binary: true });
    const buf = Buffer.from(out);
    if (buf.subarray(0, 4).toString() !== 'glTF') throw new Error('exporter did not produce glTF');
    const dir = path.join(outDir, e.category);
    fs.mkdirSync(dir, { recursive: true });
    const rel = `${e.category}/${e.filename}`;
    fs.writeFileSync(path.join(outDir, rel), buf);
    rec.bytes = buf.length;
    rec.ok = true;
    report.valid++;
    const status = REAL_IDS.has(e.id) ? 'REAL' : 'APPROX';
    catalog.push({ ...e, parts: undefined, file: rel, path: `models/${rel}`, polygon_count: tris, optimized: true, mobile_path: `models/${rel}`, status, ...licenseBlock() });
  } catch (err) {
    rec.ok = false;
    rec.reason = err instanceof Error ? err.message : String(err);
    report.invalid++;
  }
  report.entries.push(rec);
}

// UNAVAILABLE entries: catalogued honestly, no files, excluded from builds.
for (const u of UNAV) {
  if (seen.has(u.id)) { report.invalid++; report.entries.push({ id: u.id, ok: false, reason: 'duplicate id' }); continue; }
  seen.add(u.id);
  catalog.push({ ...u, polygon_count: 0, optimized: false });
  report.entries.push({ id: u.id, ok: true, reason: 'UNAVAILABLE (no file, by design)', meshes: 0, tris: 0, bytes: 0 });
}

// License database (PART 11): one record per bundled model.
const licDir = path.join(root, 'public', 'holograms', 'licenses');
fs.mkdirSync(licDir, { recursive: true });
fs.writeFileSync(path.join(licDir, 'ASSET_LICENSES.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  assets: catalog.filter((m) => m.status !== 'UNAVAILABLE').map((m) => ({
    id: m.id, name: m.display_name, source: m.source, author: m.author,
    license: m.license, licenseUrl: m.licenseUrl, attribution: m.attributionRequired,
    redistribution: m.redistributionAllowed, commercial: m.commercialUseAllowed, verified: m.verified,
  })),
}, null, 1));

fs.writeFileSync(path.join(root, 'public', 'holograms', 'catalog.json'), JSON.stringify({ version: 2, count: catalog.length, models: catalog }, null, 1));
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'hologram_validation_report.json'), JSON.stringify(report, null, 1));
const bad = report.entries.filter((x) => !x.ok);
console.log(`BAKED valid=${report.valid} invalid=${report.invalid} total=${report.total}`);
if (bad.length) console.log('INVALID: ' + bad.map((b) => `${b.id} (${b.reason})`).join(', '));
