import React, { useEffect, useRef } from 'react';
import { AssistantState } from '../types';

interface FuturisticBackdropProps {
  state: AssistantState;
  accent: string;
}

interface Particle {
  x: number;
  y: number;
  speed: number;
  size: number;
  twinkle: number;
  twinkleSpeed: number;
}

/**
 * FuturisticBackdrop — canvas starfield + perspective grid + nebula glow.
 * pointer-events-none, sabse peeche. Speaking pe tez, idle pe calm.
 */
export const FuturisticBackdrop: React.FC<FuturisticBackdropProps> = ({ state, accent }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const accentRef = useRef(accent);
  stateRef.current = state;
  accentRef.current = accent;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const DPR = Math.min(1.5, window.devicePixelRatio || 1);
    const particles: Particle[] = [];

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * DPR);
      canvas.height = Math.floor(h * DPR);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const spawn = (): Particle => ({
      x: Math.random() * w,
      y: Math.random() * h,
      speed: 0.08 + Math.random() * 0.35,
      size: 0.4 + Math.random() * 1.6,
      twinkle: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.01 + Math.random() * 0.04,
    });
    const COUNT = w * h > 900000 ? 110 : 70;
    for (let i = 0; i < COUNT; i++) particles.push(spawn());

    const tick = () => {
      const st = stateRef.current;
      const color = accentRef.current;
      const energy = st === 'speaking' ? 2.2 : st === 'listening' ? 1.4 : st === 'connecting' ? 1.8 : 0.7;

      ctx.clearRect(0, 0, w, h);

      // Nebula glows
      const g1 = ctx.createRadialGradient(w * 0.5, h * 0.32, 0, w * 0.5, h * 0.32, Math.max(w, h) * 0.55);
      g1.addColorStop(0, `${color}14`);
      g1.addColorStop(1, 'transparent');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      const g2 = ctx.createRadialGradient(w * 0.85, h * 0.9, 0, w * 0.85, h * 0.9, Math.max(w, h) * 0.4);
      g2.addColorStop(0, `${color}0d`);
      g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      // Particles
      for (const p of particles) {
        p.y -= p.speed * energy;
        p.twinkle += p.twinkleSpeed * energy;
        if (p.y < -4) {
          p.x = Math.random() * w;
          p.y = h + 4;
        }
        const alpha = (0.25 + 0.55 * Math.abs(Math.sin(p.twinkle))) * Math.min(1.2, energy);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/* Perspective grid floor */}
      <div
        className="absolute inset-x-0 bottom-0 h-[34vh] opacity-[0.16]"
        style={{
          backgroundImage: `linear-gradient(${accent}55 1px, transparent 1px), linear-gradient(90deg, ${accent}55 1px, transparent 1px)`,
          backgroundSize: '44px 44px',
          transform: 'perspective(420px) rotateX(58deg) scale(1.6)',
          transformOrigin: 'bottom',
          maskImage: 'linear-gradient(to top, black 30%, transparent 95%)',
          WebkitMaskImage: 'linear-gradient(to top, black 30%, transparent 95%)',
          animation: 'gridDrift 3.2s linear infinite',
        }}
      />
      {/* Horizon glow line */}
      <div
        className="absolute inset-x-0 bottom-[34vh] h-px opacity-40"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, boxShadow: `0 0 18px 2px ${accent}66` }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)' }}
      />
    </div>
  );
};
