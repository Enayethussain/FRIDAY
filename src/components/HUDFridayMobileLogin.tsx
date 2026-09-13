import React, { useEffect, useRef, useState } from 'react';
import { User, Lock, Eye, EyeOff, Chrome, Github, MessageCircle } from 'lucide-react';

interface HUDFridayMobileLoginProps {
  isSetup: boolean; // true = pehli baar, security code banega
  onAuthenticate: (passcode: string) => Promise<boolean>;
}

/**
 * FRIDAY access gate — Futuristic Login design port.
 * Props App.tsx ke saath SAME (isSetup / onAuthenticate) — App me zero change.
 * - "User Identification" = display only (commander tag), auth "Security Code" se hota hai
 * - Social buttons visual (original design me bhi non-functional)
 */
export const HUDFridayMobileLogin: React.FC<HUDFridayMobileLoginProps> = ({ isSetup, onAuthenticate }) => {
  const [identity, setIdentity] = useState('commander@friday.local');
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(isSetup ? 'Commander Setup' : 'System Ready');
  const [denied, setDenied] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  void remember;

  // Grid lines + morph shapes (original style.js ka port)
  useEffect(() => {
    const box = gridRef.current;
    if (!box) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 30; i++) {
      const line = document.createElement('div');
      line.className = 'fr-grid-line';
      line.style.width = '100%';
      line.style.height = '1px';
      line.style.top = i * 50 + 'px';
      line.style.animationDelay = i * 0.1 + 's';
      frag.appendChild(line);
    }
    for (let i = 0; i < 40; i++) {
      const line = document.createElement('div');
      line.className = 'fr-grid-line';
      line.style.width = '1px';
      line.style.height = '100%';
      line.style.left = i * 50 + 'px';
      line.style.animationDelay = i * 0.1 + 0.5 + 's';
      frag.appendChild(line);
    }
    for (let i = 0; i < 5; i++) {
      const shape = document.createElement('div');
      shape.className = 'fr-shape';
      const size = Math.random() * 200 + 100;
      shape.style.width = size + 'px';
      shape.style.height = size + 'px';
      shape.style.left = Math.random() * 100 + '%';
      shape.style.top = Math.random() * 100 + '%';
      shape.style.animationDelay = i * 1.6 + 's';
      shape.style.animationDuration = Math.random() * 4 + 6 + 's';
      frag.appendChild(shape);
    }
    box.appendChild(frag);
    return () => {
      box.innerHTML = '';
    };
  }, []);

  const speak = (text: string) => {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      u.voice =
        voices.find((v) => v.lang.startsWith('en') && v.name.toLowerCase().includes('female')) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        null;
      u.pitch = 1.1;
      u.rate = 1.0;
      speechSynthesis.speak(u);
    } catch {}
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || code.trim().length < 4) return;
    setBusy(true);
    setDenied(false);
    setStatus('Authenticating...');
    try {
      const ok = await onAuthenticate(code.trim());
      if (ok) {
        setStatus('Access Granted');
        speak(isSetup ? 'Security code set. Friday online.' : 'Access granted. Friday online.');
      } else {
        setDenied(true);
        setStatus('Access Denied');
        speak('Access denied.');
        setCode('');
        setTimeout(() => setStatus(isSetup ? 'Commander Setup' : 'System Ready'), 2000);
      }
    } catch {
      setDenied(true);
      setStatus('Access Denied');
      setCode('');
      setTimeout(() => setStatus(isSetup ? 'Commander Setup' : 'System Ready'), 2000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fr-root">
      <style>{`
        .fr-root { position: fixed; inset: 0; z-index: 10001; font-family: 'Courier New', monospace; background: #0a0e27; display: flex; justify-content: center; align-items: center; min-height: 100vh; overflow: hidden; }
        .fr-root * { box-sizing: border-box; }
        .fr-grid-container { position: absolute; width: 100%; height: 100%; overflow: hidden; }
        .fr-grid-line { position: absolute; background: linear-gradient(90deg, transparent, #00ffff, transparent); opacity: 0.3; animation: frPulse 3s ease-in-out infinite; }
        @keyframes frPulse { 0%,100% { opacity: 0.2; } 50% { opacity: 0.5; } }
        .fr-shape { position: absolute; border: 2px solid rgba(0,255,255,0.3); animation: frMorph 8s ease-in-out infinite; }
        @keyframes frMorph {
          0%,100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: rotate(0deg) scale(1); }
          25% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; transform: rotate(90deg) scale(1.1); }
          50% { border-radius: 50%; transform: rotate(180deg) scale(0.9); }
          75% { border-radius: 70% 30% 40% 60% / 40% 70% 60% 30%; transform: rotate(270deg) scale(1.05); }
        }
        .fr-login { position: relative; z-index: 10; width: 450px; max-width: 92vw; max-height: 94vh; overflow-y: auto; background: rgba(10,14,39,0.8); border: 2px solid rgba(0,255,255,0.3); border-radius: 20px; padding: 40px; box-shadow: 0 0 50px rgba(0,255,255,0.2); backdrop-filter: blur(10px); }
        .fr-header { text-align: center; margin-bottom: 40px; position: relative; }
        .fr-scan { position: absolute; width: 100%; height: 2px; background: linear-gradient(90deg, transparent, #00ffff, transparent); top: 0; animation: frScan 2s linear infinite; }
        @keyframes frScan { 0% { top: 0; opacity: 1; } 100% { top: 100%; opacity: 0; } }
        .fr-header h1 { font-size: 32px; color: #00ffff; text-transform: uppercase; letter-spacing: 4px; margin: 0 0 10px 0; text-shadow: 0 0 20px rgba(0,255,255,0.5); animation: frGlitch 5s infinite; font-weight: bold; }
        @keyframes frGlitch { 0%,90%,100% { transform: translate(0); } 91% { transform: translate(-2px,2px); } 92% { transform: translate(2px,-2px); } 93% { transform: translate(-2px,-2px); } 94% { transform: translate(2px,2px); } }
        .fr-status { color: #00ff88; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; margin: 0; }
        .fr-status.err { color: #ff5555; }
        .fr-status::before { content: '▶ '; animation: frBlink 1s infinite; }
        @keyframes frBlink { 0%,50% { opacity: 1; } 51%,100% { opacity: 0; } }
        .fr-group { margin-bottom: 25px; }
        .fr-label { display: block; color: #00ffff; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px; font-weight: bold; }
        .fr-wrap { position: relative; display: flex; align-items: center; }
        .fr-input { width: 100%; padding: 15px 15px 15px 45px; background: rgba(0,255,255,0.05); border: 1px solid rgba(0,255,255,0.3); border-radius: 8px; color: #00ffff; font-family: 'Courier New', monospace; font-size: 14px; outline: none; transition: all 0.3s ease; }
        .fr-input:focus { background: rgba(0,255,255,0.1); border-color: #00ffff; box-shadow: 0 0 20px rgba(0,255,255,0.3); }
        .fr-input::placeholder { color: rgba(0,255,255,0.4); }
        .fr-ficon { position: absolute; left: 15px; color: #00ffff; pointer-events: none; display: flex; }
        .fr-ticon { position: absolute; right: 15px; color: #00ffff; cursor: pointer; transition: all 0.3s ease; display: flex; background: none; border: none; padding: 0; }
        .fr-ticon:hover { color: #00ff88; transform: scale(1.2); }
        .fr-checkrow { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .fr-check { display: flex; align-items: center; color: rgba(0,255,255,0.7); font-size: 12px; cursor: pointer; }
        .fr-check input { margin-right: 8px; width: 16px; height: 16px; cursor: pointer; accent-color: #00ffff; }
        .fr-forgot { color: rgba(0,255,255,0.7); font-size: 12px; text-decoration: none; transition: all 0.3s ease; background: none; border: none; cursor: pointer; font-family: inherit; padding: 0; }
        .fr-forgot:hover { color: #00ffff; text-shadow: 0 0 10px rgba(0,255,255,0.5); }
        .fr-submit { width: 100%; padding: 16px; background: linear-gradient(135deg, rgba(0,255,255,0.2), rgba(0,255,136,0.2)); border: 2px solid #00ffff; border-radius: 8px; color: #00ffff; font-family: 'Courier New', monospace; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 3px; cursor: pointer; position: relative; overflow: hidden; transition: all 0.3s ease; }
        .fr-submit::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(0,255,255,0.4), transparent); transition: left 0.5s ease; }
        .fr-submit:hover::before { left: 100%; }
        .fr-submit:hover:not(:disabled) { background: linear-gradient(135deg, rgba(0,255,255,0.3), rgba(0,255,136,0.3)); box-shadow: 0 0 30px rgba(0,255,255,0.5); transform: translateY(-2px); }
        .fr-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .fr-div { display: flex; align-items: center; margin: 30px 0; }
        .fr-div::before, .fr-div::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(0,255,255,0.3), transparent); }
        .fr-div span { padding: 0 15px; color: rgba(0,255,255,0.5); font-size: 11px; letter-spacing: 2px; }
        .fr-social { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px; }
        .fr-soc { padding: 12px; background: rgba(0,255,255,0.05); border: 1px solid rgba(0,255,255,0.3); border-radius: 8px; color: #00ffff; cursor: pointer; transition: all 0.3s ease; display: flex; justify-content: center; align-items: center; }
        .fr-soc:hover { background: rgba(0,255,255,0.15); border-color: #00ffff; box-shadow: 0 0 20px rgba(0,255,255,0.3); transform: translateY(-3px); }
        .fr-reg { text-align: center; margin-top: 25px; }
        .fr-reg span { color: #00ff88; font-size: 13px; letter-spacing: 1px; }
        .fr-corner { position: absolute; width: 20px; height: 20px; border: 2px solid #00ffff; }
        .fr-tl { top: 10px; left: 10px; border-right: none; border-bottom: none; }
        .fr-tr { top: 10px; right: 10px; border-left: none; border-bottom: none; }
        .fr-bl { bottom: 10px; left: 10px; border-right: none; border-top: none; }
        .fr-br { bottom: 10px; right: 10px; border-left: none; border-top: none; }
        .fr-credit { text-align: center; margin-top: 22px; }
        .fr-credit p { color: rgba(0,255,255,0.6); font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin: 0; animation: frFadeGlow 3s ease-in-out infinite; }
        @keyframes frFadeGlow { 0%,100% { opacity: 0.6; text-shadow: 0 0 5px rgba(0,255,255,0.3); } 50% { opacity: 1; text-shadow: 0 0 15px rgba(0,255,255,0.6); } }
      `}</style>

      <div className="fr-grid-container" ref={gridRef} />

      <div className="fr-login">
        <div className="fr-corner fr-tl" />
        <div className="fr-corner fr-tr" />
        <div className="fr-corner fr-bl" />
        <div className="fr-corner fr-br" />

        <div className="fr-header">
          <div className="fr-scan" />
          <h1>{isSetup ? 'Friday Setup' : 'Access'}</h1>
          <p className={`fr-status ${denied ? 'err' : ''}`}>{status}</p>
        </div>

        <form onSubmit={submit}>
          <div className="fr-group">
            <label className="fr-label">User Identification</label>
            <div className="fr-wrap">
              <span className="fr-ficon"><User size={16} /></span>
              <input
                type="text"
                className="fr-input"
                placeholder="Enter commander tag"
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
              />
            </div>
          </div>

          <div className="fr-group">
            <label className="fr-label">Security Code</label>
            <div className="fr-wrap">
              <span className="fr-ficon"><Lock size={16} /></span>
              <input
                type={showCode ? 'text' : 'password'}
                className="fr-input"
                style={{ paddingRight: 45 }}
                placeholder={isSetup ? 'Create security code (min 4)' : 'Enter security code'}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
              <button type="button" className="fr-ticon" onClick={() => setShowCode(!showCode)} aria-label="Toggle code visibility">
                {showCode ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="fr-checkrow">
            <label className="fr-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Remember Session</span>
            </label>
            <button type="button" className="fr-forgot" onClick={() => setStatus('Contact Commander Enayet')}>Recovery Mode?</button>
          </div>

          <button type="submit" className="fr-submit" disabled={busy || code.trim().length < 4}>
            {busy ? 'Verifying...' : isSetup ? 'Set Code & Enter' : 'Initialize Login'}
          </button>
        </form>

        <div className="fr-div">
          <span>ALTERNATIVE ACCESS</span>
        </div>

        <div className="fr-social">
          <button type="button" className="fr-soc" title="Google Auth — coming soon" onClick={() => setStatus('Google Auth — Coming Soon')}>
            <Chrome size={20} />
          </button>
          <button type="button" className="fr-soc" title="GitHub Auth — coming soon" onClick={() => setStatus('GitHub Auth — Coming Soon')}>
            <Github size={20} />
          </button>
          <button type="button" className="fr-soc" title="Discord Auth — coming soon" onClick={() => setStatus('Discord Auth — Coming Soon')}>
            <MessageCircle size={20} />
          </button>
        </div>

        <div className="fr-reg">
          <span>{isSetup ? 'FIRST RUN — CODE BECOMES MASTER' : 'FRIDAY SECURE GATE →'}</span>
        </div>

        <div className="fr-credit">
          <p>── Friday Secure Systems ──</p>
        </div>
      </div>
    </div>
  );
};
