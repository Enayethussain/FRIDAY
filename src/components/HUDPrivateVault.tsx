import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  FileCode,
  FileText,
  Trash2,
  Download,
  Plus,
  Save,
  X,
  Eye,
  FileLock2,
  AlertTriangle,
  Sparkles,
  Upload,
} from 'lucide-react';
import { PrivateFileItem, ThemeAccent } from '../types';
import { globalPrivateVault } from '../services/PrivateVaultManager';
import { THEMES } from '../utils/theme';
import { SoundEffects } from '../utils/SoundEffects';

interface HUDPrivateVaultProps {
  isOpen: boolean;
  theme: ThemeAccent;
  onClose: () => void;
  onExplainFile?: (file: PrivateFileItem) => void;
}

export const HUDPrivateVault: React.FC<HUDPrivateVaultProps> = ({
  isOpen,
  theme,
  onClose,
  onExplainFile,
}) => {
  const currentTheme = THEMES[theme] || THEMES.cyan;

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [files, setFiles] = useState<PrivateFileItem[]>([]);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSet, setPinSet] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [setupPin, setSetupPin] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [selectedFile, setSelectedFile] = useState<PrivateFileItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editName, setEditName] = useState('');
  const [isNewFileModal, setIsNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [newFileCategory, setNewFileCategory] = useState<PrivateFileItem['category']>('confidential_project');
  const [isChangePinOpen, setIsChangePinOpen] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinChangeMsg, setPinChangeMsg] = useState<string | null>(null);

  const fileUploadRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsub = globalPrivateVault.subscribe((unlocked, vaultFiles) => {
      setIsUnlocked(unlocked);
      setFiles(vaultFiles);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (isOpen) {
      setPinError(null);
      setPinInput('');
      globalPrivateVault.whenReady().then(() => {
        setPinSet(globalPrivateVault.hasPin());
      }).catch(() => setPinSet(true));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeypadPress = (val: string) => {
    SoundEffects.playSubtleBeep();
    if (pinInput.length < 8) {
      const next = pinInput + val;
      setPinInput(next);
      setPinError(null);
    }
  };

  const handleKeypadBackspace = () => {
    SoundEffects.playSubtleBeep();
    setPinInput((prev) => prev.slice(0, -1));
    setPinError(null);
  };

  const handleKeypadSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pinInput || unlocking) return;
    setUnlocking(true);
    try {
      const res = await globalPrivateVault.unlock(pinInput);
      if (res.success) {
        SoundEffects.playCurriculumUpdated();
        setPinInput('');
        setPinError(null);
      } else {
        SoundEffects.playAccessDenied();
        setPinError(res.message);
        setPinInput('');
        if (!(globalPrivateVault.hasPin())) setPinSet(false);
      }
    } catch {
      setPinError('Unlock failed. Dobara try karo.');
      setPinInput('');
    }
    setUnlocking(false);
  };

  const handleSetupPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unlocking) return;
    if (setupPin.trim().length < 4) {
      setPinError('PIN kam se kam 4 characters ka ho.');
      return;
    }
    if (setupPin.trim() !== setupConfirm.trim()) {
      setPinError('Dono PIN match nahi hue.');
      return;
    }
    setUnlocking(true);
    try {
      const res = await globalPrivateVault.setupPin(setupPin.trim());
      if (res.success) {
        SoundEffects.playCurriculumUpdated();
        setPinSet(true);
        setSetupPin('');
        setSetupConfirm('');
        setPinError(null);
      } else {
        setPinError(res.message);
      }
    } catch {
      setPinError('Setup failed. Dobara try karo.');
    }
    setUnlocking(false);
  };

  const handleLockNow = () => {
    SoundEffects.playSubtleBeep();
    globalPrivateVault.lock();
    setSelectedFile(null);
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!selectedFile) return;
    SoundEffects.playCurriculumUpdated();
    await globalPrivateVault.updateFile(selectedFile.id, {
      name: editName.trim() || selectedFile.name,
      content: editContent,
    });
    setIsEditing(false);
    const updated = globalPrivateVault.getFile(selectedFile.id);
    if (updated) setSelectedFile(updated);
  };

  const handleDeleteFile = async (id: string) => {
    SoundEffects.playSubtleBeep();
    await globalPrivateVault.deleteFile(id);
    if (selectedFile?.id === id) {
      setSelectedFile(null);
      setIsEditing(false);
    }
  };

  const handleDownloadFile = (file: PrivateFileItem) => {
    SoundEffects.playSubtleBeep();
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCreateNewFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;

    const res = await globalPrivateVault.addFile(
      newFileName.trim(),
      newFileContent,
      newFileCategory,
      'TOP SECRET'
    );
    if (res.success && res.file) {
      SoundEffects.playCurriculumUpdated();
      setSelectedFile(res.file);
      setIsNewFileModal(false);
      setNewFileName('');
      setNewFileContent('');
    }
  };

  const handleUploadClassifiedFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    Array.from(fileList).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const content = (reader.result as string) || '';
        await globalPrivateVault.addFile(
          file.name,
          content,
          'document',
          'RESTRICTED'
        );
      };
      reader.readAsText(file);
    });

    SoundEffects.playCurriculumUpdated();
  };

  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await globalPrivateVault.setPasscode(oldPin, newPin);
    setPinChangeMsg(res.message);
    if (res.success) {
      SoundEffects.playCurriculumUpdated();
      setOldPin('');
      setNewPin('');
      setTimeout(() => {
        setIsChangePinOpen(false);
        setPinChangeMsg(null);
      }, 1500);
    } else {
      SoundEffects.playAccessDenied();
    }
  };

  return (
    <div
      id="private-vault-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="private-vault-modal"
        className="w-full max-w-4xl h-[88vh] sm:h-[82vh] bg-[#070b14] border rounded-2xl flex flex-col shadow-2xl relative overflow-hidden font-mono"
        style={{
          borderColor: isUnlocked ? `${currentTheme.primary}77` : '#ef444477',
          boxShadow: isUnlocked
            ? `0 0 50px rgba(0,0,0,0.9), 0 0 35px ${currentTheme.primary}25`
            : '0 0 50px rgba(0,0,0,0.9), 0 0 35px rgba(239, 68, 68, 0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Classified Top Banner Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/90 bg-[#050810]">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border flex items-center justify-center transition-all ${
                isUnlocked
                  ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-400'
                  : 'border-red-500/60 bg-red-950/40 text-red-400'
              }`}
            >
              {isUnlocked ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-slate-100 text-base sm:text-lg tracking-wide">
                  STARK CLASSIFIED PRIVATE VAULT
                </h3>
                <span
                  className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border font-semibold ${
                    isUnlocked
                      ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-400'
                      : 'bg-red-950/60 border-red-500/50 text-red-400'
                  }`}
                >
                  {isUnlocked ? 'SECURE LEVEL 5 ACCESS' : 'ZERO-KNOWLEDGE LOCK'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {isUnlocked
                  ? 'Authorized Operator: Commander Enayet Hussain • Private files decrypted'
                  : 'Isolated biometric & PIN quarantine • Private folder remains fully encrypted'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isUnlocked && (
              <>
                <button
                  type="button"
                  onClick={() => setIsChangePinOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition-all"
                  title="Change Vault PIN"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Change PIN</span>
                </button>
                <button
                  type="button"
                  onClick={handleLockNow}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/50 bg-red-950/40 hover:bg-red-900/50 text-xs text-red-300 font-bold transition-all cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>LOCK VAULT</span>
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="flex-1 flex overflow-hidden">
          {!isUnlocked ? (
            /* LOCKED VIEW: Cybernetic Security PIN Keypad */
            <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 relative overflow-y-auto">
              <div className="w-full max-w-sm flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-500/60 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.25)]">
                    <ShieldAlert className="w-8 h-8 text-red-400 animate-pulse" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 p-1 bg-black rounded-full border border-red-500/60">
                    <FileLock2 className="w-4 h-4 text-red-400" />
                  </div>
                </div>

                <h4 className="text-sm sm:text-base font-bold text-slate-100 uppercase tracking-widest mb-1">
                  CLEARANCE VERIFICATION REQUIRED
                </h4>
                <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                  Enter your Stark Security Passcode to decrypt your private classified folder. No external party or unauthorized voice can view these contents.
                </p>

                {/* PIN Display Dots */}
                <div className="flex items-center justify-center gap-3 mb-4">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`w-4 h-4 rounded-full border transition-all duration-150 ${
                        pinInput.length > idx
                          ? 'bg-red-500 border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.8)] scale-110'
                          : 'bg-slate-900 border-slate-700'
                      }`}
                    />
                  ))}
                </div>

                {pinError && (
                  <div className="w-full mb-4 px-3 py-2 rounded-lg bg-red-950/60 border border-red-500/50 text-red-300 text-xs flex items-center gap-2 animate-bounce">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{pinError}</span>
                  </div>
                )}

                {/* Keypad Grid */}
                <div className="grid grid-cols-3 gap-2.5 w-full mb-4">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleKeypadPress(digit)}
                      className="py-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-red-500/60 hover:bg-slate-800/80 text-lg font-bold text-slate-200 hover:text-white transition-all active:scale-95 cursor-pointer"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPinInput('')}
                    className="py-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:bg-slate-800 text-xs font-bold text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                  >
                    CLEAR
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('0')}
                    className="py-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-red-500/60 hover:bg-slate-800/80 text-lg font-bold text-slate-200 hover:text-white transition-all active:scale-95 cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handleKeypadBackspace}
                    className="py-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:bg-slate-800 text-xs font-bold text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                  >
                    ⌫
                  </button>
                </div>

                {!pinSet ? (
                  /* FIRST-TIME SETUP: koi default PIN nahi — user apna PIN banata hai */
                  <form onSubmit={handleSetupPinSubmit} className="w-full space-y-2.5">
                    <p className="text-xs text-amber-300 font-mono">Vault pehli baar khul raha hai — apna secret PIN set karo (AES-256 encrypted).</p>
                    <input
                      type="password"
                      inputMode="numeric"
                      value={setupPin}
                      onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="Naya PIN (min 4 digits)"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-center tracking-widest placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                    />
                    <input
                      type="password"
                      inputMode="numeric"
                      value={setupConfirm}
                      onChange={(e) => setSetupConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="PIN dobara likho"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-center tracking-widest placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="submit"
                      disabled={unlocking || setupPin.length < 4}
                      className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-xs tracking-wider transition-all cursor-pointer"
                    >
                      {unlocking ? 'SETTING...' : 'SET VAULT PIN'}
                    </button>
                  </form>
                ) : (
                  /* Submit Unlock Button */
                  <button
                    type="button"
                    onClick={() => handleKeypadSubmit()}
                    disabled={!pinInput || unlocking}
                    className={`w-full py-2.5 rounded-xl border font-bold text-xs tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      pinInput
                        ? 'bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                        : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{unlocking ? 'VERIFYING...' : 'AUTHORIZE DECRYPT'}</span>
                  </button>
                )}

                {/* Passcode hint */}
                <div className="mt-4 text-[11px] text-slate-500 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400/70" />
                  <span>AES-GCM-256 encrypted • PIN kahin plaintext me save nahi hota</span>
                </div>
              </div>
            </div>
          ) : (
            /* UNLOCKED VIEW: Private Files Matrix & Editor */
            <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
              {/* Left Column: Private Files Navigator */}
              <div className="flex-1 flex flex-col p-4 border-r border-slate-800/80 overflow-hidden">
                {/* Actions Toolbar */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-xs font-bold text-slate-300 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>CLASSIFIED REPOSITORY ({files.length})</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={fileUploadRef}
                      type="file"
                      multiple
                      onChange={handleUploadClassifiedFile}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileUploadRef.current?.click()}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs transition-all cursor-pointer"
                      title="Upload file into private vault"
                    >
                      <Upload className="w-3.5 h-3.5 text-sky-400" />
                      <span className="hidden sm:inline">Import</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewFileModal(true);
                        setNewFileName('');
                        setNewFileContent('');
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-500/60 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 text-xs font-bold transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Secret File</span>
                    </button>
                  </div>
                </div>

                {/* File List */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {files.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center text-center text-slate-500 text-xs">
                      <FileLock2 className="w-10 h-10 mb-2 opacity-40 text-emerald-400" />
                      <p>Private repository is currently empty.</p>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Click "New Secret File" or import files to store confidential documents safely.
                      </p>
                    </div>
                  ) : (
                    files.map((file) => {
                      const isSelected = selectedFile?.id === file.id;
                      return (
                        <div
                          key={file.id}
                          onClick={() => {
                            setSelectedFile(file);
                            setIsEditing(false);
                            setEditName(file.name);
                            setEditContent(file.content);
                          }}
                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-slate-800/90 border-emerald-500/80 shadow-md'
                              : 'bg-[#0a0f1d] border-slate-800 hover:bg-slate-800/40 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded-lg bg-slate-900 border border-slate-700/60 text-emerald-400 shrink-0">
                              {file.extension === 'sec' || file.category === 'secret_code' ? (
                                <FileCode className="w-4 h-4" />
                              ) : (
                                <FileText className="w-4 h-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-200 truncate flex items-center gap-1.5">
                                <span>{file.name}</span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-950/80 border border-red-500/60 text-red-300 uppercase">
                                  {file.classification}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <span>{(file.size / 1024).toFixed(1)} KB</span>
                                <span>•</span>
                                <span className="uppercase text-slate-500">{file.category.replace('_', ' ')}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadFile(file);
                              }}
                              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-700/60"
                              title="Export / Download Decrypted"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFile(file.id);
                              }}
                              className="p-1.5 text-slate-500 hover:text-red-400 rounded hover:bg-slate-700/60"
                              title="Permanent Shred"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Classified Inspector / Editor */}
              <div className="w-full sm:w-96 md:w-[420px] flex flex-col p-4 bg-[#050810] border-t sm:border-t-0 sm:border-l border-slate-800 overflow-hidden">
                {selectedFile ? (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* File Header */}
                    <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800">
                      <div className="min-w-0">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="text-xs font-bold text-slate-100 bg-slate-900 border border-slate-700 rounded px-2 py-1 w-full"
                          />
                        ) : (
                          <h4 className="text-xs font-bold text-slate-200 truncate flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="truncate">{selectedFile.name}</span>
                          </h4>
                        )}
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Classification: <span className="text-red-400 font-bold">{selectedFile.classification}</span> • {selectedFile.content.length} characters
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isEditing ? (
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                          >
                            <Save className="w-3 h-3" />
                            <span>Save</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditing(true);
                              setEditName(selectedFile.name);
                              setEditContent(selectedFile.content);
                            }}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Ask FRIDAY to explain voice shortcut banner */}
                    <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 mb-2 flex items-center justify-between gap-2 text-[11px] text-slate-300">
                      <div className="flex items-center gap-1.5 truncate">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">Say: "FRIDAY, explain my private file {selectedFile.name}"</span>
                      </div>
                      {onExplainFile && (
                        <button
                          type="button"
                          onClick={() => onExplainFile(selectedFile)}
                          className="text-[10px] text-emerald-400 hover:underline shrink-0 font-bold cursor-pointer"
                        >
                          Explain Now
                        </button>
                      )}
                    </div>

                    {/* Content Display / Textarea */}
                    <div className="flex-1 overflow-hidden rounded-xl bg-[#03050a] border border-slate-800 p-3 flex flex-col">
                      {isEditing ? (
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="flex-1 w-full bg-transparent text-xs text-slate-200 outline-none resize-none leading-relaxed font-mono select-text"
                          placeholder="Classified document content..."
                        />
                      ) : (
                        <pre className="flex-1 overflow-auto text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap select-text">
                          {selectedFile.content}
                        </pre>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 p-4">
                    <ShieldAlert className="w-10 h-10 mb-2 opacity-30 text-emerald-400" />
                    <h5 className="text-xs text-slate-300 font-bold">Classified Inspector Standby</h5>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-xs leading-relaxed">
                      Select any classified file from the list to preview, edit, or ask FRIDAY to perform neural breakdown.
                    </p>
                    <div className="mt-4 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-left text-[11px] space-y-1 text-slate-400">
                      <div className="text-slate-200 font-bold mb-1 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        Voice Commands Available:
                      </div>
                      <div>• "FRIDAY, lock my private folder"</div>
                      <div>• "FRIDAY, search classified vault"</div>
                      <div>• "FRIDAY, explain my secret blueprint"</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Change Passcode Modal Overlay */}
        {isChangePinOpen && (
          <div className="absolute inset-0 z-20 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-[#0a0f1d] border border-slate-700 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <span>Update Vault Passcode</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setIsChangePinOpen(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleChangePinSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Current PIN / Passcode</label>
                  <input
                    type="password"
                    value={oldPin}
                    onChange={(e) => setOldPin(e.target.value)}
                    placeholder="Enter current PIN"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">New PIN (Minimum 4 digits)</label>
                  <input
                    type="password"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder="Enter new secret PIN"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none focus:border-amber-500"
                    required
                  />
                </div>

                {pinChangeMsg && (
                  <p className="text-[11px] text-amber-400 mt-1">{pinChangeMsg}</p>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsChangePinOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-black font-bold"
                  >
                    Update PIN
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Create New Secret File Modal Overlay */}
        {isNewFileModal && (
          <div className="absolute inset-0 z-20 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-[#0a0f1d] border border-slate-700 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span>Create Classified Secret File</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setIsNewFileModal(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateNewFile} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">File Name</label>
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    placeholder="e.g. My_Secret_Passwords.txt or Quantum_Logic.ts"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Category</label>
                  <select
                    value={newFileCategory}
                    onChange={(e) => setNewFileCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none"
                  >
                    <option value="confidential_project">Confidential Project</option>
                    <option value="credentials">Credentials & Passwords</option>
                    <option value="secret_code">Secret Source Code</option>
                    <option value="personal_log">Personal Private Log</option>
                    <option value="document">Classified Document</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Confidential Content</label>
                  <textarea
                    rows={6}
                    value={newFileContent}
                    onChange={(e) => setNewFileContent(e.target.value)}
                    placeholder="Enter confidential notes, code, or data here..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none focus:border-emerald-500 resize-none font-mono"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsNewFileModal(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                  >
                    Save Secret File
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Footer Bar */}
        <div className="px-5 py-2.5 bg-[#050810] border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isUnlocked ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
              }`}
            />
            <span className="uppercase">
              {isUnlocked
                ? 'CLASSIFIED VAULT UNLOCKED • ZERO LEAKAGE ACTIVE'
                : 'VAULT ENCRYPTED • UNAUTHORIZED ACCESS BLOCKED'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            Close HUD
          </button>
        </div>
      </div>
    </div>
  );
};
