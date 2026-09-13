import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface HUDFridayLoginProps {
  isSetup: boolean;
  onAuthenticate: (passcode: string) => Promise<boolean>;
}

/* Inline Web-Worker code — same as CYBER-LOCK: Argon2id + AES-GCM */
const WORKER_CODE = `
importScripts('https://cdn.jsdelivr.net/npm/argon2-browser@1.18.0/dist/argon2-bundled.min.js');
self.onmessage = async function(e) {
  const { type, password, fileData, keySlice, salt, mode } = e.data;
  try {
    if (type === 'process') {
      const keyBuffer = await keySlice.arrayBuffer();
      const keyHash = await crypto.subtle.digest("SHA-256", keyBuffer);
      const masterPass = password + hex(keyHash);
      const hash = await argon2.hash({
        pass: masterPass, salt: salt, type: argon2.Argon2id,
        time: 3, mem: 65536, hashLen: 32, parallelism: 1
      });
      const key = await crypto.subtle.importKey("raw", hash.hash, "AES-GCM", false, ["encrypt", "decrypt"]);
      if (mode === 'encrypt') { await runEncryption(key, fileData, salt); }
      else { await runDecryption(key, fileData); }
    }
  } catch (err) { self.postMessage({ type: 'error', msg: err.message }); }
};
async function runEncryption(key, file, salt) {
  const meta = JSON.stringify({ n: file.name, t: file.type });
  const metaEnc = await aesEncrypt(key, new TextEncoder().encode(meta));
  const parts = [];
  parts.push(new Uint8Array([0x45,0x54,0x48,0x45,0x52]));
  parts.push(salt);
  parts.push(u32(metaEnc.cipher.byteLength));
  parts.push(metaEnc.iv);
  parts.push(new Uint8Array(metaEnc.cipher));
  const fileBuffer = await file.arrayBuffer();
  const enc = await aesEncrypt(key, fileBuffer);
  parts.push(new Uint8Array([1]));
  parts.push(u32(enc.cipher.byteLength));
  parts.push(enc.iv);
  parts.push(new Uint8Array(enc.cipher));
  const finalBlob = new Blob(parts, { type: 'application/octet-stream' });
  self.postMessage({ type: 'complete', blob: finalBlob, name: file.name + '.ether' });
}
async function runDecryption(key, file) {
  const buf = await file.arrayBuffer();
  let off = 0;
  const magic = new Uint8Array(buf.slice(0, 5)); off+=5;
  if(hex(magic) !== "4554484552") throw new Error("Invalid Format");
  off+=16;
  const mLen = new Uint32Array(buf.slice(off, off+4))[0]; off+=4;
  const mIv = new Uint8Array(buf.slice(off, off+12)); off+=12;
  const mCiph = buf.slice(off, off+mLen); off+=mLen;
  let meta;
  try {
    const mDec = await crypto.subtle.decrypt({name:"AES-GCM", iv:mIv}, key, mCiph);
    meta = JSON.parse(new TextDecoder().decode(mDec));
  } catch(e) { throw new Error("Decryption Failed. Wrong Password or Keyfile."); }
  const chunks = [];
  while(off < buf.byteLength) {
    if(off+1 > buf.byteLength) break;
    const type = new Uint8Array(buf.slice(off, off+1))[0]; off+=1;
    const len = new Uint32Array(buf.slice(off, off+4))[0]; off+=4;
    const iv = new Uint8Array(buf.slice(off, off+12)); off+=12;
    const cip = buf.slice(off, off+len); off+=len;
    if(type === 1) {
      const plain = await crypto.subtle.decrypt({name:"AES-GCM", iv:iv}, key, cip);
      chunks.push(plain);
    }
  }
  const finalBlob = new Blob(chunks, { type: meta.t });
  self.postMessage({ type: 'complete', blob: finalBlob, name: meta.n });
}
async function aesEncrypt(k, d) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({name:"AES-GCM", iv:iv}, k, d);
  return {iv, cipher};
}
function u32(n) { return new Uint8Array(new Uint32Array([n]).buffer); }
function hex(b) { return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join(''); }
`;

/** FRIDAY security gate — CYBER-LOCK UI ported 1:1, naam FRIDAY ke hisab se */
export const HUDFridayLogin: React.FC<HUDFridayLoginProps> = ({ isSetup, onAuthenticate }) => {
  const [started, setStarted] = useState(false);
  const [pass, setPass] = useState('');
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('SYSTEM READY // WAITING FOR INPUT');
  const [isErr, setIsErr] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [bubble, setBubble] = useState<{ title: string; desc: string; top: number; left: number } | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const mutedRef = useRef(false);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragCount = useRef(0);
  const stateRef = useRef({ keyFile, targetFile });
  stateRef.current = { keyFile, targetFile };

  mutedRef.current = muted;

  const speak = (text: string, force = false) => {
    if (mutedRef.current && !force) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      u.voice =
        voices.find((v) => v.lang.includes('GB') && (v.name.includes('Female') || v.name.includes('Google'))) ||
        voices.find((v) => v.lang.includes('GB')) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices[0];
      u.pitch = 1.1; u.rate = 1.0;
      synth.speak(u);
    } catch {}
  };

  // Google fonts (Rajdhani + Orbitron) — CYBER-LOCK wala look
  useEffect(() => {
    const l1 = document.createElement('link');
    l1.rel = 'preconnect'; l1.href = 'https://fonts.googleapis.com';
    const l2 = document.createElement('link');
    l2.rel = 'stylesheet';
    l2.href = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Orbitron:wght@400;700;900&display=swap';
    document.head.appendChild(l1); document.head.appendChild(l2);
    return () => { try { document.head.removeChild(l1); document.head.removeChild(l2); } catch {} };
  }, []);

  // Matrix background
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const size = 16;
    let cols: number[] = [];
    const resize = () => {
      cvs.width = window.innerWidth; cvs.height = window.innerHeight;
      cols = Array(Math.floor(cvs.width / size)).fill(1);
    };
    resize();
    window.addEventListener('resize', resize);
    const draw = () => {
      ctx.fillStyle = 'rgba(5, 2, 10, 0.1)';
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.font = size + 'px monospace';
      for (let i = 0; i < cols.length; i++) {
        const ch = String.fromCharCode(0x30a0 + Math.random() * 96);
        ctx.fillStyle = Math.random() > 0.95 ? '#fff' : '#d946ef';
        ctx.fillText(ch, i * size, cols[i] * size);
        if (cols[i] * size > cvs.height && Math.random() > 0.98) cols[i] = 0;
        cols[i]++;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [started]);

  // Worker bridge
  useEffect(() => {
    const blob = new Blob([WORKER_CODE], { type: 'text/javascript' });
    const w = new Worker(URL.createObjectURL(blob));
    w.onmessage = (e) => {
      if (e.data.type === 'complete') onComplete(e.data.blob, e.data.name);
      if (e.data.type === 'error') onError(e.data.msg);
    };
    workerRef.current = w;
    return () => { try { w.terminate(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global drag-drop
  useEffect(() => {
    if (!started) return;
    const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const onEnter = (e: DragEvent) => { prevent(e); dragCount.current++; setDragActive(true); };
    const onLeave = (e: DragEvent) => { prevent(e); dragCount.current--; if (dragCount.current <= 0) { dragCount.current = 0; setDragActive(false); } };
    const onDrop = (e: DragEvent) => {
      prevent(e); dragCount.current = 0; setDragActive(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) handleDrop(f);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', prevent);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const setStatusMsg = (msg: string, err = false) => { setStatus(msg); setIsErr(err); };

  const handleDrop = (file: File) => {
    if (file.name.endsWith('.ether')) {
      setTargetFile(file); speak('Encrypted container detected.');
    } else if (!stateRef.current.keyFile) {
      setKeyFile(file); speak('Key file accepted.');
    } else {
      setTargetFile(file); speak('Target file accepted.');
    }
  };

  const init = () => {
    setStarted(true);
    try {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) window.speechSynthesis.getVoices();
    } catch {}
    speak(
      isSetup
        ? 'Welcome, Commander. I am Friday. Multithreaded core active. Create your passphrase and key file to lock the vault.'
        : 'Welcome back, Commander. I am Friday. A E S G C M encryption initialized. System ready.',
      true
    );
  };

  const tip = (el: HTMLElement, title: string, desc: string) => {
    const r = el.getBoundingClientRect();
    setBubble({ title, desc, top: r.bottom + 10, left: window.innerWidth < 600 ? 20 : r.left });
  };
  const untip = () => setBubble(null);

  const onComplete = (blob: Blob, name: string) => {
    setStatusMsg('SUCCESS'); setProgress(100);
    speak('Operation successful.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setBusy(false);
    // Decrypt success = FRIDAY login bhi khol do (passphrase se session)
    if (name && !name.endsWith('.ether') && pass.trim().length >= 4) {
      onAuthenticate(pass.trim()).catch(() => {});
    }
    setPass('');
  };

  const onError = (msg: string) => {
    setStatusMsg('ERROR: ' + msg, true);
    speak('Operation failed.');
    setBusy(false); setProgress(0);
  };

  const process = async (mode: 'encrypt' | 'decrypt') => {
    const p = pass.trim();
    // Login-only mode: sirf passphrase, koi file nahi → seedha FRIDAY auth
    if (!p) { speak('Error. Credentials missing.'); setStatusMsg('MISSING INPUTS', true); return; }
    if (!keyFile || !targetFile) {
      if (p.length < 4) { setStatusMsg('PASSPHRASE MIN 4 CHARS', true); return; }
      setBusy(true); setStatusMsg(mode === 'encrypt' ? 'VERIFYING ON SECURE THREAD...' : 'VERIFYING ON SECURE THREAD...');
      setProgress(50);
      const ok = await onAuthenticate(p);
      setProgress(100);
      if (ok) { setStatusMsg('ACCESS GRANTED — FRIDAY ONLINE'); speak('Access granted. Friday online.'); setPass(''); }
      else {
        setBusy(false); setProgress(0);
        setStatusMsg(isSetup ? 'SETUP FAILED — RETRY' : 'ACCESS DENIED — WRONG PASSPHRASE', true);
        speak('Access denied.');
        setPass('');
      }
      return;
    }
    // File crypto mode (LOCK = encrypt, UNLOCK = decrypt)
    setBusy(true);
    setStatusMsg('PROCESSING ON WORKER THREAD...');
    setProgress(50);
    speak(mode === 'encrypt' ? 'Encrypting.' : 'Decrypting.');
    let salt: Uint8Array;
    if (mode === 'encrypt') {
      salt = crypto.getRandomValues(new Uint8Array(16));
    } else {
      const slice = await new Response(targetFile.slice(0, 21)).arrayBuffer();
      salt = new Uint8Array(slice.slice(5, 21));
    }
    const keySlice = keyFile.slice(0, 2 * 1024 * 1024);
    workerRef.current?.postMessage({ type: 'process', mode, password: p, fileData: targetFile, keySlice, salt });
    setPass('');
  };

  const toggleMute = () => {
    setMuted((m) => {
      const nm = !m;
      if (!nm) setTimeout(() => speak('Audio systems online.', true), 50);
      return nm;
    });
  };

  return (
    <div className="fl-root">
      <style>{`
        .fl-root { position: fixed; inset: 0; z-index: 10001; background: #05020a; color: #fff; font-family: 'Rajdhani', sans-serif; overflow: hidden; height: 100vh; display: flex; align-items: center; justify-content: center; user-select: none; }
        .fl-root * { box-sizing: border-box; }
        #fl-matrix { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; opacity: 0.25; pointer-events: none; }
        #fl-drop { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(6,182,212,0.2); backdrop-filter: blur(5px); z-index: 999; display: flex; align-items: center; justify-content: center; border: 4px dashed #06b6d4; opacity: 0; pointer-events: none; transition: 0.3s; }
        #fl-drop.active { opacity: 1; pointer-events: all; }
        #fl-drop h2 { font-family: 'Orbitron'; font-size: 3rem; color: #fff; text-shadow: 0 0 20px #06b6d4; margin: 0; }
        #fl-init { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(5,2,10,0.98); z-index: 1000; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: opacity 0.6s; }
        #fl-init.fade-out { opacity: 0; pointer-events: none; }
        .fl-ring { width: 60px; height: 60px; border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid #d946ef; border-radius: 50%; animation: flspin 1s linear infinite; margin-bottom: 20px; }
        @keyframes flspin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .fl-panel { position: relative; z-index: 10; width: 800px; max-width: 90vw; max-height: 92vh; overflow-y: auto; padding: 40px; background: rgba(20,10,40,0.6); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; box-shadow: 0 0 50px rgba(139,92,246,0.15); transition: transform 0.4s, opacity 0.4s; opacity: 0; transform: scale(0.95) translateY(20px); }
        .fl-panel.active { opacity: 1; transform: scale(1) translateY(0); }
        .fl-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
        h1.fl-title { font-family: 'Orbitron'; margin: 0; font-size: 2.2rem; background: linear-gradient(90deg, #fff, #d946ef, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: 4px; line-height: 1.1; }
        .fl-sub { color: #8b5cf6; letter-spacing: 2px; font-size: 0.8rem; text-transform: uppercase; margin-top: 5px; }
        .fl-mute { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #06b6d4; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.3s; }
        .fl-mute:hover { background: #06b6d4; color: #000; box-shadow: 0 0 15px #06b6d4; }
        .fl-input-group { margin-bottom: 25px; position: relative; }
        .fl-input-group input { width: 100%; background: rgba(0,0,0,0.4); border: 1px solid #3f3f46; padding: 16px; color: #fff; font-family: 'Orbitron'; letter-spacing: 3px; font-size: 1.1rem; border-radius: 8px; outline: none; transition: 0.3s; }
        .fl-input-group input:focus { border-color: #d946ef; box-shadow: 0 0 20px rgba(217,70,239,0.2); }
        .fl-grid { display: grid; grid-template-columns: 1fr 2fr; gap: 15px; margin-bottom: 30px; }
        .fl-zone { border: 1px dashed #4b5563; background: rgba(255,255,255,0.01); border-radius: 12px; min-height: 110px; padding: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: 0.3s; position: relative; overflow: hidden; }
        .fl-zone:hover { background: rgba(139,92,246,0.1); border-color: #d946ef; }
        .fl-zone.active { border-style: solid; border-color: #06b6d4; background: rgba(6,182,212,0.15); }
        .fl-zone-icon { font-size: 1.8rem; margin-bottom: 8px; }
        .fl-zone-label { font-size: 0.75rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; }
        .fl-zone-file { font-size: 0.9rem; color: #fff; font-weight: 700; margin-top: 5px; max-width: 90%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fl-actions { display: flex; gap: 15px; }
        button.fl-btn { flex: 1; padding: 20px; border: none; border-radius: 8px; font-family: 'Orbitron'; font-weight: 800; font-size: 1.1rem; cursor: pointer; transition: 0.3s; text-transform: uppercase; letter-spacing: 2px; color: white; position: relative; overflow: hidden; }
        .fl-lock { background: linear-gradient(135deg, #4c1d95 0%, #d946ef 100%); }
        .fl-lock:hover { box-shadow: 0 0 30px rgba(217,70,239,0.5); transform: translateY(-2px); }
        .fl-unlock { background: linear-gradient(135deg, #0f172a 0%, #8b5cf6 100%); }
        .fl-unlock:hover { box-shadow: 0 0 30px rgba(139,92,246,0.5); transform: translateY(-2px); }
        button.fl-btn:disabled { filter: grayscale(1); opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        .fl-status-wrap { margin-top: 25px; }
        .fl-bar-bg { height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; margin-bottom: 10px; }
        .fl-bar-fill { height: 100%; width: 0%; background: #06b6d4; box-shadow: 0 0 15px #06b6d4; transition: width 0.1s linear; }
        .fl-status { font-family: 'Orbitron'; font-size: 0.8rem; color: rgba(255,255,255,0.6); text-align: center; letter-spacing: 1px; }
        #fl-bubble { position: fixed; pointer-events: none; opacity: 0; z-index: 2000; background: rgba(0,0,0,0.95); border: 1px solid #06b6d4; padding: 15px; border-radius: 0 12px 12px 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); transition: opacity 0.2s, transform 0.2s; transform: translateY(10px); max-width: 280px; }
        #fl-bubble.visible { opacity: 1; transform: translateY(0); }
        #fl-bubble h4 { color: #06b6d4; margin: 0 0 5px 0; font-family: 'Orbitron'; font-size: 0.9rem; }
        #fl-bubble p { color: #ccc; margin: 0; font-size: 0.85rem; line-height: 1.4; }
        .fl-hint { text-align: center; font-size: 0.75rem; color: #6b7280; font-family: 'Orbitron'; margin-top: 12px; letter-spacing: 1px; }
        @media (max-width: 600px) {
          .fl-panel { padding: 25px; width: 95vw; }
          h1.fl-title { font-size: 1.5rem; }
          .fl-grid { grid-template-columns: 1fr; }
          .fl-actions { flex-direction: column; }
          .fl-zone { min-height: 80px; }
        }
        .hidden { display: none !important; }
      `}</style>

      <canvas id="fl-matrix" ref={canvasRef} />

      <div id="fl-drop" className={dragActive ? 'active' : ''}>
        <h2>DROP TO LOAD</h2>
      </div>

      {!started && (
        <div id="fl-init" onClick={init}>
          <div className="fl-ring" />
          <h2 style={{ fontFamily: 'Orbitron', color: 'white', letterSpacing: 2 }}>SYSTEM STANDBY</h2>
          <p style={{ color: '#06b6d4', fontSize: '0.9rem' }}>CLICK ANYWHERE TO INITIALIZE FRIDAY</p>
        </div>
      )}

      {bubble && (
        <div id="fl-bubble" className="visible" style={{ top: bubble.top, left: bubble.left }}>
          <h4>{bubble.title}</h4>
          <p>{bubble.desc}</p>
        </div>
      )}

      <div className={`fl-panel ${started ? 'active' : ''}`}>
        <div className="fl-header">
          <div>
            <h1 className="fl-title">FRIDAY: MILITARY GRADE ENCRYPTION</h1>
            <div className="fl-sub">{isSetup ? 'Commander Vault Setup • v9.0' : 'Commander Secure Login • v9.0'}</div>
          </div>
          <div className="fl-mute" onClick={toggleMute} title="Voice toggle">
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </div>
        </div>

        <div
          className="fl-input-group"
          onMouseEnter={(e) => tip(e.currentTarget, 'PASSPHRASE', 'Enter high-entropy secret. Memory is wiped immediately after processing.')}
          onMouseLeave={untip}
        >
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder={isSetup ? 'CREATE SECURE PASSPHRASE' : 'ENTER SECURE PASSPHRASE'}
            autoFocus={started}
            onKeyDown={(e) => { if (e.key === 'Enter') process('decrypt'); }}
          />
        </div>

        <div className="fl-grid">
          <div
            className={`fl-zone ${keyFile ? 'active' : ''}`}
            onClick={() => keyInputRef.current?.click()}
            onMouseEnter={(e) => tip(e.currentTarget, '2FA KEY FILE', 'Required for file vault. Uses SHA-256 hash of any image/audio file as second factor. Login ke liye optional.')}
            onMouseLeave={untip}
          >
            <div className="fl-zone-icon">🔑</div>
            <div className="fl-zone-label">Authentication Key</div>
            <div className="fl-zone-file">{keyFile ? keyFile.name : 'No File Selected'}</div>
          </div>

          <div
            className={`fl-zone ${targetFile ? 'active' : ''}`}
            onClick={() => targetInputRef.current?.click()}
            onMouseEnter={(e) => tip(e.currentTarget, 'TARGET DATA', 'Payload to encrypt (AES-GCM) or restore. Login ke liye file zaroori nahi — sirf passphrase se UNLOCK dabao.')}
            onMouseLeave={untip}
          >
            <div className="fl-zone-icon">📦</div>
            <div className="fl-zone-label">Target File (Vault — Optional)</div>
            <div className="fl-zone-file">{targetFile ? targetFile.name : 'No File Selected'}</div>
          </div>
        </div>

        <input type="file" ref={keyInputRef} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setKeyFile(f); speak('Key file accepted.'); } }} />
        <input type="file" ref={targetInputRef} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setTargetFile(f); speak('Target file accepted.'); } }} />

        <div className="fl-actions">
          <button
            className="fl-btn fl-lock"
            disabled={busy}
            onClick={() => process('encrypt')}
            onMouseEnter={(e) => tip(e.currentTarget, 'LOCK', isSetup ? 'Setup passphrase + file vault lock (Argon2id + AES-256-GCM).' : 'Secure target using Argon2id + AES-256-GCM. Runs in background thread.')}
            onMouseLeave={untip}
          >
            LOCK
          </button>
          <button
            className="fl-btn fl-unlock"
            disabled={busy}
            onClick={() => process('decrypt')}
            onMouseEnter={(e) => tip(e.currentTarget, 'UNLOCK', 'Restore data + open FRIDAY. Sirf passphrase se bhi login hota hai. Fails instantly if integrity compromised.')}
            onMouseLeave={untip}
          >
            {busy ? 'WORKING...' : 'UNLOCK'}
          </button>
        </div>

        <div className="fl-status-wrap">
          <div className="fl-bar-bg"><div className="fl-bar-fill" style={{ width: `${progress}%`, background: isErr ? '#ef4444' : '#06b6d4' }} /></div>
          <div className="fl-status" style={{ color: isErr ? '#ef4444' : undefined }}>{status}</div>
          <div className="fl-hint">FRIDAY SECURE GATE • ARGON2ID + AES-256-GCM • {isSetup ? 'SETUP MODE' : 'LOGIN MODE'}</div>
        </div>
      </div>
    </div>
  );
};
