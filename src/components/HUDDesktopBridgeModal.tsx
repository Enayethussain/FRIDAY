import React, { useState } from 'react';
import {
  Monitor,
  Terminal,
  Copy,
  Check,
  X,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Calculator,
  Play,
  FileSearch,
  FolderOpen,
} from 'lucide-react';
import { ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';
import { SoundEffects } from '../utils/SoundEffects';

interface HUDDesktopBridgeModalProps {
  isOpen: boolean;
  theme: ThemeAccent;
  onClose: () => void;
  onOpenCalculator: () => void;
  onOpenYouTube: () => void;
  onOpenFileVault: () => void;
  onOpenPrivateVault: () => void;
}

export const HUDDesktopBridgeModal: React.FC<HUDDesktopBridgeModalProps> = ({
  isOpen,
  theme,
  onClose,
  onOpenCalculator,
  onOpenYouTube,
  onOpenFileVault,
  onOpenPrivateVault,
}) => {
  const currentTheme = THEMES[theme] || THEMES.cyan;
  const [copiedScript, setCopiedScript] = useState(false);
  const [activeTab, setActiveTab] = useState<'in_app' | 'native_bridge'>('in_app');

  if (!isOpen) return null;

  const pythonScript = `# F.R.I.D.A.Y. LOCAL PC COMPANION BRIDGE v1.0
# Run this lightweight script on Windows / Mac / Linux to let FRIDAY open native PC apps via voice!
# Requirements: pip install flask flask-cors
import os, subprocess, sys
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "connected", "os": sys.platform})

@app.route('/execute', methods=['POST'])
def execute_app():
    data = request.json or {}
    command = data.get('action', '').lower()
    
    if command in ['calc', 'calculator']:
        if sys.platform == 'win32':
            subprocess.Popen(['calc.exe'])
        elif sys.platform == 'darwin':
            subprocess.Popen(['open', '-a', 'Calculator'])
        else:
            subprocess.Popen(['gnome-calculator'])
        return jsonify({"success": True, "app": "Calculator opened"})

    elif command in ['notepad', 'notes']:
        if sys.platform == 'win32':
            subprocess.Popen(['notepad.exe'])
        else:
            subprocess.Popen(['gedit'])
        return jsonify({"success": True, "app": "Notepad opened"})

    elif command in ['code', 'vscode']:
        subprocess.Popen(['code', '.'])
        return jsonify({"success": True, "app": "VS Code opened"})

    elif command in ['youtube', 'browser']:
        import webbrowser
        webbrowser.open('https://youtube.com')
        return jsonify({"success": True, "app": "YouTube launched in default browser"})

    return jsonify({"error": "Unknown command"}), 400

if __name__ == '__main__':
    print("[FRIDAY PC BRIDGE] Listening on http://localhost:3821")
    app.run(host='127.0.0.1', port=3821)
`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(pythonScript);
    setCopiedScript(true);
    SoundEffects.playCurriculumUpdated();
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div
      id="desktop-bridge-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 font-mono"
      onClick={onClose}
    >
      <div
        id="desktop-bridge-modal"
        className="w-full max-w-3xl h-[88vh] sm:h-[80vh] bg-[#070b16] border rounded-2xl flex flex-col shadow-2xl relative overflow-hidden"
        style={{
          borderColor: `${currentTheme.primary}77`,
          boxShadow: `0 0 50px rgba(0,0,0,0.9), 0 0 35px ${currentTheme.primary}25`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#050810]">
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl border flex items-center justify-center"
              style={{
                borderColor: `${currentTheme.primary}66`,
                background: `${currentTheme.primary}18`,
                color: currentTheme.primaryLight,
              }}
            >
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-slate-100 text-base sm:text-lg">
                  PC VOICE CONTROL & APPLICATION SUITE
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-400">
                  LIVE READY
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Calculator, YouTube, File Vault, Private Folder, & Native Desktop Bridge
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 px-5 py-2.5 bg-[#04060d] border-b border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('in_app')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'in_app'
                ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Built-In Cybernetic Voice Controls (Direct)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('native_bridge')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'native_bridge'
                ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Native Windows / Mac Bridge (Optional)</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 bg-[#070b16]">
          {activeTab === 'in_app' ? (
            /* In-App Direct Voice Actions */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/40 text-xs text-cyan-200 flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-cyan-400 shrink-0" />
                <div>
                  <strong>No setup required!</strong> F.R.I.D.A.Y. directly runs these tools right on your screen via voice. Try saying any of the voice phrases below.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Calculator Card */}
                <div className="p-4 rounded-xl bg-[#090e1c] border border-slate-800 hover:border-cyan-500/50 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-cyan-400">
                          <Calculator className="w-4 h-4" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-200">Voice Calculator</h4>
                      </div>
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/40">
                        In-App Active
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">
                      Solves calculations instantly via voice or opens the glowing holographic scientific keypad.
                    </p>
                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 space-y-1">
                      <div>• "FRIDAY, open calculator"</div>
                      <div>• "FRIDAY, calculate (450 * 18) / 2.5"</div>
                      <div>• "FRIDAY, what is 15 percent of 8500?"</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCalculator();
                    }}
                    className="mt-3 w-full py-1.5 rounded-lg bg-slate-800 hover:bg-cyan-600 hover:text-black text-xs font-bold text-slate-200 transition-all cursor-pointer"
                  >
                    Open Calculator Now
                  </button>
                </div>

                {/* 2. YouTube Card */}
                <div className="p-4 rounded-xl bg-[#090e1c] border border-slate-800 hover:border-cyan-500/50 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-red-400">
                          <Play className="w-4 h-4" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-200">YouTube Player</h4>
                      </div>
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/40">
                        In-App Active
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">
                      Opens and streams videos, lofi playlists, or music on the cybernetic viewport.
                    </p>
                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 space-y-1">
                      <div>• "FRIDAY, open YouTube"</div>
                      <div>• "FRIDAY, play lofi hip hop beats on YouTube"</div>
                      <div>• "FRIDAY, search Iron Man soundtrack on YouTube"</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenYouTube();
                    }}
                    className="mt-3 w-full py-1.5 rounded-lg bg-slate-800 hover:bg-red-600 hover:text-white text-xs font-bold text-slate-200 transition-all cursor-pointer"
                  >
                    Open YouTube Player
                  </button>
                </div>

                {/* 3. File Vault & Explain Card */}
                <div className="p-4 rounded-xl bg-[#090e1c] border border-slate-800 hover:border-cyan-500/50 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-sky-400">
                          <FileSearch className="w-4 h-4" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-200">File Search & Explain</h4>
                      </div>
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/40">
                        In-App Active
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">
                      Drag & drop any PC files into the Vault. FRIDAY searches, inspects code, and explains them line by line.
                    </p>
                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 space-y-1">
                      <div>• "FRIDAY, search my file in vault"</div>
                      <div>• "FRIDAY, explain my code file"</div>
                      <div>• "FRIDAY, summarize my document"</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenFileVault();
                    }}
                    className="mt-3 w-full py-1.5 rounded-lg bg-slate-800 hover:bg-sky-600 hover:text-white text-xs font-bold text-slate-200 transition-all cursor-pointer"
                  >
                    Open PC File Vault
                  </button>
                </div>

                {/* 4. Classified Private Folder Card */}
                <div className="p-4 rounded-xl bg-[#090e1c] border border-slate-800 hover:border-red-500/50 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-red-400">
                          <FolderOpen className="w-4 h-4" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-200">Classified Private Folder</h4>
                      </div>
                      <span className="text-[10px] text-red-400 bg-red-950/60 px-2 py-0.5 rounded border border-red-500/40">
                        PIN Protected
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">
                      Your confidential vault (AES-256 encrypted). Nobody can access without your PIN. FRIDAY explains private files only when unlocked.
                    </p>
                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 space-y-1">
                      <div>• "FRIDAY, unlock my private folder"</div>
                      <div>• "FRIDAY, lock private vault"</div>
                      <div>• "FRIDAY, explain my secret blueprint"</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPrivateVault();
                    }}
                    className="mt-3 w-full py-1.5 rounded-lg bg-slate-800 hover:bg-red-700 hover:text-white text-xs font-bold text-slate-200 transition-all cursor-pointer"
                  >
                    Open Private Vault
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Native Bridge Tab */
            <div className="space-y-4">
              <div className="text-xs text-slate-300 leading-relaxed">
                Browser security prevents web apps from directly opening native Windows desktop executables (like <code className="text-cyan-400">calc.exe</code> or <code className="text-cyan-400">notepad.exe</code>) without your consent. To allow FRIDAY to launch native local PC software, run this 1-file Python helper:
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>friday_pc_bridge.py</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-black text-xs font-bold transition-all cursor-pointer"
                >
                  {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedScript ? 'Copied Python Bridge!' : 'Copy Script'}</span>
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-[#03050a] border border-slate-800 text-xs text-slate-300 font-mono overflow-auto max-h-72 select-text leading-relaxed">
                <pre>{pythonScript}</pre>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 space-y-1">
                <div className="text-slate-200 font-bold mb-1">Quick Steps to Run:</div>
                <div>1. Save the code as <code className="text-cyan-400">friday_pc_bridge.py</code> on your computer.</div>
                <div>2. Run <code className="text-emerald-400">pip install flask flask-cors</code> in your terminal.</div>
                <div>3. Run <code className="text-emerald-400">python friday_pc_bridge.py</code>.</div>
                <div>4. Now when you speak to FRIDAY, it can also launch native Windows/Mac applications!</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-[#050810] border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>FRIDAY UNIVERSAL VOICE CONTROLLER READY</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
