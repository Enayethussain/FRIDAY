import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone, PhoneCall, MessageSquare, Camera, Flashlight, Volume2, VolumeX,
  Bluetooth, BluetoothOff, Settings, Lock, Unlock, Search, Wifi, WifiOff,
  Bell, BellOff, Sun, Moon, Mic, MicOff, Smartphone, Camera as CameraIcon,
  Mail, Globe, MapPin, Clock, ChevronDown, X, Send, Eye, EyeOff, Maximize2,
  Minimize2, AlertTriangle, CheckCircle2, XCircle, Loader2, Zap
} from 'lucide-react';
import { PhoneService, PhoneContact, SmsMessage } from '../services/PhoneService';
import { DeviceControlService } from '../services/DeviceControlService';
import { AppLauncherService } from '../services/AppLauncherService';
import { NotificationReaderService, NotificationData } from '../services/NotificationReaderService';
import { CommandEngine, ParsedCommand, CommandResult } from '../services/CommandEngine';
import { SpeechService } from '../services/SpeechService';
import { TTSService } from '../services/TTSService';
import { ConversationEngine } from '../services/ConversationEngine';
import { FridayLogger } from '../services/FridayLogger';
import { THEMES } from '../utils/theme';
import { ThemeAccent } from '../types';

interface HUDPhoneAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeAccent;
}

type PhoneTab = 'voice' | 'calls' | 'sms' | 'contacts' | 'apps' | 'controls' | 'notifications' | 'files';

export function HUDPhoneAssistant({ isOpen, onClose, theme }: HUDPhoneAssistantProps) {
  const currentTheme = THEMES[theme] || THEMES.amber;
  const [activeTab, setActiveTab] = useState<PhoneTab>('voice');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<CommandResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [recentSms, setRecentSms] = useState<SmsMessage[]>([]);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [installedApps, setInstalledApps] = useState<{ name: string; packageName: string }[]>([]);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [bluetoothOn, setBluetoothOn] = useState(false);
  const [volumeInfo, setVolumeInfo] = useState({ current: 0, max: 15 });
  const [brightnessPct, setBrightnessPct] = useState(50);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<ParsedCommand | null>(null);
  const [notificationAccess, setNotificationAccess] = useState(false);
  const [continuous, setContinuous] = useState(() => ConversationEngine.isContinuous());
  const [convoState, setConvoState] = useState('IDLE');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    } else {
      // Release mic + TTS the moment the panel closes — no stuck audio.
      SpeechService.stopListening().catch(() => {});
      TTSService.stop().catch(() => {});
      ConversationEngine.stop().catch(() => {});
      setIsListening(false);
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    ConversationEngine.configure({
      onState: (s) => setConvoState(s),
      onTranscriptHeard: (t) => setTranscript(t),
      onTranscript: async (text) => {
        const command = CommandEngine.parse(text);
        if (command.requiresConfirmation) {
          setPendingConfirm(command);
          return 'Sir, confirm karo — Haan ya Nahi bolo.';
        }
        const res = await CommandEngine.execute(command);
        setResult(res);
        refreshData();
        return res.voiceResponse || null;
      },
    });
  }, []);

  const loadInitialData = async () => {
    try {
      const bt = await DeviceControlService.getBluetoothStatus().catch(() => ({ enabled: false }));
      setBluetoothOn(bt.enabled);
      try {
        setVolumeInfo(await DeviceControlService.getVolume());
      } catch { /* volume unreadable — controls still attempt actions honestly */ }
      try {
        setBrightnessPct((await DeviceControlService.getBrightnessSafe()).percentage);
      } catch { /* same */ }
      const notifAccess = await NotificationReaderService.isEnabled().catch(() => false);
      setNotificationAccess(notifAccess);

      const apps = await AppLauncherService.getInstalledApps();
      setInstalledApps(apps);

      if (notifAccess) {
        const notifs = await NotificationReaderService.getRecent(20);
        setNotifications(notifs);
      }
    } catch (e) {
      console.error('Init failed:', e);
    }
  };

  const startListening = async () => {
    try {
      setIsListening(true);
      setTranscript('');
      setResult(null);
      const text = await SpeechService.startListening();
      setTranscript(text);
      setIsListening(false);
      if (ConversationEngine.isStopCommand(text)) {
        await stopAll();
        return;
      }
      await processCommand(text);
      // Continuous mode: automatically listen again after answering.
      if (continuous && isOpen) {
        setTimeout(() => { if (isOpen) startListening(); }, 400);
      }
    } catch (e: any) {
      setIsListening(false);
      const msg = e?.message || '';
      if (msg === 'no-speech' || msg === 'aborted' || msg === 'already-listening' || msg === 'tts-active') {
        FridayLogger.debug('PhoneAssistant', `listen skipped: ${msg}`);
        if (continuous && isOpen && msg !== 'already-listening') {
          setTimeout(() => { if (isOpen) startListening(); }, 600);
        }
        return;
      }
      setResult({ success: false, message: msg, voiceResponse: 'Sun nahi paya. Dobara bolo.' });
    }
  };

  const stopAll = async () => {
    try { await SpeechService.stopListening(); } catch {}
    try { await TTSService.stop(); } catch {}
    try { await ConversationEngine.interrupt(); } catch {}
    setIsListening(false);
    setLoading(false);
    setPendingConfirm(null);
    FridayLogger.info('PhoneAssistant', 'stopped by user');
  };

  const processCommand = async (text: string) => {
    setLoading(true);
    try {
      const command = CommandEngine.parse(text);
      if (command.requiresConfirmation) {
        setPendingConfirm(command);
        await TTSService.speak(CommandEngine['getConfirmationMessage'](command));
        setLoading(false);
        return;
      }
      const res = await CommandEngine.execute(command);
      setResult(res);
      if (res.voiceResponse) {
        await TTSService.speak(res.voiceResponse);
      }
      refreshData();
    } catch (e: any) {
      setResult({ success: false, message: e.message, voiceResponse: `Error: ${e.message}` });
    }
    setLoading(false);
  };

  const handleConfirm = async (confirmed: boolean) => {
    if (pendingConfirm) {
      setPendingConfirm(null);
      setLoading(true);
      if (confirmed) {
        const res = await CommandEngine.execute(pendingConfirm);
        setResult(res);
        if (res.voiceResponse) await TTSService.speak(res.voiceResponse);
      } else {
        await TTSService.speak('Theek hai, cancel kar diya.');
      }
      setLoading(false);
    }
  };

  const refreshData = async () => {
    try {
      const [notifs, sms] = await Promise.all([
        notificationAccess ? NotificationReaderService.getRecent(20) : [],
        PhoneService.getRecentSms(10),
      ]);
      setNotifications(notifs);
      setRecentSms(sms);
    } catch {}
  };

  const quickAction = async (action: string) => {
    setLoading(true);
    const res = await SpeechService.processVoiceCommand(action);
    setResult(res);
    if (res.voiceResponse) await TTSService.speak(res.voiceResponse);
    setLoading(false);
    refreshData();
  };

  if (!isOpen) return null;

  const tabs: { key: PhoneTab; icon: React.ReactNode; label: string }[] = [
    { key: 'voice', icon: <Mic className="w-4 h-4" />, label: 'Voice' },
    { key: 'calls', icon: <Phone className="w-4 h-4" />, label: 'Calls' },
    { key: 'sms', icon: <MessageSquare className="w-4 h-4" />, label: 'SMS' },
    { key: 'contacts', icon: <Smartphone className="w-4 h-4" />, label: 'Contacts' },
    { key: 'apps', icon: <Globe className="w-4 h-4" />, label: 'Apps' },
    { key: 'controls', icon: <Zap className="w-4 h-4" />, label: 'Controls' },
    { key: 'notifications', icon: <Bell className="w-4 h-4" />, label: 'Alerts' },
    { key: 'files', icon: <Search className="w-4 h-4" />, label: 'Files' },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4">
      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl"
        style={{
          backgroundColor: '#090e1a',
          borderColor: `${currentTheme.primary}44`,
          boxShadow: `0 0 40px ${currentTheme.primary}22`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg border" style={{ borderColor: `${currentTheme.primary}44`, color: currentTheme.primary }}>
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white font-mono">FRIDAY PHONE ASSISTANT</h2>
              <p className="text-[10px] text-slate-400 font-mono">Real Android Control</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto gap-1 px-2 py-2 border-b border-slate-800 bg-slate-900/30">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap transition-all ${
                activeTab === t.key
                  ? 'text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={activeTab === t.key ? { backgroundColor: `${currentTheme.primary}22`, color: currentTheme.primary } : {}}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Voice Tab */}
          {activeTab === 'voice' && (
            <div className="space-y-4">
              {/* Mic Button */}
              <div className="flex justify-center items-center gap-3">
                <button
                  onClick={startListening}
                  disabled={isListening || loading}
                  className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                    isListening
                      ? 'bg-red-500/30 border-2 border-red-500 animate-pulse'
                      : 'bg-slate-800 border-2 border-slate-700 hover:border-current'
                  }`}
                  style={!isListening ? { borderColor: currentTheme.primary, color: currentTheme.primary } : {}}
                >
                  {isListening ? (
                    <MicOff className="w-8 h-8 text-red-400" />
                  ) : (
                    <Mic className="w-8 h-8" />
                  )}
                </button>
                <button
                  onClick={stopAll}
                  title="Stop — TTS + mic turant roko"
                  className="w-12 h-12 rounded-full flex items-center justify-center bg-red-900/40 border-2 border-red-500/60 text-red-300 hover:bg-red-900/70 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-center text-xs text-slate-400 font-mono">
                {isListening ? 'Listening... speak now' : loading ? 'Processing...' : `Tap mic or say "Friday" • ${convoState}`}
              </p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-[11px] text-slate-400 font-mono">Continuous conversation</span>
                <button
                  onClick={() => { const v = !continuous; setContinuous(v); ConversationEngine.setContinuous(v); }}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold ${continuous ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                >
                  {continuous ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Transcript */}
              {transcript && (
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700">
                  <p className="text-xs text-slate-400 font-mono mb-1">HEARD:</p>
                  <p className="text-sm text-white font-mono">{transcript}</p>
                </div>
              )}

              {/* Result */}
              {result && (
                <div className={`p-3 rounded-xl border ${result.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {result.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                    <p className="text-xs font-mono font-bold text-white">{result.message}</p>
                  </div>
                  {result.voiceResponse && <p className="text-xs text-slate-400 font-mono">{result.voiceResponse}</p>}
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: currentTheme.primary }} />
                  <span className="text-xs text-slate-400 font-mono">Processing...</span>
                </div>
              )}

              {/* Confirmation */}
              {pendingConfirm && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <p className="text-sm text-amber-200 font-mono mb-3">Confirmation required:</p>
                  <div className="flex gap-2">
                    <button onClick={() => handleConfirm(true)} className="flex-1 py-2 rounded-lg bg-emerald-600 text-white font-bold text-sm">
                      Haan (Yes)
                    </button>
                    <button onClick={() => handleConfirm(false)} className="flex-1 py-2 rounded-lg bg-red-600 text-white font-bold text-sm">
                      Nahi (No)
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="space-y-2">
                <p className="text-xs text-slate-400 font-mono font-bold">QUICK COMMANDS:</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Flashlight On/Off', cmd: 'flashlight toggle' },
                    { label: 'Volume Up', cmd: 'volume up' },
                    { label: 'Volume Down', cmd: 'volume down' },
                    { label: 'Open WhatsApp', cmd: 'open whatsapp' },
                    { label: 'Open Instagram', cmd: 'open instagram' },
                    { label: 'Open Camera', cmd: 'open camera' },
                    { label: 'Lock Phone', cmd: 'lock screen' },
                    { label: 'Bluetooth Toggle', cmd: 'bluetooth toggle' },
                    { label: 'Open Gmail', cmd: 'open gmail' },
                    { label: 'Open YouTube', cmd: 'open youtube' },
                    { label: 'Open Settings', cmd: 'open settings' },
                    { label: 'Go Home', cmd: 'go home' },
                  ].map((a) => (
                    <button
                      key={a.cmd}
                      onClick={() => quickAction(a.cmd)}
                      className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 font-mono hover:bg-slate-700 transition-colors text-left"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Calls Tab */}
          {activeTab === 'calls' && (
            <div className="space-y-3">
              <button
                onClick={() => quickAction('recent calls')}
                className="w-full py-2 rounded-lg text-white font-bold text-sm"
                style={{ backgroundColor: currentTheme.primary }}
              >
                Get Recent Calls
              </button>
              {result?.data && Array.isArray(result.data) && result.data.map((call: any, i: number) => (
                <div key={i} className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white font-mono font-bold">{call.name || call.number}</p>
                    <p className="text-xs text-slate-400 font-mono">{call.type} • {new Date(call.date).toLocaleString()}</p>
                  </div>
                  <button onClick={async () => {
                    const r = await PhoneService.makeCall(call.number);
                    setResult({ success: r.status === 'SUCCESS', message: r.message, voiceResponse: r.message });
                  }} className="p-2 rounded-lg bg-emerald-600 text-white">
                    <Phone className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* SMS Tab */}
          {activeTab === 'sms' && (
            <div className="space-y-3">
              <button
                onClick={refreshData}
                className="w-full py-2 rounded-lg text-white font-bold text-sm"
                style={{ backgroundColor: currentTheme.primary }}
              >
                Refresh SMS
              </button>
              {recentSms.length === 0 && (
                <p className="text-xs text-slate-400 font-mono text-center py-4">No SMS found. Grant SMS permission first.</p>
              )}
              {recentSms.map((sms, i) => (
                <div key={i} className="p-3 rounded-xl bg-slate-800/60 border border-slate-700">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-white font-mono font-bold">{sms.address}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{new Date(sms.date).toLocaleString()}</p>
                  </div>
                  <p className="text-xs text-slate-300 font-mono">{sms.body}</p>
                </div>
              ))}
            </div>
          )}

          {/* Contacts Tab */}
          {activeTab === 'contacts' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search contacts..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={async () => {
                    const c = await PhoneService.searchContacts(searchQuery);
                    setContacts(c);
                  }}
                  className="px-4 py-2 rounded-xl text-white text-sm font-bold"
                  style={{ backgroundColor: currentTheme.primary }}
                >
                  Search
                </button>
              </div>
              {contacts.map((c) => (
                <div key={c.id} className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white font-mono font-bold">{c.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{c.number}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={async () => {
                      const r = await PhoneService.makeCall(c.number);
                      setResult({ success: r.status === 'SUCCESS', message: r.message, voiceResponse: r.message });
                    }} className="p-2 rounded-lg bg-emerald-600 text-white">
                      <Phone className="w-4 h-4" />
                    </button>
                    <button onClick={() => quickAction(`sms ${c.name}`)} className="p-2 rounded-lg bg-amber-600 text-white">
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Apps Tab */}
          {activeTab === 'apps' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: 'WhatsApp', pkg: 'com.whatsapp', icon: '💬' },
                  { name: 'Instagram', pkg: 'com.instagram.android', icon: '📷' },
                  { name: 'Telegram', pkg: 'org.telegram.messenger', icon: '✈️' },
                  { name: 'YouTube', pkg: 'com.google.android.youtube', icon: '▶️' },
                  { name: 'Gmail', pkg: 'com.google.android.gm', icon: '📧' },
                  { name: 'Chrome', pkg: 'com.android.chrome', icon: '🌐' },
                  { name: 'Camera', pkg: 'com.android.camera2', icon: '📸' },
                  { name: 'Settings', pkg: 'com.android.settings', icon: '⚙️' },
                  { name: 'Files', pkg: 'com.google.android.apps.nbu.files', icon: '📁' },
                  { name: 'Calendar', pkg: 'com.google.android.calendar', icon: '📅' },
                  { name: 'Maps', pkg: 'com.google.android.apps.maps', icon: '🗺️' },
                  { name: 'Play Store', pkg: 'com.android.vending', icon: '🛒' },
                ].map((app) => (
                  <button
                    key={app.pkg}
                    onClick={async () => {
                      const r = await AppLauncherService.launchApp(app.pkg);
                      setResult({ success: r.status === 'SUCCESS', message: r.message, voiceResponse: r.message });
                    }}
                    className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 flex flex-col items-center gap-1 hover:bg-slate-700/60 transition-colors"
                  >
                    <span className="text-2xl">{app.icon}</span>
                    <span className="text-[10px] text-slate-300 font-mono">{app.name}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search all apps..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm font-mono focus:outline-none"
                />
                <button
                  onClick={async () => {
                    const apps = await AppLauncherService.searchApps(searchQuery);
                    setInstalledApps(apps);
                  }}
                  className="px-4 py-2 rounded-xl text-white text-sm font-bold"
                  style={{ backgroundColor: currentTheme.primary }}
                >
                  Search
                </button>
              </div>
              {installedApps.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 20).map((app) => (
                <div key={app.packageName} className="p-2 rounded-lg bg-slate-800/40 border border-slate-700/50 flex items-center justify-between">
                  <span className="text-xs text-slate-300 font-mono">{app.name}</span>
                  <button onClick={async () => {
                    const r = await AppLauncherService.launchApp(app.packageName);
                    setResult({ success: r.status === 'SUCCESS', message: r.message, voiceResponse: r.message });
                  }} className="px-3 py-1 rounded bg-slate-700 text-xs text-white">
                    Open
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Controls Tab */}
          {activeTab === 'controls' && (
            <div className="space-y-4">
              {/* Flashlight */}
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Flashlight className="w-5 h-5 text-amber-400" />
                  <span className="text-sm text-white font-mono">Flashlight</span>
                </div>
                <button
                  onClick={async () => {
                    const r = await DeviceControlService.toggleFlashlight();
                    if (r.status === 'SUCCESS') {
                      setFlashlightOn(typeof r.data === 'boolean' ? r.data : (prev) => !prev);
                    }
                    setResult({ success: r.status === 'SUCCESS', message: r.message, voiceResponse: r.message });
                  }}
                  className={`px-4 py-2 rounded-lg font-bold text-xs ${flashlightOn ? 'bg-amber-500 text-black' : 'bg-slate-700 text-white'}`}
                >
                  {flashlightOn ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Volume */}
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {volumeInfo.current > 0 ? <Volume2 className="w-5 h-5 text-amber-400" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
                    <span className="text-sm text-white font-mono">Volume</span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">{volumeInfo.current}/{volumeInfo.max}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    const r = await DeviceControlService.adjustVolume(-1);
                    if (r.status === 'SUCCESS' && typeof r.data === 'number') setVolumeInfo((v) => ({ ...v, current: r.data as number }));
                    else setResult({ success: false, message: r.message, voiceResponse: r.message });
                  }} className="flex-1 py-2 rounded-lg bg-slate-700 text-white text-sm">-</button>
                  <button onClick={async () => {
                    const r = await DeviceControlService.adjustVolume(1);
                    if (r.status === 'SUCCESS' && typeof r.data === 'number') setVolumeInfo((v) => ({ ...v, current: r.data as number }));
                    else setResult({ success: false, message: r.message, voiceResponse: r.message });
                  }} className="flex-1 py-2 rounded-lg bg-slate-700 text-white text-sm">+</button>
                </div>
              </div>

              {/* Brightness */}
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Sun className="w-5 h-5 text-yellow-400" />
                    <span className="text-sm text-white font-mono">Brightness</span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">{brightnessPct}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={brightnessPct}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setBrightnessPct(v);
                    DeviceControlService.setBrightness(Math.round(v * 2.55));
                  }}
                  className="w-full"
                />
              </div>

              {/* Bluetooth */}
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {bluetoothOn ? <Bluetooth className="w-5 h-5 text-amber-400" /> : <BluetoothOff className="w-5 h-5 text-slate-400" />}
                  <span className="text-sm text-white font-mono">Bluetooth</span>
                </div>
                <button
                  onClick={async () => {
                    const r = await DeviceControlService.toggleBluetooth();
                    if (r.status === 'SUCCESS') setBluetoothOn((await DeviceControlService.getBluetoothStatus()).enabled);
                    setResult({ success: r.status === 'SUCCESS', message: r.message, voiceResponse: r.message });
                  }}
                  className={`px-4 py-2 rounded-lg font-bold text-xs ${bluetoothOn ? 'bg-amber-500 text-white' : 'bg-slate-700 text-white'}`}
                >
                  {bluetoothOn ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Lock Screen */}
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-red-400" />
                  <span className="text-sm text-white font-mono">Lock Screen</span>
                </div>
                <button onClick={async () => {
                  const r = await DeviceControlService.lockScreen();
                  setResult({ success: r.status === 'SUCCESS', message: r.message, voiceResponse: r.message });
                }} className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold">
                  Lock
                </button>
              </div>

              {/* Quick Settings */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'WiFi', action: () => DeviceControlService.openSettings('wifi') },
                  { label: 'Bluetooth', action: () => DeviceControlService.openSettings('bluetooth') },
                  { label: 'Sound', action: () => DeviceControlService.openSettings('sound') },
                  { label: 'Display', action: () => DeviceControlService.openSettings('display') },
                  { label: 'Battery', action: () => DeviceControlService.openSettings('battery') },
                  { label: 'Security', action: () => DeviceControlService.openSettings('security') },
                  { label: 'Accessibility', action: () => DeviceControlService.openSettings('accessibility') },
                  { label: 'Developer', action: () => DeviceControlService.openSettings('developer') },
                ].map((s) => (
                  <button
                    key={s.label}
                    onClick={s.action}
                    className="py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 font-mono hover:bg-slate-700 transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-3">
              {!notificationAccess && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <p className="text-xs text-amber-200 font-mono mb-2">Notification access required for reading messages.</p>
                  <button
                    onClick={() => NotificationReaderService.openSettings()}
                    className="px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold"
                  >
                    Enable Notification Access
                  </button>
                </div>
              )}
              <button
                onClick={refreshData}
                className="w-full py-2 rounded-lg text-white font-bold text-sm"
                style={{ backgroundColor: currentTheme.primary }}
              >
                Refresh Notifications
              </button>
              {notifications.length === 0 && (
                <p className="text-xs text-slate-400 font-mono text-center py-4">No notifications found.</p>
              )}
              {notifications.map((n, i) => (
                <div key={i} className="p-3 rounded-xl bg-slate-800/60 border border-slate-700">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-mono font-bold text-white">{n.appName || n.package}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{new Date(n.timestamp).toLocaleTimeString()}</p>
                  </div>
                  <p className="text-sm text-slate-200 font-mono font-bold">{n.title}</p>
                  <p className="text-xs text-slate-400 font-mono">{n.text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Files Tab */}
          {activeTab === 'files' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 font-mono">File operations require Storage Access Framework.</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Open Files App', action: () => AppLauncherService.launchApp('com.google.android.apps.nbu.files') },
                  { label: 'Open Downloads', action: () => AppLauncherService.openUrl('content://com.android.externalstorage.documents/document/primary%3ADownload') },
                ].map((f) => (
                  <button
                    key={f.label}
                    onClick={f.action}
                    className="py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 font-mono hover:bg-slate-700 transition-colors"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
