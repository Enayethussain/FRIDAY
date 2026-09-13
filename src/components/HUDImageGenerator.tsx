import React, { useState } from 'react';
import { Camera, Image as ImageIcon, Loader2, X, Download } from 'lucide-react';
import { ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';
import { SoundEffects } from '../utils/SoundEffects';
import { apiUrl } from '../lib/serverUrl';

interface HUDImageGeneratorProps {
  isOpen: boolean;
  theme: ThemeAccent;
  onClose: () => void;
}

export const HUDImageGenerator: React.FC<HUDImageGeneratorProps> = ({ isOpen, theme, onClose }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentTheme = THEMES[theme] || THEMES.cyan;

  if (!isOpen) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedImage(null);
    SoundEffects.playSubtleBeep();

    try {
      const response = await fetch(apiUrl('/api/generate-image'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();

      if (data.success && data.image) {
        setGeneratedImage(data.image);
        SoundEffects.playAccessGranted();
      } else {
        throw new Error(data.error || 'Failed to generate image. You might have exceeded your free API quota.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during generation.');
      SoundEffects.playAccessDenied();
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/80 backdrop-blur-md p-4 animate-in fade-in">
      <div
        className="relative w-full max-w-2xl bg-[#0a0f1d] border rounded-2xl flex flex-col shadow-2xl overflow-hidden"
        style={{
          borderColor: `${currentTheme.primary}44`,
          boxShadow: `0 0 30px ${currentTheme.primary}15`,
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#05070f]/60">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border font-mono"
              style={{
                backgroundColor: `${currentTheme.primary}15`,
                borderColor: `${currentTheme.primary}55`,
                color: currentTheme.primary,
              }}
            >
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-display font-bold text-slate-100 tracking-wider">
                VISION MATRIX SYNTHESIZER
              </h2>
              <p className="text-[10px] font-mono text-slate-400">
                AI Image Generation via Gemini Imagen-3
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <form onSubmit={handleGenerate} className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              disabled={isGenerating}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-500 disabled:opacity-50 transition-colors"
            />
            <button
              type="submit"
              disabled={isGenerating || !prompt.trim()}
              className="px-6 py-2.5 rounded-xl font-bold font-mono text-xs text-[#020617] flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 shadow-lg"
              style={{ backgroundColor: currentTheme.primary }}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>SYNTHESIZING...</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  <span>GENERATE</span>
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="p-3 rounded-lg bg-red-950/50 border border-red-500/50 text-red-400 text-xs font-mono">
              [SYSTEM ERROR] {error}
            </div>
          )}

          <div 
            className="relative w-full aspect-square md:aspect-video rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col items-center justify-center overflow-hidden"
          >
            {generatedImage ? (
              <>
                <img 
                  src={generatedImage} 
                  alt="Generated by FRIDAY" 
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
                <a 
                  href={generatedImage} 
                  download={`friday-vision-${Date.now()}.jpg`}
                  className="absolute bottom-4 right-4 p-2 rounded-lg bg-black/60 backdrop-blur-md border border-white/20 text-white hover:bg-black/80 transition-colors"
                  title="Download Image"
                >
                  <Download className="w-4 h-4" />
                </a>
              </>
            ) : isGenerating ? (
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <div 
                  className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: `${currentTheme.primary}44`, borderTopColor: currentTheme.primary }}
                />
                <span className="text-xs font-mono tracking-widest animate-pulse">RENDERING...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-600">
                <ImageIcon className="w-10 h-10 opacity-50" />
                <span className="text-xs font-mono">AWAITING PROMPT...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
