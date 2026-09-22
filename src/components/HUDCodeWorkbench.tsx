import React, { useState, useEffect } from 'react';
import {
  Code2,
  Cpu,
  Play,
  RotateCcw,
  Copy,
  Check,
  Terminal,
  Zap,
  Sliders,
  Sparkles,
  X,
  Maximize2,
  FileCode2,
  Layers,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { CodeSnippet, CircuitState, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';
import { SoundEffects } from '../utils/SoundEffects';
import { HapticFeedback } from '../utils/HapticFeedback';

interface HUDCodeWorkbenchProps {
  isOpen: boolean;
  theme: ThemeAccent;
  onClose: () => void;
  initialCode?: string;
  initialLanguage?: 'javascript' | 'typescript' | 'python' | 'json';
}

const PRESET_SNIPPETS: CodeSnippet[] = [
  {
    id: 'snip-reactor',
    title: 'Arc Reactor PID Flux Regulator',
    language: 'javascript',
    category: 'reactor',
    description: 'Proportional-Integral-Derivative feedback algorithm stabilizing palladium core flux.',
    code: `// STARK INDUSTRIES // ARC REACTOR FLUX REGULATOR
function calibrateReactorCore(targetFlux = 0.95, currentFlux = 0.72) {
  const Kp = 1.8; // Proportional gain
  const Ki = 0.05; // Integral gain
  const Kd = 0.25; // Derivative gain

  let error = targetFlux - currentFlux;
  let integral = 0;
  let prevError = 0;
  const history = [];

  for (let cycle = 1; cycle <= 6; cycle++) {
    integral += error;
    const derivative = error - prevError;
    const output = (Kp * error) + (Ki * integral) + (Kd * derivative);
    
    currentFlux += output * 0.45;
    prevError = error;
    error = targetFlux - currentFlux;

    history.push({
      cycle,
      coreFlux: currentFlux.toFixed(4),
      stabilized: Math.abs(error) < 0.01
    });
  }

  console.log("Core calibration sequence complete.");
  return { target: targetFlux, finalFlux: currentFlux.toFixed(4), history };
}

calibrateReactorCore(1.0, 0.65);`,
  },
  {
    id: 'snip-websocket',
    title: 'Gemini Live WebSocket PCM Buffer',
    language: 'javascript',
    category: 'ai',
    description: '16kHz to 24kHz PCM linear streaming pipeline for real-time assistant voice.',
    code: `// Real-Time Audio PCM Stream Pipeline
class NeuralAudioBuffer {
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.bufferQueue = [];
    this.totalSamples = 0;
  }

  enqueuePCM(base64Chunk) {
    const raw = atob(base64Chunk);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    this.bufferQueue.push(int16);
    this.totalSamples += int16.length;
    return int16.length;
  }

  getTelemetry() {
    const durationMs = (this.totalSamples / this.sampleRate) * 1000;
    return {
      chunksEnqueued: this.bufferQueue.length,
      totalSamples: this.totalSamples,
      bufferedDurationSec: (durationMs / 1000).toFixed(2),
      status: "STREAMING_ACTIVE"
    };
  }
}

const audioStream = new NeuralAudioBuffer();
// Simulate incoming neural audio chunks
audioStream.enqueuePCM(btoa("STARK_AUDIO_SYNTHESIS_PACKET_001"));
audioStream.enqueuePCM(btoa("STARK_AUDIO_SYNTHESIS_PACKET_002"));
console.log("Stream telemetry:", audioStream.getTelemetry());`,
  },
  {
    id: 'snip-debounce',
    title: 'Custom Hook: useWakewordDebounce',
    language: 'javascript',
    category: 'audio',
    description: 'Anti-chatter acoustic filter buffering spoken candidate words before trigger.',
    code: `// Custom Wakeword Acoustic Buffer Filter
function evaluateWakewordConfidence(candidateWord, targetPhrase = "hey jarvis") {
  const clean = candidateWord.toLowerCase().trim();
  const tokens = clean.split(/\\s+/);
  const targetTokens = targetPhrase.split(/\\s+/);

  let matches = 0;
  for (const token of tokens) {
    if (targetTokens.includes(token)) matches++;
  }

  const confidence = matches / targetTokens.length;
  console.log(\`Acoustic pattern evaluated: "\${candidateWord}"\`);
  console.log(\`Confidence level: \${(confidence * 100).toFixed(1)}%\`);

  return {
    candidate: clean,
    match: confidence >= 0.75,
    confidence: Number(confidence.toFixed(2))
  };
}

evaluateWakewordConfidence("hey jarvis calibrate the power grid");`,
  },
];

export const HUDCodeWorkbench: React.FC<HUDCodeWorkbenchProps> = ({
  isOpen,
  theme,
  onClose,
  initialCode,
  initialLanguage = 'javascript',
}) => {
  const currentTheme = THEMES[theme] || THEMES.amber;
  const [activeTab, setActiveTab] = useState<'editor' | 'circuit'>('editor');
  const [code, setCode] = useState<string>(
    initialCode || PRESET_SNIPPETS[0].code
  );
  const [selectedSnippetId, setSelectedSnippetId] = useState<string>(PRESET_SNIPPETS[0].id);
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Circuit simulator state
  const [circuit, setCircuit] = useState<CircuitState>({
    coreVoltage: 850,
    frequency: 44,
    fluxPercent: 88,
    overdrive: false,
    activePath: 'palladium',
  });

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
    }
  }, [initialCode]);

  if (!isOpen) return null;

  // Execute user code in a safe sandbox capturing console.log
  const handleRunCode = () => {
    setIsRunning(true);
    SoundEffects.playSubtleBeep();
    HapticFeedback.tap();

    const logs: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args: any[]) => {
      logs.push(
        args
          .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
          .join(' ')
      );
    };

    console.error = (...args: any[]) => {
      logs.push(
        '⚠️ ERROR: ' +
          args
            .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
            .join(' ')
      );
    };

    const startTime = performance.now();

    try {
      // Execute in isolated function scope
      const sandboxFn = new Function(code);
      const result = sandboxFn();
      const elapsed = (performance.now() - startTime).toFixed(2);

      if (result !== undefined) {
        logs.push(`➜ Return: ${typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}`);
      }
      logs.push(`⚡ Execution completed in ${elapsed} ms [Exit Code: 0]`);
      HapticFeedback.success();
    } catch (err: any) {
      logs.push(`❌ RUNTIME EXCEPTION: ${err?.message || String(err)}`);
      HapticFeedback.warning();
    } finally {
      console.log = originalLog;
      console.error = originalError;
      setConsoleOutput(logs);
      setIsRunning(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    SoundEffects.playSubtleBeep();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectSnippet = (snip: CodeSnippet) => {
    setSelectedSnippetId(snip.id);
    setCode(snip.code);
    setConsoleOutput([]);
    SoundEffects.playSubtleBeep();
  };

  // Circuit power calculations
  const totalPowerMW = (
    (circuit.coreVoltage * (circuit.frequency * 0.4) * (circuit.fluxPercent / 100) * (circuit.overdrive ? 1.5 : 1.0)) /
    100
  ).toFixed(1);

  const thermalGradientC = Math.round(35 + (circuit.coreVoltage / 1200) * 85 * (circuit.overdrive ? 1.4 : 1.0));

  return (
    <div
      id="hud-code-workbench-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border bg-slate-950/95 shadow-2xl overflow-hidden text-slate-100"
        style={{
          borderColor: `${currentTheme.primary}77`,
          boxShadow: `0 0 50px rgba(0,0,0,0.9), 0 0 30px ${currentTheme.primary}33`,
        }}
      >
        {/* Header Bar */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b bg-slate-900/60"
          style={{ borderColor: `${currentTheme.primary}33` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-1.5 rounded-lg border flex items-center justify-center"
              style={{
                backgroundColor: `${currentTheme.primary}20`,
                borderColor: `${currentTheme.primary}50`,
                color: currentTheme.primary,
              }}
            >
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-mono font-bold tracking-wider uppercase text-white">
                  Stark Holographic Workbench
                </h3>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase"
                  style={{
                    backgroundColor: `${currentTheme.primary}20`,
                    color: currentTheme.primary,
                    border: `1px solid ${currentTheme.primary}40`,
                  }}
                >
                  ENGINEERING LAB v4.2
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400">
                Interactive JavaScript/TypeScript Sandbox & Arc Reactor Circuit Simulator
              </p>
            </div>
          </div>

          {/* Tab Switcher & Close */}
          <div className="flex items-center gap-2">
            <div className="flex bg-black/50 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('editor');
                  SoundEffects.playSubtleBeep();
                }}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'editor'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                style={{
                  color: activeTab === 'editor' ? currentTheme.primary : undefined,
                }}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Code Sandbox</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('circuit');
                  SoundEffects.playSubtleBeep();
                }}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'circuit'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                style={{
                  color: activeTab === 'circuit' ? currentTheme.primary : undefined,
                }}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Circuit Schematic</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors ml-2 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* TAB 1: CODE SANDBOX */}
        {activeTab === 'editor' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[500px]">
            {/* Left Presets Sidebar */}
            <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-800/80 bg-black/40 p-3 overflow-y-auto shrink-0 flex flex-col gap-2">
              <span className="text-[10px] font-mono tracking-widest uppercase text-slate-400 px-1 font-bold">
                Stark Preset Modules
              </span>
              {PRESET_SNIPPETS.map((snip) => {
                const isSelected = selectedSnippetId === snip.id;
                return (
                  <button
                    key={snip.id}
                    type="button"
                    onClick={() => handleSelectSnippet(snip)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 border-amber-500/60 shadow-[0_0_15px_rgba(255,196,0,0.15)]'
                        : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-900/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <FileCode2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-xs font-mono font-bold text-white truncate">
                        {snip.title}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-2 leading-tight">
                      {snip.description}
                    </p>
                  </button>
                );
              })}

              <div className="mt-auto pt-3 border-t border-slate-800/60">
                <div className="p-2 rounded-lg bg-amber-950/20 border border-amber-500/20 text-[10px] font-mono text-amber-300 flex items-start gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>Ask FRIDAY in voice: "Run this code snippet" or "Review my function" for real-time mentor feedback!</span>
                </div>
              </div>
            </div>

            {/* Main Code Editor & Console Output */}
            <div className="flex-1 flex flex-col overflow-hidden bg-[#070b14]">
              {/* Editor Actions Toolbar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80 bg-slate-900/40">
                <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>interactive_sandbox.js</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-2.5 py-1 rounded-lg border border-slate-700 hover:border-slate-600 bg-slate-800/50 text-[11px] font-mono text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCode('');
                      setConsoleOutput([]);
                      SoundEffects.playSubtleBeep();
                    }}
                    className="px-2.5 py-1 rounded-lg border border-slate-700 hover:border-slate-600 bg-slate-800/50 text-[11px] font-mono text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRunCode}
                    disabled={isRunning || !code.trim()}
                    className="px-4 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                    style={{
                      backgroundColor: currentTheme.primary,
                      color: '#020617',
                      boxShadow: `0 0 15px ${currentTheme.primary}66`,
                    }}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{isRunning ? 'Executing...' : 'Run Code'}</span>
                  </button>
                </div>
              </div>

              {/* Code Textarea with line numbers */}
              <div className="flex-1 flex overflow-hidden relative">
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="// Enter JavaScript or TypeScript code here..."
                  spellCheck={false}
                  className="w-full h-full p-4 bg-transparent text-xs sm:text-sm font-mono text-slate-200 resize-none focus:outline-none leading-relaxed selection:bg-amber-500/30 overflow-y-auto"
                  style={{
                    tabSize: 2,
                  }}
                />
              </div>

              {/* Bottom Console Terminal */}
              <div className="h-44 border-t border-slate-800 bg-black/90 flex flex-col">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/60 bg-slate-900/50">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-slate-400 font-bold">
                    <Terminal className="w-3.5 h-3.5 text-amber-400" />
                    <span>Console Output & Return Buffer</span>
                  </div>
                  {consoleOutput.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setConsoleOutput([])}
                      className="text-[10px] font-mono text-slate-500 hover:text-slate-300"
                    >
                      Clear Console
                    </button>
                  )}
                </div>

                <div className="flex-1 p-3 font-mono text-xs overflow-y-auto space-y-1 select-text">
                  {consoleOutput.length === 0 ? (
                    <div className="text-slate-600 italic text-[11px] py-4 text-center">
                      No execution output yet. Click "Run Code" to compile and execute in the browser sandbox.
                    </div>
                  ) : (
                    consoleOutput.map((line, idx) => (
                      <div
                        key={idx}
                        className={`text-xs ${
                          line.startsWith('❌')
                            ? 'text-rose-400 font-bold'
                            : line.startsWith('➜ Return')
                            ? 'text-amber-300'
                            : line.startsWith('⚡')
                            ? 'text-amber-400 font-semibold'
                            : 'text-slate-300'
                        }`}
                      >
                        {line}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ARC REACTOR & CIRCUIT SCHEMATIC SIMULATOR */}
        {activeTab === 'circuit' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-y-auto p-4 sm:p-6 gap-6 bg-[#070b14]">
            {/* Visual SVG Schematic Container */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 rounded-2xl border border-slate-800 bg-black/60 relative overflow-hidden">
              <div className="absolute top-3 left-3 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                SCHEMATIC // STARK MARK VII ARC CORE
              </div>

              {/* Animated SVG Circuit Diagram */}
              <div className="relative w-64 h-64 sm:w-80 sm:h-80 flex items-center justify-center">
                <svg viewBox="0 0 300 300" className="w-full h-full">
                  <defs>
                    <radialGradient id="schematicGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor={circuit.overdrive ? '#f43f5e' : currentTheme.primary} stopOpacity="0.8" />
                      <stop offset="60%" stopColor={circuit.overdrive ? '#e11d48' : currentTheme.primary} stopOpacity="0.2" />
                      <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  {/* Outer Containment Ring */}
                  <circle
                    cx="150"
                    cy="150"
                    r="130"
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="4"
                    strokeDasharray="4 6"
                  />

                  {/* Electromagnetic Coil Windings */}
                  <circle
                    cx="150"
                    cy="150"
                    r="105"
                    fill="none"
                    stroke={circuit.overdrive ? '#f43f5e' : currentTheme.primary}
                    strokeWidth="3"
                    strokeDasharray="16 10"
                    style={{
                      transformOrigin: '150px 150px',
                      animation: `spin ${Math.max(2, 60 / circuit.frequency)}s linear infinite`,
                    }}
                  />

                  {/* Flux Field Concentrator */}
                  <circle
                    cx="150"
                    cy="150"
                    r="75"
                    fill="url(#schematicGlow)"
                    stroke={circuit.overdrive ? '#fb7185' : '#FFE600'}
                    strokeWidth="2"
                  />

                  {/* Radiating Flux Lines */}
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                    <line
                      key={deg}
                      x1="150"
                      y1="150"
                      x2={150 + Math.cos((deg * Math.PI) / 180) * 115}
                      y2={150 + Math.sin((deg * Math.PI) / 180) * 115}
                      stroke={circuit.overdrive ? '#f43f5e' : currentTheme.primary}
                      strokeWidth={circuit.overdrive ? 2.5 : 1.5}
                      strokeDasharray="4 4"
                      opacity={circuit.fluxPercent / 100}
                    />
                  ))}

                  {/* Palladium Core Center Ring */}
                  <circle
                    cx="150"
                    cy="150"
                    r="35"
                    fill="#030712"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                  />

                  {/* Core Icon Pulse */}
                  <circle
                    cx="150"
                    cy="150"
                    r={18 + (circuit.coreVoltage / 1200) * 10}
                    fill={circuit.overdrive ? '#f43f5e' : currentTheme.primary}
                    opacity="0.9"
                  />
                </svg>

                {/* Overdrive Warning Badge */}
                {circuit.overdrive && (
                  <div className="absolute top-2 right-2 px-2.5 py-1 rounded-md bg-rose-500/20 border border-rose-500/50 text-rose-400 font-mono text-[10px] font-bold animate-pulse flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>OVERDRIVE ACTIVE</span>
                  </div>
                )}
              </div>

              {/* Real-time Telemetry Readout */}
              <div className="grid grid-cols-3 gap-3 w-full mt-4 pt-3 border-t border-slate-800/80 text-center">
                <div className="p-2 rounded-lg bg-black/40 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400 block">TOTAL POWER</span>
                  <strong className="text-sm font-mono text-amber-300">{totalPowerMW} MW</strong>
                </div>
                <div className="p-2 rounded-lg bg-black/40 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400 block">CORE TEMP</span>
                  <strong className={`text-sm font-mono ${thermalGradientC > 95 ? 'text-rose-400' : 'text-amber-300'}`}>
                    {thermalGradientC} °C
                  </strong>
                </div>
                <div className="p-2 rounded-lg bg-black/40 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400 block">COHERENCE</span>
                  <strong className="text-sm font-mono text-emerald-300">
                    {((circuit.fluxPercent / 100) * (circuit.frequency / 50) * 98).toFixed(1)}%
                  </strong>
                </div>
              </div>
            </div>

            {/* Circuit Tuning Controls */}
            <div className="w-full md:w-80 flex flex-col gap-4">
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
                <h4 className="text-xs font-mono font-bold uppercase text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  <span>Flux & Voltage Modulation</span>
                </h4>

                {/* Core Voltage Slider */}
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-slate-400">Core Voltage</span>
                    <span className="text-amber-300 font-bold">{circuit.coreVoltage} V</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="1200"
                    step="10"
                    value={circuit.coreVoltage}
                    onChange={(e) => {
                      setCircuit((prev) => ({ ...prev, coreVoltage: Number(e.target.value) }));
                      HapticFeedback.tap();
                    }}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                {/* Resonance Frequency Slider */}
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-slate-400">Resonance Frequency</span>
                    <span className="text-amber-300 font-bold">{circuit.frequency} Hz</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="1"
                    value={circuit.frequency}
                    onChange={(e) => {
                      setCircuit((prev) => ({ ...prev, frequency: Number(e.target.value) }));
                      HapticFeedback.tap();
                    }}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                {/* Magnetic Flux Density Slider */}
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-slate-400">Magnetic Flux Density</span>
                    <span className="text-amber-300 font-bold">{circuit.fluxPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="1"
                    value={circuit.fluxPercent}
                    onChange={(e) => {
                      setCircuit((prev) => ({ ...prev, fluxPercent: Number(e.target.value) }));
                      HapticFeedback.tap();
                    }}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>

                {/* Overdrive Toggle Button */}
                <div className="pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !circuit.overdrive;
                      setCircuit((prev) => ({ ...prev, overdrive: next }));
                      if (next) {
                        HapticFeedback.warning();
                        SoundEffects.playSubtleBeep();
                      } else {
                        HapticFeedback.tap();
                      }
                    }}
                    className={`w-full py-2 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      circuit.overdrive
                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.5)]'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                    }`}
                  >
                    <Zap className="w-4 h-4 fill-current" />
                    <span>{circuit.overdrive ? 'DISENGAGE OVERDRIVE' : 'ENGAGE UNRESTRICTED OVERDRIVE'}</span>
                  </button>
                </div>
              </div>

              {/* Subsystem Routing */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-2 font-bold">
                  Active Conductor Channel
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(['palladium', 'vibranium', 'repulsor', 'quantum'] as const).map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => {
                        setCircuit((prev) => ({ ...prev, activePath: path }));
                        HapticFeedback.tap();
                      }}
                      className={`p-2 rounded-lg border text-xs font-mono uppercase font-bold text-center transition-all cursor-pointer ${
                        circuit.activePath === path
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-sm'
                          : 'bg-black/30 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {path}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
