import React, { useState } from 'react';
import { Globe, X, Check, Sparkles, Volume2, Search } from 'lucide-react';
import { SupportedLanguage, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface HUDLanguageMatrixProps {
  isOpen: boolean;
  theme: ThemeAccent;
  activeLanguage: string;
  onSelectLanguage: (code: string) => void;
  onClose: () => void;
}

const WORLD_LANGUAGES: SupportedLanguage[] = [
  { code: 'auto', name: 'Auto Detect (Omniglot)', nativeName: 'Universal Auto-Detection', flag: '🌐' },
  { code: 'en', name: 'English', nativeName: 'English (US/UK/Global)', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'zh', name: 'Chinese (Mandarin)', nativeName: '中文 (普通话)', flag: '🇨🇳' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇧🇩' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', flag: '🇵🇰' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
  { code: 'fa', name: 'Persian / Farsi', nativeName: 'فارسی', flag: '🇮🇷' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: '🇸🇪' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: '🇮🇱' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', flag: '🇰🇪' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
  { code: 'tl', name: 'Tagalog / Filipino', nativeName: 'Tagalog', flag: '🇵🇭' },
];

export const HUDLanguageMatrix: React.FC<HUDLanguageMatrixProps> = ({
  isOpen,
  theme,
  activeLanguage,
  onSelectLanguage,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const currentTheme = THEMES[theme] || THEMES.cyan;

  if (!isOpen) return null;

  const filtered = WORLD_LANGUAGES.filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.nativeName.toLowerCase().includes(search.toLowerCase()) ||
      l.code.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div
      id="language-matrix-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="language-matrix-modal"
        className="w-full max-w-2xl max-h-[85vh] bg-[#090e1b] border border-slate-700/80 rounded-2xl flex flex-col shadow-2xl relative overflow-hidden"
        style={{
          borderColor: `${currentTheme.primary}66`,
          boxShadow: `0 0 50px rgba(0,0,0,0.9), 0 0 30px ${currentTheme.primary}22`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
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
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-slate-100 text-base sm:text-lg">
                  Omniglot Multilingual Matrix
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/60 text-emerald-300">
                  ALL LANGUAGES ACTIVE
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400">
                FRIDAY understands and speaks every world language with real-time adaptation
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

        {/* Info Banner */}
        <div className="px-5 py-3 bg-[#0d1424]/60 border-b border-slate-800/80 flex items-center gap-2.5 text-xs font-mono text-slate-300">
          <Sparkles className="w-4 h-4 shrink-0" style={{ color: currentTheme.primary }} />
          <span>
            No switching needed! Just speak in <strong>Spanish, French, Hindi, Bengali, Arabic, Japanese, or any language</strong> and FRIDAY will instantly reply in kind.
          </span>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-slate-800/60">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search world languages (e.g. Spanish, Bengali, Hindi, Japanese)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Grid of Languages */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map((lang) => {
            const isSelected = activeLanguage === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => onSelectLanguage(lang.code)}
                className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800/90 border-cyan-500 shadow-md'
                    : 'bg-[#0c1322] border-slate-800 hover:bg-slate-800/40 hover:border-slate-700'
                }`}
                style={{
                  borderColor: isSelected ? currentTheme.primary : undefined,
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xl shrink-0">{lang.flag}</span>
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-xs text-slate-200 truncate">
                      {lang.name}
                    </div>
                    <div className="text-[11px] font-sans text-slate-400 truncate">
                      {lang.nativeName}
                    </div>
                  </div>
                </div>

                {isSelected ? (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-slate-950 shrink-0 ml-2"
                    style={{ backgroundColor: currentTheme.primary }}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                ) : (
                  <span className="text-[10px] font-mono text-slate-500 shrink-0 uppercase">
                    {lang.code}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bottom */}
        <div className="px-5 py-3 bg-[#060a14] border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Supported: 100+ Global Languages & Dialects</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-mono font-semibold"
            style={{
              backgroundColor: currentTheme.primary,
              color: '#020617',
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
