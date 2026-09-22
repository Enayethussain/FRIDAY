/**
 * JARVIS desktop shell (Electron main process).
 * - Owns the backend: reuses a healthy local server or spawns it (dev: tsx,
 *   packaged: bundled server.cjs). Localhost stays an internal detail.
 * - Single instance, system tray, Windows startup toggle, display modes.
 * - PC bridge: ONE persistent PowerShell helper (user32/Add-Type compiled
 *   once) driven over stdin with a JSON-lines protocol — real OS actions.
 * - Verified FT sender for drag-dropped Windows files (manifest+chunks+receipt).
 */
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, dialog } = require('electron');
const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const isDev = !app.isPackaged;
const APP_ROOT = isDev ? path.join(__dirname, '..') : path.join(process.resourcesPath, 'app.asar.unpacked');
let PORT = Number(process.env.FRIDAY_PORT || 3000);
let SERVER_URL = '';
let mainWindow = null;
let tray = null;
let hudOverlay = false;
let serverProc = null;
// Supervisor state machine (PART O): only the supervisor declares READY.
let supervisorState = 'OFFLINE'; // OFFLINE|INITIALIZING|READY|DEGRADED|ERROR|STOPPING

function log(...a) { try { console.log('[friday-shell]', ...a); } catch {} }

function setSupervisorState(s) {
  supervisorState = s;
  log('state ->', s);
  try { if (tray && !tray.isDestroyed()) tray.setToolTip(`FRIDAY — ${s}`); } catch {}
}

// ---------- CLI: --status / --diagnose (no window, honest probe, then exit) ----------
async function cliProbe() {
  const out = (s) => { try { console.log(s); } catch {} };
  const backend = await healthCheck(PORT);
  if (process.argv.includes('--status')) {
    out(`FRIDAY Startup: ${backend ? 'ONLINE' : 'OFFLINE'}`);
    out(`Backend: ${backend ? `ONLINE (${SERVER_URL || `http://localhost:${PORT}`})` : 'OFFLINE'}`);
    out('AI/Voice/Gesture/Hologram/HUD: see in-app HUD (require running app)');
    app.exit(backend ? 0 : 1);
    return true;
  }
  if (process.argv.includes('--diagnose')) {
    const ok = (c) => (c ? '[PASS]' : '[FAIL]');
    out(`${ok(true)} Electron ${process.versions.electron}`);
    out(`${ok(true)} Node ${process.version}`);
    out(`${ok(fs.existsSync(path.join(APP_ROOT, 'package.json')))} Project ${APP_ROOT}`);
    out(`${ok(fs.existsSync(path.join(__dirname, 'preload.cjs')))} Preload bridge`);
    out(`${ok(fs.existsSync(path.join(__dirname, 'tray.png')))} Tray icon`);
    out(`${backend ? '[PASS]' : '[FAIL]'} Backend http://localhost:${PORT}`);
    try {
      const { execSync } = require('node:child_process');
      const t = execSync('schtasks /query /tn "JARVIS" 2>&1').toString();
      out(`${t.includes('JARVIS') && !t.includes('ERROR') ? '[PASS]' : '[WARN]'} Startup task ${t.includes('ERROR') ? 'not installed' : 'installed'}`);
    } catch { out('[WARN] Startup task check failed'); }
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/hologram/providers`).then((x) => x.json()).catch(() => null);
      const names = r && r.success ? r.providers.map((p) => p.provider_name).join(',') : '';
      out(`${r && r.success ? '[PASS]' : '[FAIL]'} Hologram providers${names ? ` (${names})` : ''}`);
    } catch { out('[FAIL] Hologram providers'); }
    app.exit(backend ? 0 : 1);
    return true;
  }
  return false;
}

// ---------- backend ownership ----------
function healthCheck(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 2500 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { try { req.destroy(); } catch {} resolve(false); });
  });
}

async function ensureServer() {
  for (let p = 0; p < 5; p++) {
    const port = PORT + p;
    // eslint-disable-next-line no-await-in-loop
    if (await healthCheck(port)) {
      PORT = port;
      SERVER_URL = `http://localhost:${PORT}`;
      log('reusing healthy server', SERVER_URL);
      return;
    }
  }
  // spawn our own. process.execPath is Electron (not Node) — ELECTRON_RUN_AS_NODE
  // makes it behave as plain Node so server.ts/server.cjs actually boots.
  const env = { ...process.env, PORT: String(PORT), ELECTRON_RUN_AS_NODE: '1' };
  if (isDev) {
    const tsx = path.join(APP_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    serverProc = spawn(process.execPath, [tsx, 'server.ts'], { cwd: APP_ROOT, env, stdio: 'ignore', windowsHide: true });
  } else {
    const srv = path.join(process.resourcesPath, 'server', 'server.cjs');
    // cwd = resources dir: server resolves ./dist + ./server.log relative to it.
    serverProc = spawn(process.execPath, [srv], { cwd: process.resourcesPath, env, stdio: 'ignore', windowsHide: true });
  }
  log('spawned server, waiting for health…');
  for (let i = 0; i < 60; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1000));
    // eslint-disable-next-line no-await-in-loop
    if (await healthCheck(PORT)) {
      SERVER_URL = `http://localhost:${PORT}`;
      serverOurs = true;
      serverRestarts = 0; // healthy boot resets the crash budget
      watchServer();
      log('server ready', SERVER_URL);
      return;
    }
    if (serverProc && serverProc.exitCode !== null) throw new Error('Server process died during boot');
  }
  throw new Error('Server did not become healthy in 60s');
}

// ---------- crash recovery: restart OUR server (max 3, 5s delay, no loops) ----------
let serverOurs = false;
let serverRestarts = 0;
let serverWatching = false;
const MAX_RESTARTS = 3;
const RESTART_DELAY_MS = 5000;

function watchServer() {
  if (serverWatching || !serverProc) return;
  serverWatching = true;
  serverProc.on('exit', async (code) => {
    serverWatching = false;
    if (app.quitting || !serverOurs) return;
    log(`server exited (code ${code}), restarts used: ${serverRestarts}/${MAX_RESTARTS}`);
    if (serverRestarts >= MAX_RESTARTS) {
      setSupervisorState('ERROR');
      sendToUI('friday-state', supervisorState);
      dialog.showMessageBoxSync({
        type: 'error', title: 'FRIDAY SERVICE ERROR',
        message: 'Backend repeatedly crashed and was not restarted.',
        detail: 'Check server.log / Diagnostics, then Restart FRIDAY from the tray.',
        buttons: ['OK'],
      });
      return;
    }
    serverRestarts += 1;
    setSupervisorState('DEGRADED');
    sendToUI('friday-state', supervisorState);
    await new Promise((r) => setTimeout(r, RESTART_DELAY_MS));
    if (app.quitting) return;
    try {
      serverProc = null;
      await ensureServer();
      if (await healthCheck(PORT)) {
        setSupervisorState('READY');
        sendToUI('friday-state', supervisorState);
        log('server recovered');
      }
    } catch (e) {
      log('server restart failed:', e && e.message);
    }
  });
}

// ---------- PC bridge: persistent PowerShell helper ----------
const PS_HELPER = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class U32 {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, UIntPtr e);
  public struct POINT { public int X; public int Y; }
}
"@ | Out-Null
$wsh = New-Object -ComObject WScript.Shell
function Out($o) { $o | ConvertTo-Json -Compress | Write-Output }
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try {
    $c = $line | ConvertFrom-Json
    $r = $null
    switch ($c.cmd) {
      "ping" { $r = @{ ok = $true } }
      "move" { [U32]::SetCursorPos([int]$c.x, [int]$c.y) | Out-Null; $r = @{ ok = $true } }
      "pos" { $p = New-Object U32+POINT; [U32]::GetCursorPos([ref]$p) | Out-Null; $r = @{ ok = $true; x = $p.X; y = $p.Y } }
      "click" {
        $btn = "$($c.button)".ToLower()
        if ($btn -eq "right") { $d=0x0008; $u=0x0010 } elseif ($btn -eq "middle") { $d=0x0020; $u=0x0040 } else { $d=0x0002; $u=0x0004 }
        [U32]::mouse_event($d,0,0,0,[UIntPtr]::Zero); [U32]::mouse_event($u,0,0,0,[UIntPtr]::Zero); $r = @{ ok = $true }
      }
      "down" { [U32]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero); $r = @{ ok = $true } }
      "up" { [U32]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero); $r = @{ ok = $true } }
      "scroll" { [U32]::mouse_event(0x0800,0,0,[uint32]([int]$c.delta),[UIntPtr]::Zero); $r = @{ ok = $true } }
      "key" {
        # named media keys via keybd_event, or SendKeys string for combos
        $k = "$($c.key)".ToUpper()
        $map = @{ VOLUME_UP=0xAF; VOLUME_DOWN=0xAE; MUTE=0xAD; PLAY_PAUSE=0xB3; NEXT=0xB0; PREV=0xB1 }
        if ($map.ContainsKey($k)) { [U32]::keybd_event($map[$k],0,0,[UIntPtr]::Zero); [U32]::keybd_event($map[$k],0,2,[UIntPtr]::Zero); $r = @{ ok = $true; via = "media-key" } }
        elseif ($c.sendkeys) { $wsh.SendKeys($c.sendkeys); $r = @{ ok = $true; via = "sendkeys" } }
        else { throw "unknown key: $($c.key)" }
      }
      "bright" {
        $m = Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods -ErrorAction Stop | Select-Object -First 1
        if ($null -eq $m) { throw "BRIGHTNESS_UNAVAILABLE" }
        $m.WmiSetBrightness(1, [int]$c.level) | Out-Null
        $cur = (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness
        $r = @{ ok = $true; level = $cur }
      }
      "lock" { rundll32.exe user32.dll,LockWorkStation; $r = @{ ok = $true } }
      "shutdown" { shutdown /s /t ([int]$c.secs); $r = @{ ok = $true } }
      "restart" { shutdown /r /t ([int]$c.secs); $r = @{ ok = $true } }
      "sleep" { rundll32.exe powrprof.dll,SetSuspendState 0,1,0; $r = @{ ok = $true } }
      "cancel" { shutdown /a; $r = @{ ok = $true } }
      default { throw "unknown cmd: $($c.cmd)" }
    }
    Out(@{ id = $c.id; result = $r })
  } catch {
    Out(@{ id = (try { ($line | ConvertFrom-Json).id } catch { 0 }); error = $_.Exception.Message })
  }
}
`;
let psProc = null;
let psId = 0;
const psPending = new Map();
let psBuf = '';

function psStart() {
  if (psProc && psProc.exitCode === null) return;
  psBuf = '';
  psProc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  psProc.stdout.on('data', (d) => {
    psBuf += d.toString();
    let idx;
    while ((idx = psBuf.indexOf('\n')) >= 0) {
      const line = psBuf.slice(0, idx).trim();
      psBuf = psBuf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const p = psPending.get(msg.id);
        if (p) { psPending.delete(msg.id); if (msg.error) p.reject(new Error(msg.error)); else p.resolve(msg.result); }
      } catch {}
    }
  });
  psProc.on('exit', () => {
    for (const [, p] of psPending) p.reject(new Error('PC bridge died'));
    psPending.clear();
  });
  psProc.stdin.write(PS_HELPER + '\n');
}

function psCall(cmd, timeoutMs = 8000) {
  psStart();
  return new Promise((resolve, reject) => {
    const id = ++psId;
    const timer = setTimeout(() => { psPending.delete(id); reject(new Error('PC bridge timeout')); }, timeoutMs);
    psPending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    try {
      psProc.stdin.write(JSON.stringify({ id, ...cmd }) + '\n');
    } catch (e) {
      psPending.delete(id);
      clearTimeout(timer);
      reject(e);
    }
  });
}

// ---------- verified FT sender (Windows file -> paired phone) ----------
async function postJson(url, body, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    const j = await res.json();
    if (!res.ok || !j.success) throw new Error(j.error || `HTTP ${res.status}`);
    return j;
  } finally { clearTimeout(t); }
}
async function ftSendFile(filePath, token, toDeviceId, onProg) {
  const data = await fs.promises.readFile(filePath);
  if (data.length === 0 || data.length > 8 * 1024 * 1024) throw new Error('File 1 byte – 8 MB ke beech honi chahiye.');
  const crypto = require('node:crypto');
  const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  const name = path.basename(filePath);
  const CH = 48 * 1024;
  const chunks = [];
  for (let o = 0; o < data.length; o += CH) chunks.push(data.subarray(o, o + CH).toString('base64'));
  const begin = await postJson(`${SERVER_URL}/api/ft/begin`, { token, name, size: data.length, chunks: chunks.length, sha256, toDeviceId });
  for (let i = 0; i < chunks.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    await postJson(`${SERVER_URL}/api/ft/chunk`, { token, id: begin.id, idx: i, data: chunks[i] });
    onProg && onProg({ sent: i + 1, total: chunks.length });
  }
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 2000));
    // eslint-disable-next-line no-await-in-loop
    const r = await fetch(`${SERVER_URL}/api/ft/receipt?token=${encodeURIComponent(token)}&id=${encodeURIComponent(begin.id)}`).then((x) => x.json()).catch(() => null);
    if (r && r.success && r.complete && r.receiptSize === data.length && (!r.wantsHash || r.hashOk === true)) {
      return { name, size: data.length };
    }
    if (r && r.success && r.complete) throw new Error(`Receipt mismatch (size ${r.receiptSize}, hashOk ${r.hashOk}).`);
  }
  throw new Error('Receiver se confirmation nahi mili (5 min).');
}

// ---------- window ----------
function appIcon() {
  try {
    const p = path.join(__dirname, 'tray.png');
    if (fs.existsSync(p)) return nativeImage.createFromPath(p);
  } catch {}
  return undefined;
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#04070d',
    title: 'FRIDAY',
    icon: appIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(SERVER_URL);
  mainWindow.on('close', (e) => {
    if (!app.quitting) {
      e.preventDefault();
      mainWindow.hide(); // minimize-to-tray
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function setHudOverlay(on) {
  hudOverlay = on;
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const wasVisible = mainWindow.isVisible();
  mainWindow.destroy();
  mainWindow = null;
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    backgroundColor: '#04070d',
    title: 'FRIDAY',
    autoHideMenuBar: true,
    frame: !on,
    transparent: on,
    alwaysOnTop: on,
    skipTaskbar: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.loadURL(SERVER_URL);
  mainWindow.on('close', (e) => { if (!app.quitting) { e.preventDefault(); mainWindow.hide(); } });
  mainWindow.on('closed', () => { mainWindow = null; });
  if (wasVisible) mainWindow.show();
}

function sendToUI(channel, ...args) {
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args); } catch {}
}

// ---------- tray ----------
function buildTray() {
  let icon = nativeImage.createEmpty();
  try {
    const p = path.join(__dirname, 'tray.png');
    if (fs.existsSync(p)) icon = nativeImage.createFromPath(p);
  } catch {}
  tray = new Tray(icon);
  tray.setToolTip('FRIDAY');
  const vc = () => false;
  const menu = Menu.buildFromTemplate([
    { label: 'Show FRIDAY', click: () => { if (!mainWindow) createWindow(); mainWindow.show(); } },
    { label: 'Hide FRIDAY', click: () => { try { mainWindow.hide(); } catch {} } },
    { type: 'separator' },
    { label: hudOverlay ? '✓ HUD overlay' : 'HUD overlay', type: 'checkbox', checked: hudOverlay, click: (i) => setHudOverlay(i.checked) },
    { label: 'Fullscreen', click: () => { try { mainWindow.setFullScreen(!mainWindow.isFullScreen()); } catch {} } },
    { type: 'separator' },
    { label: 'Pause gesture control', click: () => sendToUI('friday-gestures', false) },
    { label: 'Resume gesture control', click: () => sendToUI('friday-gestures', true) },
    { label: 'Enable voice', click: () => sendToUI('friday-voice', true) },
    { label: 'Disable voice', click: () => sendToUI('friday-voice', false) },
    { type: 'separator' },
    { label: 'Device status', click: () => { sendToUI('friday-open-secure'); if (!mainWindow) createWindow(); mainWindow.show(); } },
    { label: 'Settings', click: () => { sendToUI('friday-open-permissions'); if (!mainWindow) createWindow(); mainWindow.show(); } },
    { label: 'Launch at Windows startup', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked, name: 'FRIDAY' }) },
    { type: 'separator' },
    {
      label: 'Developer', submenu: [
        { label: `Open ${SERVER_URL}`, click: () => shell.openExternal(SERVER_URL) },
        { label: 'Copy server URL', click: () => { try { require('electron').clipboard.writeText(SERVER_URL); } catch {} } },
        { label: 'Toggle DevTools', click: () => { try { mainWindow.webContents.toggleDevTools(); } catch {} } },
      ],
    },
    { label: 'Restart FRIDAY', click: () => { app.relaunch(); app.exit(0); } },
    { label: 'Exit FRIDAY', click: () => { app.quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => { try { if (mainWindow.isVisible()) mainWindow.hide(); else mainWindow.show(); } catch {} });
  tray.on('right-click', () => { buildTrayRefresh(); });
  function buildTrayRefresh() { try { tray.setContextMenu(menu); } catch {} }
  void vc;
}

// ---------- IPC ----------
ipcMain.handle('pc', async (_e, cmd) => psCall(cmd));
ipcMain.handle('pc-open-path', async (_e, p) => {
  const r = await shell.openPath(p);
  if (r) throw new Error(r);
  return true;
});
ipcMain.handle('ft-send-path', async (e, { filePath, token, toDeviceId }) => {
  const wc = e.sender;
  const r = await ftSendFile(filePath, token, toDeviceId, (p) => {
    try { wc.send('ft-progress', p); } catch {}
  });
  return r;
});
ipcMain.handle('shell-info', () => ({ serverUrl: SERVER_URL, hudOverlay, isDesktop: true, supervisorState, autostart: process.argv.includes('--autostart') }));

// ---------- boot ----------
app.setAppUserModelId('com.friday.ai');
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    try { if (!mainWindow) createWindow(); mainWindow.show(); } catch {}
  });
  if (process.argv.includes('--status') || process.argv.includes('--diagnose')) {
    // No window, no whenReady dependency (works headless): probe, print, exit.
    cliProbe().then(() => {}).catch(() => { try { app.exit(1); } catch {} });
  }
  app.whenReady().then(async () => {
    if (process.argv.includes('--status') || process.argv.includes('--diagnose')) return;
    setSupervisorState('INITIALIZING');
    try {
      await ensureServer();
    } catch (e) {
      setSupervisorState('ERROR');
      log('server boot failed:', e && e.message);
      const c = dialog.showMessageBoxSync({
        type: 'error', title: 'FRIDAY SERVICE ERROR',
        message: 'FRIDAY backend start nahi ho paya.',
        detail: String((e && e.message) || e),
        buttons: ['Retry', 'Diagnostics', 'Exit'],
      });
      if (c === 0) { app.relaunch(); app.exit(0); return; }
      if (c === 1) { try { shell.openPath(path.join(isDev ? APP_ROOT : process.resourcesPath, 'server.log')); } catch {} }
      app.quit();
      return;
    }
    psStart();
    createWindow();
    buildTray();
    setSupervisorState('READY'); // only the supervisor declares READY
    sendToUI('friday-state', supervisorState);
    if (process.argv.includes('--smoke')) {
      const done = (ok, extra) => {
        try { console.log(ok ? 'SMOKE_OK' : `SMOKE_FAIL ${extra || ''}`); } catch {}
        app.exit(ok ? 0 : 1);
      };
      const to = setTimeout(() => done(false, 'timeout'), 45000);
      try {
        mainWindow.once('ready-to-show', () => {
          setTimeout(() => { clearTimeout(to); done(true); }, 4000);
        });
      } catch (e) { clearTimeout(to); done(false, String(e && e.message || e)); }
    }
  });
  app.on('window-all-closed', () => { /* tray keeps us alive on Windows */ });
  app.on('before-quit', () => { setSupervisorState('STOPPING'); app.quitting = true; try { psProc && psProc.kill(); } catch {} try { if (serverOurs && serverProc) serverProc.kill(); } catch {} });
}
