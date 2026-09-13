// Generator + workspace + builder + tester + versioning. Operates ONLY inside generated_apps/.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AppSpec, BuildResult, ManagedApp } from './types.js';
import { calculatorFiles } from './templates/calculator.js';
import { tictactoeFiles } from './templates/tictactoe.js';

const exec = promisify(execFile);
export const ROOT = path.resolve(process.cwd(), 'generated_apps');
export const REGISTRY = path.join(ROOT, '_registry.json');

export function ensureRoot(): void {
  fs.mkdirSync(ROOT, { recursive: true });
  if (!fs.existsSync(REGISTRY)) fs.writeFileSync(REGISTRY, '[]');
}

function filesFor(spec: AppSpec): Record<string, string> {
  return spec.kind === 'calculator' ? calculatorFiles(spec) : tictactoeFiles(spec);
}

function readRegistry(): ManagedApp[] {
  ensureRoot();
  try { return JSON.parse(fs.readFileSync(REGISTRY, 'utf-8')); } catch { return []; }
}
function writeRegistry(apps: ManagedApp[]): void {
  fs.writeFileSync(REGISTRY, JSON.stringify(apps, null, 2));
}

async function runTests(dir: string): Promise<{ passed: number; failed: number; output: string }> {
  try {
    const { stdout } = await exec('node', ['tests/run.mjs'], { cwd: dir, timeout: 30000 });
    const m = stdout.match(/\{[^}]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      return { passed: Number(j.passed) || 0, failed: Number(j.failed) || 0, output: stdout.slice(-1000) };
    }
    return { passed: 0, failed: 1, output: 'No test JSON output: ' + stdout.slice(-500) };
  } catch (e: any) {
    return { passed: 0, failed: 1, output: (e.stdout || '') + '\n' + (e.message || String(e)) };
  }
}

function guard(dir: string): void {
  const abs = path.resolve(dir);
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) throw new Error('SAFETY: path escapes generated_apps workspace: ' + dir);
}

export async function buildApp(spec: AppSpec, onStep?: (id: string, status: string, detail?: string) => void): Promise<BuildResult> {
  ensureRoot();
  const errors: string[] = [];
  const step = (id: string, status: string, detail?: string) => { try { onStep?.(id, status, detail); } catch {} };

  // Versioning: same kind+base -> bump version, backup previous
  const reg = readRegistry();
  const sameKind = reg.filter((a) => a.kind === spec.kind);
  const version = sameKind.length + 1;

  const dir = path.join(ROOT, spec.name);
  guard(dir);
  step('spec', 'done', `${spec.kind} | ${spec.features.join(', ')} | theme:${spec.theme}`);
  step('plan', 'done', `isolated project: generated_apps/${spec.name} (v${version})`);

  // Backup previous version dir if exists
  if (fs.existsSync(dir)) {
    const bak = dir + `.bak-v${version - 1}`;
    fs.rmSync(bak, { recursive: true, force: true });
    fs.renameSync(dir, bak);
  }
  fs.mkdirSync(dir, { recursive: true });

  // Generate
  step('generate', 'running');
  const files = filesFor(spec);
  for (const [rel, content] of Object.entries(files)) {
    const fp = path.join(dir, rel);
    guard(fp);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content);
  }
  fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify({ ...spec, version }, null, 2));
  step('generate', 'done', `${Object.keys(files).length + 1} files`);

  // Static checks: all files non-empty, no TODO/placeholder
  step('static', 'running');
  for (const [rel, content] of Object.entries(files)) {
    if (!content || content.length < 50) errors.push(`Static check: ${rel} too small/empty`);
    if (/lorem ipsum|TODO: implement/i.test(content)) errors.push(`Static check: ${rel} contains placeholder`);
  }
  if (!fs.existsSync(path.join(dir, 'index.html'))) errors.push('Static check: index.html missing');
  step('static', errors.length ? 'error' : 'done', errors.length ? errors.join('; ') : 'all files real, no placeholders');

  // Tests (max 2 auto-repair attempts for generated files ONLY)
  let tested = { passed: 0, failed: 1, output: '' };
  for (let attempt = 1; attempt <= 3 && tested.failed > 0; attempt++) {
    step('test', 'running', `attempt ${attempt}`);
    tested = await runTests(dir);
    if (tested.failed > 0 && attempt < 3) {
      step('repair', 'running', tested.output.slice(-300));
      // Auto-repair is limited: re-emit pristine template files (generator bug fix), never touch FRIDAY code
      const fresh = filesFor(spec);
      for (const [rel, content] of Object.entries(fresh)) {
        const fp = path.join(dir, rel);
        guard(fp);
        fs.writeFileSync(fp, content);
      }
    }
  }
  if (tested.failed > 0) {
    step('test', 'error', tested.output.slice(-500));
    errors.push('Tests failed: ' + tested.output.slice(-500));
  } else {
    step('test', 'done', `${tested.passed} tests passed`);
  }

  // Build: static web app = verify entry + syntax check via node --check
  step('build', 'running');
  try {
    await exec('node', ['--check', 'logic.js'], { cwd: dir, timeout: 15000 });
    step('build', 'done', 'node --check OK, static bundle complete');
  } catch (e: any) {
    step('build', 'error', e.message);
    errors.push('Build failed: ' + e.message);
  }

  const success = errors.length === 0;
  step('verify', success ? 'done' : 'error', success ? 'runnable: open index.html' : 'see errors');
  if (success) {
    const entry: ManagedApp = { id: spec.name, name: spec.name, kind: spec.kind, dir, version, status: 'built', createdAt: Date.now() };
    writeRegistry([...readRegistry().filter((a) => a.id !== spec.name), entry]);
  }
  return {
    success,
    projectDir: dir,
    version,
    testsPassed: tested.passed,
    testsFailed: tested.failed,
    errors,
    entryFile: path.join(dir, 'index.html'),
    message: success ? `✓ BUILD SUCCESSFUL: ${spec.name} v${version} (${tested.passed} tests passed)` : `❌ BUILD FAILED: ${errors.join(' | ')}`,
  };
}

export function listApps(): ManagedApp[] { return readRegistry(); }

export function deleteApp(id: string): boolean {
  const reg = readRegistry();
  const app = reg.find((a) => a.id === id);
  if (!app) return false;
  guard(app.dir);
  fs.rmSync(app.dir, { recursive: true, force: true });
  writeRegistry(reg.filter((a) => a.id !== id));
  return true;
}
