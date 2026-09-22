import React, { useState, useEffect } from 'react';
import { Shield, CheckCircle2, XCircle, AlertTriangle, Settings, ExternalLink, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { NotificationReaderService } from '../services/NotificationReaderService';
import { DeviceControlService } from '../services/DeviceControlService';
import { ScreenContextService } from '../services/ScreenContextService';
import { SpeechService } from '../services/SpeechService';
import { TTSService } from '../services/TTSService';
import { THEMES } from '../utils/theme';
import { ThemeAccent } from '../types';

interface HUDPermissionCenterProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeAccent;
}

interface PermissionStatus {
  name: string;
  description: string;
  granted: boolean;
  required: boolean;
  settingsAction?: string;
}

export function HUDPermissionCenter({ isOpen, onClose, theme }: HUDPermissionCenterProps) {
  const currentTheme = THEMES[theme] || THEMES.amber;
  const [permissions, setPermissions] = useState<PermissionStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) checkPermissions();
  }, [isOpen]);

  const checkPermissions = async () => {
    setLoading(true);
    const isAndroid = Capacitor.getPlatform() === 'android';
    const perms: PermissionStatus[] = [];

    // Notification access
    const notifAccess = await NotificationReaderService.isEnabled();
    perms.push({
      name: 'Notification Listener',
      description: 'Read WhatsApp, Instagram, SMS, Gmail notifications',
      granted: notifAccess,
      required: true,
      settingsAction: 'notification_listener_access',
    });

    // Speech recognition
    const speechAvail = await SpeechService.isAvailable();
    perms.push({
      name: 'Speech Recognition',
      description: 'Voice commands and wake word detection',
      granted: speechAvail,
      required: true,
    });

    // TTS
    perms.push({
      name: 'Text-to-Speech',
      description: 'FRIDAY voice responses',
      granted: true,
      required: false,
    });

    // Check Android permissions — every row is a REAL check, never assumed.
    if (isAndroid) {
      const runtime: Array<{ key: string; name: string; desc: string; required: boolean }> = [
        { key: 'microphone', name: 'Microphone', desc: 'Voice commands and AI conversation', required: true },
        { key: 'camera', name: 'Camera', desc: 'Photo capture and vision analysis', required: false },
        { key: 'contacts', name: 'Contacts', desc: 'Call contacts and resolve names', required: true },
        { key: 'phone', name: 'Phone', desc: 'Make and receive calls', required: true },
        { key: 'sms', name: 'SMS', desc: 'Read and send text messages', required: true },
        { key: 'storage', name: 'Storage', desc: 'File management and document reading', required: false },
        { key: 'location', name: 'Location', desc: 'Weather and maps features', required: false },
        { key: 'bluetooth', name: 'Nearby Devices (Bluetooth)', desc: 'Bluetooth status (toggle needs this on Android 12+)', required: false },
      ];
      for (const p of runtime) {
        let granted = false;
        try { granted = await DeviceControlService.checkPermission(p.key); } catch { granted = false; }
        perms.push({ name: p.name, description: p.desc, granted, required: p.required, settingsAction: 'app' });
      }
      // Special access pages (not runtime permissions — checked via system APIs)
      let usage = false;
      try { usage = await ScreenContextService.hasPermission(); } catch { usage = false; }
      perms.push({
        name: 'Usage Access',
        description: 'Verify opened apps (FRIDAY confirms launches instead of guessing)',
        granted: usage, required: true, settingsAction: 'usage_access',
      });
      let canWrite = false;
      try { canWrite = await DeviceControlService.canWriteSettings(); } catch { canWrite = false; }
      perms.push({
        name: 'Write Settings',
        description: 'Brightness and system settings',
        granted: canWrite, required: false, settingsAction: 'write_settings',
      });
      let admin = false;
      try { admin = await DeviceControlService.isDeviceAdmin(); } catch { admin = false; }
      perms.push({
        name: 'Device Admin (Screen Lock)',
        description: 'Real screen lock on command — nothing else',
        granted: admin, required: false, settingsAction: 'device_admin',
      });
    }

    setPermissions(perms);
    setLoading(false);
  };

  const getGrantedCount = () => permissions.filter(p => p.granted).length;
  const getRequiredMissing = () => permissions.filter(p => p.required && !p.granted);

  if (!isOpen) return null;

  const requiredMissing = getRequiredMissing();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border shadow-2xl"
        style={{
          backgroundColor: '#090e1a',
          borderColor: `${currentTheme.primary}44`,
          boxShadow: `0 0 40px ${currentTheme.primary}22`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg border" style={{ borderColor: `${currentTheme.primary}44`, color: currentTheme.primary }}>
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white font-mono">PERMISSION CENTER</h2>
              <p className="text-[10px] text-slate-400 font-mono">{getGrantedCount()}/{permissions.length} granted</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Banner */}
        {requiredMissing.length > 0 && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <p className="text-xs font-mono font-bold text-amber-200">{requiredMissing.length} required permission(s) missing</p>
            </div>
            <p className="text-[11px] text-amber-300/80 font-mono">
              Some features won't work without these permissions.
            </p>
          </div>
        )}

        {/* Permissions List */}
        <div className="p-5 space-y-3">
          {loading ? (
            <p className="text-xs text-slate-400 font-mono text-center py-8">Checking permissions...</p>
          ) : (
            permissions.map((perm, i) => (
              <div
                key={i}
                className={`p-4 rounded-xl border flex items-center justify-between ${
                  perm.granted
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : perm.required
                    ? 'bg-red-500/5 border-red-500/20'
                    : 'bg-slate-800/40 border-slate-700/50'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-mono font-bold text-white">{perm.name}</p>
                    {perm.required && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">REQUIRED</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">{perm.description}</p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {perm.granted ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                  {perm.settingsAction && !perm.granted && (
                    <button
                      onClick={() => {
                        if (perm.settingsAction === 'notification_listener_access') {
                          NotificationReaderService.openSettings();
                        } else if (perm.settingsAction === 'usage_access') {
                          ScreenContextService.openSettings();
                        } else if (perm.settingsAction === 'write_settings') {
                          DeviceControlService.openWriteSettings();
                        } else if (perm.settingsAction === 'device_admin') {
                          DeviceControlService.enableDeviceAdmin();
                        } else {
                          DeviceControlService.openAppSettings();
                        }
                      }}
                      className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-300" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Info Footer */}
        <div className="px-5 pb-5">
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/30">
            <p className="text-[11px] text-slate-400 font-mono">
              On Android, permissions are requested when you first use a feature. If denied, go to Android Settings → Apps → FRIDAY → Permissions to enable them manually.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
