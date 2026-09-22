/**
 * JARVIS desktop preload — minimal, audited bridge.
 * Renderer NEVER gets node access; only these explicit channels.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('fridayDesktop', {
  isDesktop: true,
  /** run one PC-bridge command ({cmd, ...}) -> result object (throws Error with real reason) */
  pc: (cmd) => ipcRenderer.invoke('pc', cmd),
  /** open a real OS path (file/document) with its default app */
  openPath: (p) => ipcRenderer.invoke('pc-open-path', p),
  /** verified phone transfer of a real Windows file path */
  ftSendPath: (filePath, token, toDeviceId) => ipcRenderer.invoke('ft-send-path', { filePath, token, toDeviceId }),
  /** real filesystem path for a dropped File (drag & drop) */
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return ''; }
  },
  onFtProgress: (cb) => {
    const fn = (_e, p) => { try { cb(p); } catch {} };
    ipcRenderer.on('ft-progress', fn);
    return () => ipcRenderer.removeListener('ft-progress', fn);
  },
  /** shell -> renderer events: friday-voice(bool), friday-gestures(bool), friday-open-secure, friday-open-permissions, friday-state(string) */
  on: (channel, cb) => {
    const allowed = ['friday-voice', 'friday-gestures', 'friday-open-secure', 'friday-open-permissions', 'friday-state'];
    if (!allowed.includes(channel)) return () => {};
    const fn = (_e, ...args) => { try { cb(...args); } catch {} };
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
  shellInfo: () => ipcRenderer.invoke('shell-info'),
});
