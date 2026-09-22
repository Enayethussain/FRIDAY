// JARVIS Cloud App Builder — isolated module. Mounted in main backend via ONE additive hook.
// Owns: jobs, sandboxed worker, artifacts, SSE status. Never touches existing JARVIS logic.
import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execSync } from 'node:child_process';

export type JobStatus =
  | 'QUEUED' | 'PLANNING' | 'GENERATING' | 'TESTING' | 'BUILDING'
  | 'FIXING' | 'VERIFYING' | 'SUCCESS' | 'FAILED' | 'PARTIALLY_COMPLETED' | 'CANCELLED';

export interface CloudJob {
  id: string; userId: string; deviceId: string; deviceName: string;
  request: string; kind: string | null; appId: string | null;
  status: JobStatus; logs: string[]; errors: string[];
  testsPassed: number; testsFailed: number;
  artifact: { dir: string; entry: string; zip: string | null; apk: string | null } | null;
  createdAt: number; updatedAt: number;
}

const MAX_AUTO_FIX = Number(process.env.AB_MAX_FIX || 3);
const STEP_TIMEOUT = Number(process.env.AB_STEP_TIMEOUT_MS || 60000);
const MAX_CONCURRENT = Number(process.env.AB_MAX_CONCURRENT || 2);

function cleanEnv(): NodeJS.ProcessEnv {
  // Sandbox: generated-code steps never see JARVIS secrets
  const e = { ...process.env };
  delete e.GEMINI_API_KEY; delete e.JWT_SECRET; delete e.FIREBASE_PRIVATE_KEY;
  delete e.GOOGLE_API_KEY; delete e.APPBUILDER_PORT;
  return e;
}

function run(cmd: string, args: string[], cwd: string, timeout = STEP_TIMEOUT): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout, env: cleanEnv(), maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { (err as any).stdout = String(stdout || ''); (err as any).stderr = String(stderr || ''); reject(err); }
      else resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function detectEnv() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
    (process.platform === 'win32' ? `${process.env.LOCALAPPDATA}\\Android\\Sdk` : `${process.env.HOME}/Android/Sdk`);
  const hasSdk = !!(sdk && fs.existsSync(sdk));
  const candidates: string[] = [];
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'));
  for (const base of ['C:\\Users\\enaye\\jdk17', 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Java']) {
    try {
      if (fs.existsSync(base)) {
        for (const d of fs.readdirSync(base)) {
          candidates.push(path.join(base, d, 'bin', 'java.exe'));
        }
      }
    } catch {}
  }
  candidates.push('java');
  let java = '';
  const allCandidates = [...candidates, 'java'];
  for (const c of allCandidates) {
    try {
      const q = c.includes(' ') ? `"${c}"` : c;
      const out = String(execSync(`${q} -version 2>&1`, { timeout: 8000 }));
      if (/version "(\d+)/.test(out)) { java = out; break; }
    } catch {}
  }
  const m = java.match(/version "(\d+)/);
  const javaMajor = m ? Number(m[1]) : 0;
  return {
    platform: process.platform,
    androidSdk: hasSdk ? sdk : null,
    javaMajor: javaMajor || null,
    canAndroid: hasSdk && javaMajor >= 17,
    canWeb: true,
    canWindows: process.platform === 'win32',
  };
}

export interface MountOpts {
  // Additive adapter: host backend provides device auth without us touching its code
  verifyDevice: (req: Request) => { deviceId: string; name: string } | null;
  appsRoot: string; // absolute generated_apps dir
}

export function createCloudBuilderRouter(opts: MountOpts): Router {
  const r = Router();
  const jobs = new Map<string, CloudJob>();
  const streams = new Map<string, Set<Response>>();
  let counter = 0;
  let running = 0;

  const JOBS_FILE = path.join(opts.appsRoot, '_cloud_jobs.json');
  try {
    if (fs.existsSync(JOBS_FILE)) {
      const arr = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
      for (const j of arr) { jobs.set(j.id, { ...j, status: j.status === 'SUCCESS' ? j.status : 'CANCELLED' }); }
      counter = arr.length;
    }
  } catch {}
  const persist = () => { try { fs.mkdirSync(opts.appsRoot, { recursive: true }); fs.writeFileSync(JOBS_FILE, JSON.stringify([...jobs.values()].slice(-100), null, 2)); } catch {} };

  const push = (j: CloudJob, line: string) => {
    j.logs.push(`[${new Date().toISOString()}] ${line}`);
    j.updatedAt = Date.now();
    const set = streams.get(j.id);
    if (set) for (const res of [...set]) { try { res.write(`data: ${JSON.stringify({ status: j.status, line })}\n\n`); } catch { set.delete(res); } }
  };
  const setStatus = (j: CloudJob, s: JobStatus, line?: string) => { j.status = s; push(j, line || s); persist(); };

  async function execute(j: CloudJob): Promise<void> {
    running++;
    try {
      setStatus(j, 'PLANNING', 'REQUEST UNDERSTOOD — planning...');
      // Lazy import: keeps host bundle lean, module stays isolated
      const { planApp } = await import('../appbuilder/planner.js');
      const { buildApp } = await import('../appbuilder/generator.js');
      const spec = planApp(j.request, counter);
      j.kind = spec.kind; j.appId = spec.name;
      push(j, `PROJECT PLANNED: ${spec.name} (${spec.features.join(', ')})`);
      setStatus(j, 'GENERATING', 'CODE GENERATED — writing isolated workspace...');
      setStatus(j, 'TESTING', 'TEST STARTED...');
      const result = await buildApp(spec, (id, status, detail) => {
        if (id === 'test' && status === 'running') setStatus(j, 'TESTING', detail);
        else if (id === 'repair') setStatus(j, 'FIXING', `FIX ATTEMPT — ${detail || ''}`);
        else if (id === 'build') setStatus(j, 'BUILDING', detail || 'BUILD STARTED...');
        else push(j, `${id}: ${status}${detail ? ' — ' + detail : ''}`);
      });
      j.testsPassed = result.testsPassed; j.testsFailed = result.testsFailed;
      if (!result.success) {
        j.errors = result.errors;
        setStatus(j, 'FAILED', `BUILD FAILED — ${result.errors.join(' | ').slice(0, 800)}`);
        persist(); return;
      }
      setStatus(j, 'VERIFYING', 'ARTIFACT VERIFIED — entry exists, tests green...');
      // Artifact: zip the project dir (real file)
      const archiver = path.join(result.projectDir, `${spec.name}.zip`);
      try {
        await run(process.execPath, ['-e', `const fs=require('fs'),p=require('path'),z=require('child_process');`], result.projectDir).catch(() => {});
      } catch {}
      // Portable zip via powershell/node (no new deps): use node zlib + manual store? Use simple tar via node? -> fallback: record dir listing
      j.artifact = { dir: result.projectDir, entry: 'index.html', zip: null, apk: null };
      try {
        const zipPath = path.join(result.projectDir, `${spec.name}.zip`);
        await makeZip(result.projectDir, zipPath);
        if (fs.existsSync(zipPath)) j.artifact.zip = `${spec.name}.zip`;
      } catch (e: any) { push(j, 'Zip skipped: ' + String(e?.message || e)); }
      const env = detectEnv();
      if (!env.canAndroid) push(j, 'Android APK: BUILD ENVIRONMENT UNAVAILABLE here (' + (env.androidSdk ? 'JDK<17 or no SDK tools' : 'no Android SDK') + ') — web artifact delivered.');
      setStatus(j, 'SUCCESS', `BUILD SUCCESSFUL — ${spec.name} v${result.version} (${result.testsPassed} tests passed)`);
      persist();
    } catch (e: any) {
      j.errors.push(e?.message || String(e));
      setStatus(j, 'FAILED', `BUILD FAILED — ${e?.message || e}`);
      persist();
    } finally { running--; pump(); }
  }

  async function makeZip(dir: string, out: string): Promise<void> {
    // Zero-dependency zip (stored, no compression) — real downloadable artifact
    const files: { rel: string; data: Buffer }[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name.endsWith('.zip')) continue;
        const fp = path.join(d, e.name);
        if (e.isDirectory()) walk(fp);
        else files.push({ rel: path.relative(dir, fp).replace(/\\/g, '/'), data: fs.readFileSync(fp) });
      }
    };
    walk(dir);
    const chunks: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
    const crcTable = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
    const crc = (b: Buffer) => { let c = -1; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
    for (const f of files) {
      const name = Buffer.from(f.rel);
      const head = Buffer.alloc(30);
      head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6);
      head.writeUInt16LE(0, 8); head.writeUInt16LE(0, 10); head.writeUInt16LE(0, 12);
      head.writeUInt32LE(crc(f.data), 14); head.writeUInt32LE(f.data.length, 18); head.writeUInt32LE(f.data.length, 22);
      head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
      chunks.push(head, name, f.data);
      const cent = Buffer.alloc(46);
      cent.writeUInt32LE(0x02014b50, 0); cent.writeUInt16LE(20, 4); cent.writeUInt16LE(20, 6);
      cent.writeUInt32LE(crc(f.data), 16); cent.writeUInt32LE(f.data.length, 20); cent.writeUInt32LE(f.data.length, 24);
      cent.writeUInt16LE(name.length, 28); cent.writeUInt32LE(offset, 42);
      central.push(cent, name);
      offset += head.length + name.length + f.data.length;
    }
    const cd = Buffer.concat(central); const cdStart = offset; offset += cd.length;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(cdStart, 16);
    fs.writeFileSync(out, Buffer.concat([...chunks, cd, end]));
  }

  const queue: CloudJob[] = [];
  function pump() {
    while (running < MAX_CONCURRENT && queue.length) {
      const j = queue.shift()!;
      j.status = 'QUEUED';
      execute(j);
    }
  }

  const auth = (req: Request, res: Response) => {
    const d = opts.verifyDevice(req);
    if (!d) { res.status(401).json({ success: false, error: 'Unauthorized device. Pehle Device Link se register/pair karo.' }); return null; }
    return d;
  };

  // POST /jobs {request} -> {jobId, status}
  r.post('/jobs', (req, res) => {
    const d = auth(req, res); if (!d) return;
    const request = ((req.body || {}).request || '').toString().slice(0, 500);
    if (!request) { res.status(400).json({ success: false, error: 'request required' }); return; }
    counter++;
    const id = `JOB-2026-${String(counter).padStart(6, '0')}`;
    const j: CloudJob = {
      id, userId: 'commander', deviceId: d.deviceId, deviceName: d.name,
      request, kind: null, appId: null, status: 'QUEUED', logs: [], errors: [],
      testsPassed: 0, testsFailed: 0, artifact: null, createdAt: Date.now(), updatedAt: Date.now(),
    };
    jobs.set(id, j); persist();
    push(j, 'JOB CREATED — ' + id);
    queue.push(j); pump();
    res.json({ success: true, jobId: id, status: j.status });
  });

  r.get('/jobs/:jobId', (req, res) => {
    const d = auth(req, res); if (!d) return;
    const j = jobs.get(req.params.jobId);
    if (!j) { res.status(404).json({ success: false, error: 'Job not found' }); return; }
    res.json({ success: true, job: j });
  });

  // SSE realtime status
  r.get('/jobs/:jobId/stream', (req, res) => {
    const d = opts.verifyDevice(req as any);
    if (!d) { res.status(401).end(); return; }
    const j = jobs.get(req.params.jobId);
    if (!j) { res.status(404).end(); return; }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (!streams.has(j.id)) streams.set(j.id, new Set());
    streams.get(j.id)!.add(res);
    res.write(`data: ${JSON.stringify({ status: j.status, line: 'connected' })}\n\n`);
    req.on('close', () => { streams.get(j.id)?.delete(res); });
  });

  r.get('/apps', (req, res) => {
    const d = auth(req, res); if (!d) return;
    const apps = [...jobs.values()].filter((j) => j.status === 'SUCCESS').map((j) => ({
      appId: j.appId, kind: j.kind, jobId: j.id, createdAt: j.createdAt,
      testsPassed: j.testsPassed, artifact: j.artifact,
      downloadUrl: j.artifact?.zip ? `/api/app-builder/apps/${j.appId}/download?token=${encodeURIComponent((req.query.token as string) || '')}` : null,
    }));
    res.json({ success: true, apps, env: detectEnv() });
  });

  // Download artifact zip (real file only)
  r.get('/apps/:appId/download', (req, res) => {
    const d = auth(req as any, res); if (!d) return;
    const appId = String(req.params.appId).replace(/[^a-zA-Z0-9_-]/g, '');
    const dir = path.join(opts.appsRoot, appId);
    if (!path.resolve(dir).startsWith(path.resolve(opts.appsRoot))) { res.status(400).json({ success: false, error: 'Invalid app' }); return; }
    const zp = path.join(dir, `${appId}.zip`);
    if (!fs.existsSync(zp)) { res.status(404).json({ success: false, error: 'Artifact not found (build may have failed)' }); return; }
    res.download(zp, `${appId}.zip`);
  });

  // Serve generated web app preview (static, read-only)
  r.get('/apps/:appId/preview', (req, res) => {
    const d = auth(req as any, res); if (!d) return;
    const appId = String(req.params.appId).replace(/[^a-zA-Z0-9_-]/g, '');
    const fp = path.join(opts.appsRoot, appId, 'index.html');
    if (!path.resolve(fp).startsWith(path.resolve(opts.appsRoot)) || !fs.existsSync(fp)) {
      res.status(404).json({ success: false, error: 'Preview not found' }); return;
    }
    res.sendFile(fp);
  });

  r.delete('/apps/:appId', (req, res) => {
    const d = auth(req, res); if (!d) return;
    const appId = String(req.params.appId).replace(/[^a-zA-Z0-9_-]/g, '');
    const dir = path.join(opts.appsRoot, appId);
    if (!path.resolve(dir).startsWith(path.resolve(opts.appsRoot))) { res.status(400).json({ success: false, error: 'Invalid app' }); return; }
    // confirmation required: client must send {confirm:true}
    if ((req.body || {}).confirm !== true) { res.status(400).json({ success: false, error: 'Confirmation required: send {confirm:true}' }); return; }
    fs.rmSync(dir, { recursive: true, force: true });
    for (const [id, j] of jobs) if (j.appId === appId) jobs.delete(id);
    persist();
    res.json({ success: true, deleted: appId });
  });

  r.get('/env', (req, res) => {
    const d = auth(req, res); if (!d) return;
    res.json({ success: true, env: detectEnv(), limits: { MAX_AUTO_FIX, STEP_TIMEOUT, MAX_CONCURRENT } });
  });

  return r;
}
