import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  User,
  KeyRound,
  Fingerprint,
  LogOut,
  X,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { UserProfile, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';
import { SoundEffects } from '../utils/SoundEffects';
import { globalAuthManager } from '../services/AuthManager';

interface HUDAuthModalProps {
  isOpen: boolean;
  profile: UserProfile;
  theme: ThemeAccent;
  onUpdateProfile: (updates: Partial<UserProfile>) => void;
  onLockSession: () => void;
  onClose: () => void;
}

export const HUDAuthModal: React.FC<HUDAuthModalProps> = ({
  isOpen,
  profile,
  theme,
  onUpdateProfile,
  onLockSession,
  onClose,
}) => {
  const [name, setName] = useState(profile.commanderName);
  const [callSign, setCallSign] = useState(profile.callSign);
  const [clearance, setClearance] = useState(profile.clearanceLevel);
  const [enforceOnly, setEnforceOnly] = useState(profile.enforceCommanderOnly);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [curPin, setCurPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [pinOk, setPinOk] = useState(true);

  if (!isOpen) return null;

  const currentTheme = THEMES[theme] || THEMES.cyan;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      commanderName: name.trim() || 'Enayet Hussain',
      callSign: callSign.trim() || 'Commander',
      clearanceLevel: clearance.trim() || 'LEVEL 5 - SUPREME COMMAND',
      enforceCommanderOnly: enforceOnly,
    });
    setSavedSuccess(true);
    SoundEffects.playAccessGranted();
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMsg(null);
    const res = await globalAuthManager.changePasscode(curPin, newPin);
    setPinMsg(res.message);
    setPinOk(res.success);
    if (res.success) {
      SoundEffects.playAccessGranted();
      setCurPin('');
      setNewPin('');
    } else {
      SoundEffects.playAccessDenied();
    }
  };

  const handleLockNow = () => {
    SoundEffects.playAccessDenied();
    onLockSession();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-4">
      <div
        className="relative w-full max-w-lg rounded-2xl bg-slate-900 border flex flex-col shadow-2xl overflow-hidden"
        style={{
          borderColor: `${currentTheme.primary}44`,
          boxShadow: `0 0 30px ${currentTheme.primary}15`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border font-mono"
              style={{
                backgroundColor: `${currentTheme.primary}15`,
                borderColor: `${currentTheme.primary}55`,
                color: currentTheme.primary,
              }}
            >
              <ShieldCheck className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-100 flex items-center gap-2">
                COMMANDER AUTHORIZATION PROTOCOL
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                Exclusive pilot security profile & voiceprint constraints
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {/* Voiceprint Status Banner */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-emerald-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Fingerprint className="w-6 h-6 text-emerald-400" />
              <div>
                <div className="text-xs font-mono font-bold text-emerald-300">
                  VOICEPRINT BIOMETRIC VERIFIED
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  Acoustic pattern matched to {profile.commanderName}
                </div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 border border-emerald-500/50 text-emerald-400">
              L5 ARMED
            </span>
          </div>

          {/* Commander Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">
                Authorized Commander Name
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">
                Voice Call Sign
              </label>
              <input
                type="text"
                required
                value={callSign}
                onChange={(e) => setCallSign(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">
                Clearance Designation
              </label>
              <input
                type="text"
                required
                value={clearance}
                onChange={(e) => setClearance(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">
                Security Status
              </label>
              <div className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-emerald-300">
                {globalAuthManager.hasPasscode() ? 'Argon2id PIN SET ✅' : 'PIN NOT SET'}
              </div>
            </div>
          </div>

          {/* Change Security Passcode (hashed, kabhi plaintext save nahi hota) */}
          <form onSubmit={handleChangePin} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">Current PIN</label>
              <input
                type="password"
                value={curPin}
                onChange={(e) => setCurPin(e.target.value)}
                placeholder="••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-slate-400 uppercase mb-1">New PIN (min 4)</label>
              <input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-slate-950 flex items-center justify-center gap-1.5 hover:brightness-110 cursor-pointer"
              style={{ backgroundColor: currentTheme.primary }}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Change PIN</span>
            </button>
            {pinMsg && (
              <div className={`sm:col-span-3 text-[11px] font-mono ${pinOk ? 'text-emerald-300' : 'text-red-300'}`}>{pinMsg}</div>
            )}
          </form>

          {/* Enforce Commander Only Toggle */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
            <input
              type="checkbox"
              id="modalEnforceOnly"
              checked={enforceOnly}
              onChange={(e) => setEnforceOnly(e.target.checked)}
              className="mt-0.5 rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
            />
            <label htmlFor="modalEnforceOnly" className="cursor-pointer">
              <div className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>Enforce Commander-Only Protocol ("Only I can talk to FRIDAY")</span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-1 leading-relaxed">
                When active, FRIDAY strictly rejects third parties and will only obey commands from Commander {name}.
              </p>
            </label>
          </div>

          {savedSuccess && (
            <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Clearance profiles updated and synced to FRIDAY core.</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={handleLockNow}
              className="px-3 py-2 rounded-xl border border-red-500/40 bg-red-950/30 text-red-400 text-xs font-mono hover:bg-red-950/60 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Lock Protocol (Log Out)</span>
            </button>

            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-mono font-bold text-slate-950 flex items-center gap-1.5 transition-all hover:brightness-110 cursor-pointer"
              style={{ backgroundColor: currentTheme.primary }}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Update Credentials</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
