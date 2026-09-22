import React from 'react';
import { Cloud, CloudRain, Sun, Wind, Droplets, X } from 'lucide-react';
import { ThemeAccent, WeatherInfo } from '../types';
import { THEMES } from '../utils/theme';

interface HUDWeatherWidgetProps {
  weather: WeatherInfo;
  theme: ThemeAccent;
  onClose: () => void;
}

export const HUDWeatherWidget: React.FC<HUDWeatherWidgetProps> = ({
  weather,
  theme,
  onClose,
}) => {
  const currentTheme = THEMES[theme] || THEMES.amber;

  const getWeatherIcon = () => {
    const c = weather.condition.toLowerCase();
    if (c.includes('rain') || c.includes('shower')) return <CloudRain className="w-6 h-6 text-amber-400" />;
    if (c.includes('cloud')) return <Cloud className="w-6 h-6 text-slate-300" />;
    return <Sun className="w-6 h-6 text-amber-400" />;
  };

  return (
    <div
      id="hud-weather-widget"
      className="relative w-full max-w-sm p-4 rounded-2xl border bg-[#0b1222]/90 backdrop-blur-xl shadow-2xl animate-in zoom-in-95 duration-200"
      style={{
        borderColor: `${currentTheme.primary}66`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.8), 0 0 20px ${currentTheme.primary}22`,
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] font-mono tracking-widest uppercase text-slate-400">
            METEOROLOGICAL SENSOR
          </span>
          <h4 className="text-base font-display font-bold text-slate-100 truncate">
            {weather.location}
          </h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center border"
            style={{
              borderColor: `${currentTheme.primary}44`,
              background: `${currentTheme.primary}15`,
            }}
          >
            {getWeatherIcon()}
          </div>
          <div>
            <div className="text-2xl font-mono font-bold text-slate-100">
              {weather.temperature}°C
            </div>
            <div className="text-xs font-mono text-slate-300">
              {weather.condition}
            </div>
          </div>
        </div>

        {weather.high !== undefined && weather.low !== undefined && (
          <div className="text-right text-xs font-mono text-slate-400">
            <div>H: {weather.high}°C</div>
            <div>L: {weather.low}°C</div>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
        {weather.humidity !== undefined && (
          <div className="flex items-center gap-1">
            <Droplets className="w-3.5 h-3.5 text-amber-400" />
            <span>{weather.humidity}% Humidity</span>
          </div>
        )}
        {weather.windSpeed !== undefined && (
          <div className="flex items-center gap-1">
            <Wind className="w-3.5 h-3.5 text-slate-400" />
            <span>{weather.windSpeed} km/h Wind</span>
          </div>
        )}
      </div>
    </div>
  );
};
