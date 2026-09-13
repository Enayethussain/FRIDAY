import React, { useEffect, useRef } from 'react';
import { AssistantState, ThemeAccent } from '../types';
import { THEMES } from '../utils/theme';

interface DynamicWaveformProps {
  analyser: AnalyserNode | null;
  state: AssistantState;
  theme: ThemeAccent;
}

export const DynamicWaveform: React.FC<DynamicWaveformProps> = ({
  analyser,
  state,
  theme,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = container.clientWidth * window.devicePixelRatio);
    let height = (canvas.height = container.clientHeight * window.devicePixelRatio);

    const handleResize = () => {
      if (!canvas || !container) return;
      width = canvas.width = container.clientWidth * window.devicePixelRatio;
      height = canvas.height = container.clientHeight * window.devicePixelRatio;
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);
    const timeDomainArray = new Uint8Array(bufferLength);

    let idlePhase = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const themeConfig = THEMES[theme] || THEMES.cyan;
      const primaryColor = themeConfig.primary;
      const lightColor = themeConfig.primaryLight;

      let volume = 0;

      if (analyser && (state === 'listening' || state === 'speaking')) {
        analyser.getByteFrequencyData(dataArray);
        analyser.getByteTimeDomainData(timeDomainArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        volume = Math.min(1, sum / (bufferLength * 128));
      }

      const centerY = height / 2;
      const barCount = 48;
      const barWidth = (width / barCount) * 0.55;
      const barGap = (width / barCount) * 0.45;

      // Draw Center Horizontal Glow Beam
      ctx.save();
      const beamGrad = ctx.createLinearGradient(0, centerY, width, centerY);
      beamGrad.addColorStop(0, 'transparent');
      beamGrad.addColorStop(0.3, `${primaryColor}22`);
      beamGrad.addColorStop(0.5, `${primaryColor}66`);
      beamGrad.addColorStop(0.7, `${primaryColor}22`);
      beamGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(0, centerY - 1, width, 2);
      ctx.restore();

      // Render Dynamic Equalizer Bars (Symmetrical Top & Bottom)
      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + barGap) + barGap / 2;
        let barHeight = 4;

        if (state === 'disconnected') {
          // Minimal baseline
          barHeight = 3 + Math.sin(idlePhase * 0.02 + i * 0.15) * 2;
        } else if (state === 'connecting') {
          // Pulsing calibration wave
          barHeight = 6 + Math.sin(idlePhase * 0.08 + i * 0.3) * 8;
        } else if (analyser && (state === 'listening' || state === 'speaking')) {
          // Frequency-based mapping with smooth bell curve falloff
          const dataIndex = Math.floor((i / barCount) * (bufferLength * 0.6));
          const val = dataArray[dataIndex] || 0;
          const normalized = val / 255;
          const centerDist = Math.abs(i - barCount / 2) / (barCount / 2);
          const bell = Math.cos(centerDist * (Math.PI / 2));

          const baseScale = state === 'speaking' ? height * 0.45 : height * 0.35;
          barHeight = Math.max(4, normalized * baseScale * Math.max(0.2, bell) + 4);
        } else {
          barHeight = 4;
        }

        // Draw upper and lower bar with rounded caps and gradient glow
        const grad = ctx.createLinearGradient(x, centerY - barHeight, x, centerY + barHeight);
        grad.addColorStop(0, lightColor);
        grad.addColorStop(0.5, primaryColor);
        grad.addColorStop(1, lightColor);

        ctx.fillStyle = grad;
        ctx.shadowColor = primaryColor;
        ctx.shadowBlur = state === 'speaking' ? 14 : 8;

        const radius = barWidth / 2;
        ctx.beginPath();
        // Top cap
        ctx.arc(x + radius, centerY - barHeight + radius, radius, Math.PI, 0, false);
        // Bottom cap
        ctx.arc(x + radius, centerY + barHeight - radius, radius, 0, Math.PI, false);
        ctx.closePath();
        ctx.fill();
      }

      idlePhase++;
      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      resizeObserver.disconnect();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [analyser, state, theme]);

  return (
    <div
      id="waveform-container"
      ref={containerRef}
      className="relative w-full h-28 md:h-36 flex items-center justify-center pointer-events-none"
    >
      <canvas
        id="waveform-canvas"
        ref={canvasRef}
        className="w-full h-full block"
      />
    </div>
  );
};
