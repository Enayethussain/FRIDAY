// JARVIS App Builder standalone service — port 3822.
// Intentionally SEPARATE from server.ts (existing backend untouched).
// Endpoints: POST /ab/build {request}, GET /ab/apps, POST /ab/delete {id}, GET /ab/health
import express from 'express';
import { planApp } from './planner.js';
import { buildApp, listApps, deleteApp, ensureRoot } from './generator.js';

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

let counter = 0;
try {
  const apps = listApps();
  counter = apps.length;
} catch { counter = 0; }
ensureRoot();

app.get('/ab/health', (_req, res) => {
  res.json({ ok: true, service: 'friday-app-builder', supported: ['calculator', 'tictactoe'] });
});

app.get('/ab/apps', (_req, res) => {
  res.json({ success: true, apps: listApps() });
});

app.post('/ab/build', async (req, res) => {
  const request = ((req.body || {}).request || '').toString().slice(0, 500);
  if (!request) { res.status(400).json({ success: false, error: 'request required, e.g. "ek calculator app banao"' }); return; }
  counter += 1;
  try {
    const spec = planApp(request, counter);
    const result = await buildApp(spec);
    res.json({ success: result.success, spec, result });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message || String(e) });
  }
});

app.post('/ab/delete', (req, res) => {
  const id = ((req.body || {}).id || '').toString();
  if (!id) { res.status(400).json({ success: false, error: 'id required' }); return; }
  const ok = deleteApp(id);
  res.json({ success: ok });
});

const PORT = Number(process.env.APPBUILDER_PORT) || 3822;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[AppBuilder] listening on http://127.0.0.1:${PORT} (isolated, generated_apps/ only)`);
});
