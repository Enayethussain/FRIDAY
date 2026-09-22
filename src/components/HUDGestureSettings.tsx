import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Camera, CameraOff, Vibrate, Eye, EyeOff, FlaskConical, CheckCircle2, XCircle } from 'lucide-react';
import type { ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';
import {
  globalNativeGestureBridge,
  isNativeGestureSupported,
  type NativeGestureAction,
  type NativeGestureEvent,
  type NativeGestureSettings,
  type NativeGestureStatus,
} from '../services/NativeGestureBridge';

interface HUDGestureSettingsProps {
  isOpen: boolean;
  theme: ThemeAccent;
  onClose: () => void;
  onWakeHud?: () => void;
}

const GESTURE_LABELS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'open_palm', label: 'Open Palm', hint: 'HUD/Orb wake' },
  { id: 'pinch_out', label: 'Pinch Out', hint: 'zoom IN' },
  { id: 'pinch_in', label: 'Pinch In', hint: 'zoom OUT' },
  { id: 'swipe_left', label: 'Swipe Left', hint: 'previous' },
  { id: 'swipe_right', label: 'Swipe Right', hint: 'next' },
  { id: 'thumb_up', label: 'Thumb Up', hint: 'default: volume up' },
  { id: 'thumb_down', label: 'Thumb Down', hint: 'default: volume down' },
  { id: 'fist', label: 'Fist', hint: 'default: lock HUD' },
  { id: 'two_finger_up', label: 'Two Fingers Up', hint: 'control panel' },
  { id: 'two_finger_left', label: 'Two Fingers Left', hint: 'HUD prev' },
  { id: 'two_finger_right', label: 'Two Fingers Right', hint: 'HUD next' },
];

const ACTION_OPTIONS: Array<{ id: NativeGestureAction; label: string }> = [
  { id: 'wake_hud', label: 'Wake HUD/Orb' },
  { id: 'zoom_in', label: 'Zoom In' },
  { id: 'zoom_out', label: 'Zoom Out' },
  { id: 'swipe_prev', label: 'Previous' },
  { id: 'swipe_next', label: 'Next' },
  { id: 'volume_up', label: 'Volume Up' },
  { id: 'volume_down', label: 'Volume Down' },
  { id: 'lock_hud', label: 'Lock HUD' },
  { id: 'lock_device', label: 'Lock Device*' },
  { id: 'open_panel', label: 'Control Panel' },
  { id: 'none', label: 'No Action' },
];

export const HUDGestureSettings: React.FC<HUDGestureSettingsProps> = ({
  isOpen,
  theme,
  onClose,
  onWakeHud,
}) => {
  const currentTheme = THEMES[theme] || THEMES.amber;
  const [supported] = useState(isNativeGestureSupported());
  const [settings, setSettings] = useState<NativeGestureSettings | null>(null);
  const [status, setStatus] = useState<NativeGestureStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<NativeGestureEvent | null>(null);
  const [calibrating, setCalibrating] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const refresh = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    setError(null);
    try {
      await globalNativeGestureBridge.attach();
      const s = await globalNativeGestureBridge.getSettings();
      setSettings(s);
      const st = await globalNativeGestureBridge.getStatus();
      setStatus(st);
    } catch (e) {
      setError((e as Error)?.message || 'Gesture settings load nahi hui.');
    } finally {
      setLoading(false);
    }
  }, [supported]);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
    const offStatus = globalNativeGestureBridge.onStatus((s) => setStatus(s));
    const offEvent = globalNativeGestureBridge.onEventExternal((e) => {
      setLastEvent(e);
      // Calibration verdict ONLY from a real camera detection.
      if (calibrating && e.gesture === calibrating) {
        void globalNativeGestureBridge.setCalibrated(e.gesture, true);
        setCalibrating(null);
        void refresh();
      }
    });
    return () => {
      offStatus();
      offEvent();
    };
  }, [isOpen, refresh, calibrating]);

  // Test-mode landmark overlay (real normalized points from the device).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(2,6,23,0.9)';
    ctx.fillRect(0, 0, W, H);
    const pts = status?.landmarks;
    if (!pts || pts.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '11px monospace';
      ctx.fillText(status?.handPresent ? 'Hand present — landmarks…' : 'No hand — haath dikhao', 10, H / 2);
      return;
    }
    ctx.fillStyle = '#fbbf24';
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x * W, y * H, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [status?.landmarks, status?.handPresent]);

  if (!isOpen) return null;

  const patch = async (p: Partial<NativeGestureSettings>) => {
    setError(null);
    const next = await globalNativeGestureBridge.updateSettings(p);
    if (next) setSettings(next);
    else setError('Setting save nahi hui.');
  };

  const toggleEnabled = async () => {
    const nextEnabled = !(settings?.enabled ?? false);
    await patch({ enabled: nextEnabled });
    if (nextEnabled) {
      const r = await globalNativeGestureBridge.start();
      if (!r.ok) setError(r.message);
      else if (onWakeHud && settings?.actions?.open_palm === 'wake_hud') onWakeHud();
    } else {
      await globalNativeGestureBridge.stop();
    }
    const st = await globalNativeGestureBridge.getStatus();
    setStatus(st);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-4">
      <div
        className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-slate-900 border flex flex-col shadow-2xl"
        style={{ borderColor: `${currentTheme.primary}44` }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60 sticky top-0">
          <div>
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-100">
              ✋ Gesture Control
            </h2>
            <p className="text-[11px] font-mono text-slate-400">
              On-device camera gestures — no uploads, no recordings
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!supported && (
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs font-mono text-slate-300">
              Gesture camera sirf FRIDAY Android app me hai. Ye browser/PC preview hai — yahan camera gestures available nahi hain.
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs font-mono flex flex-col gap-2">
              <span>{error}</span>
              {/permission/i.test(error) && (
                <button
                  type="button"
                  onClick={() => void globalNativeGestureBridge.openAppSettings()}
                  className="self-start px-3 py-1.5 rounded-lg border border-red-400/50 text-red-200 text-xs font-mono"
                >
                  Open Android Settings
                </button>
              )}
            </div>
          )}

          {supported && (
            <>
              {/* Master switch */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {status?.running ? <Camera className="w-4 h-4 text-emerald-400" /> : <CameraOff className="w-4 h-4 text-slate-500" />}
                  <div>
                    <div className="text-xs font-mono font-bold text-slate-200">
                      {status?.running ? 'GESTURE CAMERA LIVE' : 'Enable Gesture Control'}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {status?.running ? `State: ${status.state} • ${status.fps} FPS` : 'Camera sirf ON rehne par chalti hai'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleEnabled()}
                  disabled={loading}
                  className="px-4 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer"
                  style={{
                    backgroundColor: settings?.enabled ? `${currentTheme.primary}22` : 'rgba(30,41,59,0.6)',
                    borderColor: settings?.enabled ? currentTheme.primary : '#475569',
                    color: settings?.enabled ? currentTheme.primary : '#94a3b8',
                  }}
                >
                  {settings?.enabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Camera + sensitivity */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400 uppercase mb-2">Camera</div>
                  <div className="flex gap-1.5">
                    {(['front', 'back'] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => void patch({ camera: c })}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs font-mono border cursor-pointer"
                        style={{
                          borderColor: settings?.camera === c ? currentTheme.primary : '#334155',
                          color: settings?.camera === c ? currentTheme.primary : '#94a3b8',
                        }}
                      >
                        {c === 'front' ? 'Front' : 'Back'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400 uppercase mb-2">Sensitivity</div>
                  <div className="flex gap-1.5">
                    {(['low', 'medium', 'high'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void patch({ sensitivity: s })}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs font-mono border cursor-pointer capitalize"
                        style={{
                          borderColor: settings?.sensitivity === s ? currentTheme.primary : '#334155',
                          color: settings?.sensitivity === s ? currentTheme.primary : '#94a3b8',
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Cooldown */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-mono text-slate-400 uppercase">Gesture Cooldown</span>
                  <span className="text-xs font-mono" style={{ color: currentTheme.primary }}>
                    {((settings?.cooldownMs ?? 1200) / 1000).toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={400}
                  max={5000}
                  step={100}
                  value={settings?.cooldownMs ?? 1200}
                  onChange={(e) => void patch({ cooldownMs: Number(e.target.value) })}
                  className="w-full cursor-pointer"
                />
              </div>

              {/* Feedback toggles */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void patch({ showFeedback: !(settings?.showFeedback ?? true) })}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-2 cursor-pointer"
                >
                  {settings?.showFeedback ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
                  <span className="text-xs font-mono text-slate-200">Gesture Feedback</span>
                </button>
                <button
                  type="button"
                  onClick={() => void patch({ haptic: !(settings?.haptic ?? true) })}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-2 cursor-pointer"
                >
                  <Vibrate className={`w-4 h-4 ${settings?.haptic ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span className="text-xs font-mono text-slate-200">Vibration</span>
                </button>
              </div>

              {/* Action mapping */}
              <div>
                <div className="text-[11px] font-mono text-slate-400 uppercase mb-2">Gesture → Action</div>
                <div className="space-y-1.5">
                  {GESTURE_LABELS.map((g) => (
                    <div key={g.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono text-slate-200">{g.label}</div>
                        <div className="text-[10px] font-mono text-slate-500">{g.hint}</div>
                      </div>
                      <select
                        value={settings?.actions?.[g.id] ?? 'none'}
                        onChange={async (e) => {
                          const ok = await globalNativeGestureBridge.setAction(g.id, e.target.value);
                          if (ok) await refresh();
                          else setError('Action save nahi hua.');
                        }}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-slate-100 cursor-pointer"
                      >
                        {ACTION_OPTIONS.map((a) => (
                          <option key={a.id} value={a.id}>{a.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] font-mono text-slate-500 mt-1">* Lock Device needs Android device-admin — warna FRIDAY honestly mana karega.</p>
              </div>

              {/* Test mode */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <button
                  type="button"
                  onClick={() => void patch({ testMode: !(settings?.testMode ?? false) }).then(() => void refresh())}
                  className="w-full flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2 text-xs font-mono text-slate-200">
                    <FlaskConical className="w-4 h-4 text-amber-400" /> Gesture Test Mode
                  </span>
                  <span className="text-xs font-mono" style={{ color: settings?.testMode ? currentTheme.primary : '#64748b' }}>
                    {settings?.testMode ? 'ON' : 'OFF'}
                  </span>
                </button>
                {settings?.testMode && (
                  <div className="mt-3 space-y-2">
                    <canvas ref={canvasRef} width={320} height={200} className="w-full rounded-lg border border-slate-800" />
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono text-slate-300">
                      <span>Hand: {status?.handPresent ? 'Detected' : '—'}</span>
                      <span>Gesture: {status?.lastGesture || lastEvent?.gesture || '—'}</span>
                      <span>Confidence: {status ? status.lastConfidence.toFixed(2) : '—'}</span>
                      <span>FPS: {status?.fps ?? '—'}</span>
                      <span>State: {status?.state ?? '—'}</span>
                      <span>Cooldown: {status ? `${Math.round((status.cooldownRemainingMs ?? 0) / 100)}00ms` : '—'}</span>
                    </div>
                    <div className="text-[11px] font-mono flex items-center gap-1.5">
                      {status?.lastActionOk ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-slate-500" />}
                      <span className="text-slate-300">Action: {lastEvent ? `${lastEvent.action} → ${lastEvent.success ? 'SUCCESS' : 'FAILED'}` : status?.lastActionResult || '—'}</span>
                    </div>
                    {!status?.lastActionOk && status?.lastActionResult && (
                      <div className="text-[11px] font-mono text-amber-300">{status.lastActionResult}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Calibration */}
              <div>
                <div className="text-[11px] font-mono text-slate-400 uppercase mb-2">Calibration (real camera only)</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {GESTURE_LABELS.slice(0, 8).map((g) => {
                    const done = settings?.calibrated?.[g.id];
                    return (
                      <button
                        key={g.id}
                        type="button"
                        disabled={!status?.running}
                        onClick={() => setCalibrating(g.id)}
                        className="p-2 rounded-lg border text-left text-xs font-mono cursor-pointer disabled:opacity-40"
                        style={{ borderColor: done ? '#10b98166' : calibrating === g.id ? currentTheme.primary : '#334155' }}
                      >
                        <div className="flex items-center gap-1.5">
                          {done ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-600 inline-block" />}
                          <span className="text-slate-200">{g.label}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {calibrating === g.id ? `Show ${g.label} to camera…` : done ? 'Calibrated ✓' : 'Tap, then perform'}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!status?.running && <p className="text-[10px] font-mono text-slate-500 mt-1">Calibration ke liye gesture camera ON karo.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
