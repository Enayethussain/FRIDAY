import React, { useState, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { Calendar, Mail, CheckCircle2, XCircle, Loader2, CloudCog } from 'lucide-react';
import { globalWorkspaceManager } from '../services/WorkspaceManager';
import { THEMES } from '../utils/theme';
import { ThemeAccent } from '../types';

interface HUDWorkspaceStatusProps {
  theme: ThemeAccent;
}

export const HUDWorkspaceStatus: React.FC<HUDWorkspaceStatusProps> = ({ theme }) => {
  const currentTheme = THEMES[theme] || THEMES.cyan;
  const [isConnected, setIsConnected] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setIsConnected(globalWorkspaceManager.getToken() !== null);
  }, []);

  const login = useGoogleLogin({
    scope: globalWorkspaceManager.getScopes().join(' '),
    onSuccess: (tokenResponse) => {
      globalWorkspaceManager.setToken(tokenResponse.access_token);
      setIsConnected(true);
    },
    onError: (error) => console.error('OAuth Error:', error),
  });

  const handleDisconnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    globalWorkspaceManager.clearToken();
    setIsConnected(false);
  };

  if (isConnected) {
    return (
      <div 
        className="relative group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border text-[10px] font-mono transition-all bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          title="Google Workspace Linked"
        >
          <CloudCog className="w-3.5 h-3.5" />
          <span className="hidden sm:inline font-bold">WORKSPACE ONLINE</span>
          <CheckCircle2 className="w-3 h-3" />
        </button>
        
        {isHovered && (
          <div className="absolute top-full right-0 mt-2 p-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 flex flex-col gap-2 min-w-[150px] animate-in fade-in">
            <div className="text-[10px] text-slate-400 font-mono text-center">Connected Apps</div>
            <div className="flex items-center gap-2 text-xs text-slate-200">
               <Calendar className="w-3.5 h-3.5 text-blue-400" /> Google Calendar
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-200">
               <Mail className="w-3.5 h-3.5 text-red-400" /> Gmail
            </div>
            <button 
              onClick={handleDisconnect}
              className="mt-1 px-2 py-1 text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 rounded hover:bg-red-500/30"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => login()}
      className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border text-[10px] font-mono transition-all hover:bg-slate-800"
      style={{
        borderColor: `${currentTheme.primary}40`,
        color: currentTheme.primary,
        backgroundColor: `${currentTheme.primary}10`,
      }}
      title="Link Google Workspace"
    >
      <CloudCog className="w-3.5 h-3.5" />
      <span className="hidden sm:inline font-bold">LINK WORKSPACE</span>
    </button>
  );
};
