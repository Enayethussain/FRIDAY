import React from 'react';
import {
  ExternalLink,
  Clock,
  Palette,
  CheckCircle,
  X,
  Youtube,
  CloudSun,
  FileText,
  CheckSquare,
  HardDrive,
} from 'lucide-react';
import { ActionCard, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface HUDActionCardProps {
  card: ActionCard;
  theme: ThemeAccent;
  onDismiss: (id: string) => void;
  onActionClick?: (card: ActionCard) => void;
}

export const HUDActionCard: React.FC<HUDActionCardProps> = ({
  card,
  theme,
  onDismiss,
  onActionClick,
}) => {
  const currentTheme = THEMES[theme] || THEMES.amber;

  const getIcon = () => {
    switch (card.type) {
      case 'youtube':
        return <Youtube className="w-4 h-4 text-red-400" />;
      case 'website':
        return <ExternalLink className="w-4 h-4" />;
      case 'weather':
        return <CloudSun className="w-4 h-4 text-amber-400" />;
      case 'note':
        return <FileText className="w-4 h-4 text-amber-400" />;
      case 'task':
        return <CheckSquare className="w-4 h-4 text-emerald-400" />;
      case 'file':
        return <HardDrive className="w-4 h-4 text-amber-400" />;
      case 'timer':
        return <Clock className="w-4 h-4" />;
      case 'theme':
        return <Palette className="w-4 h-4" />;
      default:
        return <CheckCircle className="w-4 h-4" />;
    }
  };

  return (
    <div
      id={`action-card-${card.id}`}
      className="relative flex items-center justify-between gap-3 px-4 py-3 rounded-xl border bg-[#0d1424]/90 backdrop-blur-xl shadow-2xl transition-all animate-in slide-in-from-bottom-3 duration-300 max-w-sm sm:max-w-md w-full"
      style={{
        borderColor: `${currentTheme.primary}55`,
        boxShadow: `0 8px 30px rgba(0,0,0,0.6), 0 0 20px ${currentTheme.primary}22`,
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
          style={{
            borderColor: `${currentTheme.primary}66`,
            background: `${currentTheme.primary}18`,
            color: currentTheme.primaryLight,
          }}
        >
          {getIcon()}
        </div>

        <div className="min-w-0">
          <div className="text-xs font-mono font-semibold text-slate-100 truncate">
            {card.title}
          </div>
          <div className="text-[11px] font-mono text-slate-400 truncate">
            {card.description}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {card.url && (
          <a
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1 cursor-pointer"
            style={{
              backgroundColor: currentTheme.primary,
              color: '#020617',
            }}
          >
            <span>{card.actionLabel || 'Open'}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}

        <button
          type="button"
          onClick={() => onDismiss(card.id)}
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800/60 transition-colors"
          aria-label="Dismiss action notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
