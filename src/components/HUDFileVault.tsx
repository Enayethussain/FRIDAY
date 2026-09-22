import React, { useState, useRef } from 'react';
import {
  FileText,
  Upload,
  Trash2,
  X,
  FileCode,
  HardDrive,
  CheckCircle2,
  Search,
  Eye,
  Sparkles,
  FileSpreadsheet,
  FileImage,
  FolderOpen,
} from 'lucide-react';
import { PCFileItem, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface HUDFileVaultProps {
  isOpen: boolean;
  files: PCFileItem[];
  theme: ThemeAccent;
  onClose: () => void;
  onUploadFiles: (files: FileList | File[]) => void;
  onDeleteFile: (id: string) => void;
}

export const HUDFileVault: React.FC<HUDFileVaultProps> = ({
  isOpen,
  files,
  theme,
  onClose,
  onUploadFiles,
  onDeleteFile,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<PCFileItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentTheme = THEMES[theme] || THEMES.amber;

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadFiles(e.target.files);
    }
  };

  const getFileIcon = (ext: string, type: string) => {
    const e = ext.toLowerCase();
    if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c', 'cs', 'go', 'rs', 'html', 'css', 'sql', 'sh'].includes(e)) {
      return <FileCode className="w-5 h-5 text-emerald-400" />;
    }
    if (['csv', 'xlsx', 'xls', 'tsv'].includes(e)) {
      return <FileSpreadsheet className="w-5 h-5 text-amber-400" />;
    }
    if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(e) || type.startsWith('image/')) {
      return <FileImage className="w-5 h-5 text-violet-400" />;
    }
    return <FileText className="w-5 h-5 text-amber-400" />;
  };

  const filteredFiles = files.filter(
    (f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.extension.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.content.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div
      id="file-vault-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="file-vault-modal"
        className="w-full max-w-3xl h-[85vh] sm:h-[80vh] bg-[#090e1b] border border-slate-700/80 rounded-2xl flex flex-col shadow-2xl relative overflow-hidden"
        style={{
          borderColor: `${currentTheme.primary}66`,
          boxShadow: `0 0 50px rgba(0,0,0,0.9), 0 0 30px ${currentTheme.primary}22`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#060a14]">
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl border flex items-center justify-center"
              style={{
                borderColor: `${currentTheme.primary}66`,
                background: `${currentTheme.primary}18`,
                color: currentTheme.primaryLight,
              }}
            >
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-slate-100 text-base sm:text-lg">
                  PC File Vault & Intelligence
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                  {files.length} Files Uplinked
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400">
                Grant FRIDAY direct access to read, analyze, and debug your PC files
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

        {/* Body Content */}
        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
          {/* Left Column: Upload Dropzone & Files List */}
          <div className="flex-1 flex flex-col p-4 border-r border-slate-800/80 overflow-hidden">
            {/* Drag & Drop Upload Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-4 rounded-xl border-2 border-dashed transition-all text-center cursor-pointer mb-3 flex flex-col items-center justify-center gap-1.5 ${
                isDragging
                  ? 'border-amber-400 bg-amber-950/30 shadow-lg scale-[1.01]'
                  : 'border-slate-700/80 hover:border-slate-500 bg-slate-900/40 hover:bg-slate-900/70'
              }`}
              style={{
                borderColor: isDragging ? currentTheme.primary : undefined,
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileInputChange}
                className="hidden"
              />
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center border mb-0.5"
                style={{
                  borderColor: `${currentTheme.primary}55`,
                  background: `${currentTheme.primary}15`,
                  color: currentTheme.primaryLight,
                }}
              >
                <Upload className="w-5 h-5" />
              </div>
              <div className="text-xs font-mono font-semibold text-slate-200">
                Click to browse or drag & drop files from your PC
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                Supports Code (.js, .py, .ts, .cpp), Documents (.txt, .md, .pdf), Spreadsheets, JSON
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search uploaded files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredFiles.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-center text-slate-500 text-xs font-mono">
                  <FolderOpen className="w-8 h-8 mb-2 opacity-40" />
                  <p>No PC files loaded yet.</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Drag files here so FRIDAY can read and discuss them with you.
                  </p>
                </div>
              ) : (
                filteredFiles.map((file) => {
                  const isSelected = selectedFile?.id === file.id;
                  return (
                    <div
                      key={file.id}
                      onClick={() => setSelectedFile(file)}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all cursor-pointer group ${
                        isSelected
                          ? 'bg-slate-800/90 border-amber-500/80 shadow-md'
                          : 'bg-[#0c1322] border-slate-800 hover:bg-slate-800/50 hover:border-slate-700'
                      }`}
                      style={{
                        borderColor: isSelected ? currentTheme.primary : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="shrink-0">{getFileIcon(file.extension, file.type)}</div>
                        <div className="min-w-0">
                          <div className="text-xs font-mono font-bold text-slate-200 truncate">
                            {file.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                            <span>{(file.size / 1024).toFixed(1)} KB</span>
                            <span>•</span>
                            <span className="uppercase">{file.extension || 'FILE'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(file);
                          }}
                          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700/60"
                          title="Preview Content"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFile(file.id);
                            if (selectedFile?.id === file.id) setSelectedFile(null);
                          }}
                          className="p-1 text-slate-500 hover:text-red-400 rounded hover:bg-slate-700/60"
                          title="Remove file"
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

          {/* Right Column: File Content Inspector */}
          <div className="w-full sm:w-80 md:w-96 flex flex-col p-4 bg-[#070b16] overflow-hidden border-t sm:border-t-0 sm:border-l border-slate-800">
            {selectedFile ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                  <div className="min-w-0">
                    <h4 className="text-xs font-mono font-bold text-slate-200 truncate">
                      {selectedFile.name}
                    </h4>
                    <p className="text-[10px] font-mono text-slate-400">
                      {selectedFile.content.length} characters • {selectedFile.type || 'text'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="p-1 text-slate-400 hover:text-white sm:hidden"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Voice Prompt Hint */}
                <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 mb-2 flex items-center gap-2 text-[11px] font-mono text-slate-300">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: currentTheme.primary }} />
                  <span className="truncate">Say: "FRIDAY, what does my {selectedFile.name} say?"</span>
                </div>

                {/* Content Viewer */}
                <div className="flex-1 overflow-auto rounded-lg bg-[#04060d] p-3 border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed select-text">
                  {selectedFile.content || '[Binary or empty file]'}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 p-4">
                <FileCode className="w-10 h-10 mb-2 opacity-30" />
                <h5 className="font-mono text-xs text-slate-300 font-semibold">Inspector Standby</h5>
                <p className="text-[11px] font-mono text-slate-500 mt-1 max-w-xs">
                  Select any file on the left to preview its content or ask FRIDAY to analyze it directly over voice.
                </p>
                <div className="mt-4 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-left text-[11px] font-mono space-y-1 text-slate-400">
                  <div className="text-slate-300 font-bold mb-1">Voice Commands:</div>
                  <div>• "FRIDAY, summarize my document"</div>
                  <div>• "Can you check my python script?"</div>
                  <div>• "What files are in my vault?"</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-[#050811] border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>DIRECT LOCAL PC FILE ACCESS ACTIVE</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg text-xs font-mono font-semibold"
            style={{
              backgroundColor: currentTheme.primary,
              color: '#020617',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
