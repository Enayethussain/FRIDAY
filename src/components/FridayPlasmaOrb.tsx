import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { AssistantState, ThemeAccent } from '../types';

interface FridayPlasmaOrbProps {
  state: AssistantState;
  theme: ThemeAccent;
  onToggle: () => void;
  typingText?: string;
}

interface OrbPreset {
  name: string;
  deep: string;
  mid: string;
  bright: string;
  shell: string;
  particle: string;
}

/** Kam se kam 5 — yahan 6 presets */
export const ORB_PRESETS: OrbPreset[] = [
  { name: 'Cyan', deep: '#001433', mid: '#0084ff', bright: '#00ffe1', shell: '#0066ff', particle: '#ffffff' },
  { name: 'Violet', deep: '#1a0533', mid: '#7c3aed', bright: '#e879f9', shell: '#8b5cf6', particle: '#f5d0fe' },
  { name: 'Magenta', deep: '#2b0a1a', mid: '#db2777', bright: '#f9a8d4', shell: '#ec4899', particle: '#fce7f3' },
  { name: 'Emerald', deep: '#001a14', mid: '#059669', bright: '#6ee7b7', shell: '#10b981', particle: '#d1fae5' },
  { name: 'Amber', deep: '#1c1005', mid: '#d97706', bright: '#fde68a', shell: '#f59e0b', particle: '#fef3c7' },
  { name: 'Crimson', deep: '#1a0505', mid: '#dc2626', bright: '#fca5a5', shell: '#ef4444', particle: '#fee2e2' },
];

const PRESET_KEY = 'friday_orb_preset';

/** FRIDAY theme -> orb preset auto-match */
const THEME_PRESET_MAP: Record<ThemeAccent, number> = {
  cyan: 0,
  violet: 1,
  emerald: 3,
  amber: 4,
  rose: 5,
};

function loadPresetIdx(fallback: number): number {
  try {
    const i = parseInt(localStorage.getItem(PRESET_KEY) || String(fallback), 10);
    if (Number.isFinite(i) && i >= 0 && i < ORB_PRESETS.length) return i;
  } catch {}
  return fallback;
}

/* Tumhare plasma demo ka GLSL noise — same fbm/snoise */
const NOISE_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
float fbm(vec3 p) {
  float total = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 3; i++) {
    total += snoise(p * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return total;
}
`;

/** State -> motion/energy targets (fast rotating) */
function targetsFor(state: AssistantState) {
  switch (state) {
    case 'listening':
      return { rotY: 0.03, rotX: 0.006, timeScale: 2.4, brightness: 1.55, shell: 0.55, pulse: 0.0 };
    case 'speaking':
      return { rotY: 0.05, rotX: 0.01, timeScale: 3.2, brightness: 1.95, shell: 0.7, pulse: 1.0 };
    case 'connecting':
      return { rotY: 0.014, rotX: 0.004, timeScale: 1.3, brightness: 1.15, shell: 0.45, pulse: 0.5 };
    default:
      return { rotY: 0.005, rotX: 0.002, timeScale: 0.7, brightness: 0.95, shell: 0.35, pulse: 0.0 };
  }
}

interface LiveMats {
  plasma: THREE.ShaderMaterial;
  shellFront: THREE.ShaderMaterial;
  particles: THREE.ShaderMaterial;
  light: THREE.PointLight;
}

/**
 * FridayPlasmaOrb — tumhare three.js plasma demo ka FRIDAY port.
 * standby = slow + dim, listening = fast + bright, speaking = fastest + pulse.
 * WebGL fail ho to CSS fallback orb + error text (blank screen kabhi nahi).
 */
export const FridayPlasmaOrb: React.FC<FridayPlasmaOrbProps> = ({ state, theme, onToggle, typingText }) => {
  const themePreset = THEME_PRESET_MAP[theme] ?? 0;
  const mountRef = useRef<HTMLDivElement>(null);
  const matsRef = useRef<LiveMats | null>(null);
  const presetRef = useRef<OrbPreset>(ORB_PRESETS[loadPresetIdx(themePreset)]);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [presetIdx, setPresetIdx] = useState(() => loadPresetIdx(themePreset));
  const [webglError, setWebglError] = useState<string | null>(null);
  const [canvasOk, setCanvasOk] = useState<'starting' | 'ok' | 'fail'>('starting');
  const framedRef = useRef(false);
  const preset = ORB_PRESETS[presetIdx];
  const accent = preset.shell;

  const pickPreset = (i: number) => {
    setPresetIdx(i);
    presetRef.current = ORB_PRESETS[i];
    try { localStorage.setItem(PRESET_KEY, String(i)); } catch {}
    const m = matsRef.current;
    if (m) {
      const p = ORB_PRESETS[i];
      (m.plasma.uniforms.uColorDeep.value as THREE.Color).set(p.deep);
      (m.plasma.uniforms.uColorMid.value as THREE.Color).set(p.mid);
      (m.plasma.uniforms.uColorBright.value as THREE.Color).set(p.bright);
      (m.shellFront.uniforms.uColor.value as THREE.Color).set(p.shell);
      (m.particles.uniforms.uColor.value as THREE.Color).set(p.particle);
      m.light.color.set(p.mid);
    }
  };

  // AUTO-MATCH: FRIDAY theme badalte hi orb color khud match (manual dot tab tak jab tak theme na badle)
  useEffect(() => {
    pickPreset(THEME_PRESET_MAP[theme] ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const defaultLine =
    state === 'disconnected'
      ? 'Hello Commander, I am Friday. Tap the orb to awaken me.'
      : state === 'connecting'
        ? 'Initializing quantum speech channel...'
        : state === 'listening'
          ? 'Friday is listening. Speak, Commander.'
          : 'Friday is speaking. Interrupt anytime.';

  const [typed, setTyped] = useState('');
  useEffect(() => {
    const full = typingText ?? defaultLine;
    let i = 0;
    setTyped('');
    const t = setInterval(() => {
      i++;
      setTyped(full.slice(0, i));
      if (i >= full.length) clearInterval(t);
    }, 35);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typingText, state]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Ancestry diagnosis: kaunsa ancestor 0 hai, ek hi baar me pata chal jayega
    {
      const chain: string[] = [];
      let el: HTMLElement | null = mount;
      for (let i = 0; i < 5 && el; i++) {
        chain.push(`${el.tagName}.${(el.className?.toString() || '').split(' ').slice(0, 3).join('.')}=${el.clientWidth}x${el.clientHeight}`);
        el = el.parentElement;
      }
      console.log('[FridayPlasmaOrb] ancestry:', chain.join(' < '));
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'WebGL unavailable';
      console.error('[FridayPlasmaOrb] WebGL create failed:', msg);
      setWebglError(msg);
      setCanvasOk('fail');
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 2.7;

    // Bulletproof fit: layout late ho ya width 0 ho to har frame retry
    let fitW = 0;
    let fitH = 0;
    const fit = () => {
      let w = mount.clientWidth || mount.parentElement?.clientWidth || 0;
      const h = mount.clientHeight || 300;
      if (w === 0) {
        // Layout collapsed hai — guaranteed fallback taaki sphere DIKHE (diagnosis ke saath-saath)
        w = Math.max(280, Math.min(560, window.innerWidth - 32));
      }
      if (w !== fitW || h !== fitH) {
        fitW = w;
        fitH = h;
        camera.aspect = Math.max(0.01, w / h);
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
      return w;
    };

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    fit(); // pehli sizing turant (0 hua to tick-retry sambhal lega)
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    const p0 = presetRef.current;
    const light = new THREE.PointLight(new THREE.Color(p0.mid), 2.0, 10);
    mainGroup.add(light);

    // --- Shell (fresnel glass, front + back) ---
    const shellVert = `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }`;
    const shellFrag = `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        float fresnel = pow(1.0 - dot(normalize(vNormal), normalize(vViewPosition)), 2.5);
        gl_FragColor = vec4(uColor, fresnel * uOpacity);
      }`;
    const shellGeo = new THREE.SphereGeometry(1.0, 64, 64);
    const shellBackMat = new THREE.ShaderMaterial({
      vertexShader: shellVert, fragmentShader: shellFrag,
      uniforms: { uColor: { value: new THREE.Color(0x000055) }, uOpacity: { value: 0.3 } },
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    });
    const shellFrontMat = new THREE.ShaderMaterial({
      vertexShader: shellVert, fragmentShader: shellFrag,
      uniforms: { uColor: { value: new THREE.Color(p0.shell) }, uOpacity: { value: 0.35 } },
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.FrontSide, depthWrite: false,
    });
    mainGroup.add(new THREE.Mesh(shellGeo, shellBackMat));
    mainGroup.add(new THREE.Mesh(shellGeo, shellFrontMat));

    // --- Plasma (fbm gas) ---
    const plasmaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 0.2 },
        uBrightness: { value: 0.95 },
        uThreshold: { value: 0.09 },
        uColorDeep: { value: new THREE.Color(p0.deep) },
        uColorMid: { value: new THREE.Color(p0.mid) },
        uColorBright: { value: new THREE.Color(p0.bright) },
      },
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vPosition = position;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform float uScale;
        uniform float uBrightness;
        uniform float uThreshold;
        uniform vec3 uColorDeep;
        uniform vec3 uColorMid;
        uniform vec3 uColorBright;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        ${NOISE_GLSL}
        void main() {
          vec3 p = vPosition * uScale;
          vec3 q = vec3(
            fbm(p + vec3(0.0, uTime * 0.05, 0.0)),
            fbm(p + vec3(5.2, 1.3, 2.8) + uTime * 0.05),
            fbm(p + vec3(2.2, 8.4, 0.5) - uTime * 0.02)
          );
          float density = fbm(p + 2.0 * q);
          float t = (density + 0.4) * 0.8;
          float alpha = smoothstep(uThreshold, 0.7, t);
          vec3 cWhite = vec3(1.0, 1.0, 1.0);
          vec3 color = mix(uColorDeep, uColorMid, smoothstep(uThreshold, 0.5, t));
          color = mix(color, uColorBright, smoothstep(0.5, 0.8, t));
          color = mix(color, cWhite, smoothstep(0.8, 1.0, t));
          float facing = dot(normalize(vNormal), normalize(vViewPosition));
          float depthFactor = (facing + 1.0) * 0.5;
          float finalAlpha = alpha * (0.02 + 0.98 * depthFactor);
          gl_FragColor = vec4(color * uBrightness, finalAlpha);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    const plasmaMesh = new THREE.Mesh(new THREE.SphereGeometry(0.998, 96, 96), plasmaMat);
    mainGroup.add(plasmaMesh);

    // --- Particles ---
    const pCount = 500;
    const pPos = new Float32Array(pCount * 3);
    const pSizes = new Float32Array(pCount);
    for (let i = 0; i < pCount; i++) {
      const r = 0.95 * Math.cbrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      pPos[i * 3 + 2] = r * Math.cos(ph);
      pSizes[i] = Math.random();
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSizes, 1));
    const pMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(p0.particle) } },
      vertexShader: `
        uniform float uTime;
        attribute float aSize;
        varying float vAlpha;
        void main() {
          vec3 pos = position;
          pos.y += sin(uTime * 0.2 + pos.x) * 0.02;
          pos.x += cos(uTime * 0.15 + pos.z) * 0.02;
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float baseSize = 8.0 * aSize + 4.0;
          gl_PointSize = baseSize * (1.0 / -mvPosition.z);
          vAlpha = 0.8 + 0.2 * sin(uTime + aSize * 10.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float dist = length(uv);
          if (dist > 0.5) discard;
          float glow = pow(1.0 - dist * 2.0, 1.8);
          gl_FragColor = vec4(uColor, glow * vAlpha);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const particles = new THREE.Points(pGeo, pMat);
    mainGroup.add(particles);

    matsRef.current = { plasma: plasmaMat, shellFront: shellFrontMat, particles: pMat, light };

    // --- Animation loop (targets smooth-lerp hote hain, jhatka nahi) ---
    const timer = new THREE.Timer();
    let raf = 0;
    let cur = { ...targetsFor(stateRef.current) };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      fit(); // width 0 thi to jaise hi layout mile, canvas fix
      timer.update();
      const t = timer.getElapsed();
      const tgt = targetsFor(stateRef.current);
      const k = 0.06;
      cur.rotY += (tgt.rotY - cur.rotY) * k;
      cur.rotX += (tgt.rotX - cur.rotX) * k;
      cur.timeScale += (tgt.timeScale - cur.timeScale) * k;
      cur.brightness += (tgt.brightness - cur.brightness) * k;
      cur.shell += (tgt.shell - cur.shell) * k;
      cur.pulse += (tgt.pulse - cur.pulse) * k;

      plasmaMat.uniforms.uTime.value = t * cur.timeScale;
      plasmaMat.uniforms.uBrightness.value = cur.brightness;
      pMat.uniforms.uTime.value = t;
      shellFrontMat.uniforms.uOpacity.value = cur.shell;

      // speaking/connecting pulse
      const s = 1 + Math.sin(t * 4) * 0.035 * cur.pulse;
      mainGroup.scale.set(s, s, s);

      // speaking me plasma preset ke bright ki taraf white-hot
      const pr = presetRef.current;
      (plasmaMat.uniforms.uColorMid.value as THREE.Color)
        .set(pr.mid)
        .lerp(new THREE.Color(pr.bright), cur.pulse * 0.5);

      plasmaMesh.rotation.y = t * 0.08;
      mainGroup.rotation.x += cur.rotX;
      mainGroup.rotation.y += cur.rotY;
      particles.rotation.y += 0.0015;

      renderer.render(scene, camera);
      if (!framedRef.current) {
        framedRef.current = true;
        setCanvasOk('ok');
        console.log('[FridayPlasmaOrb] first frame rendered OK');
      }
    };
    tick();

    // 4s me ek bhi frame na aaye to fallback dikhao (blank screen kabhi nahi)
    const stallTimer = setTimeout(() => {
      if (!framedRef.current) {
        console.error('[FridayPlasmaOrb] NO FRAMES after 4s — showing fallback');
        setCanvasOk('fail');
        setWebglError('Renderer stalled (no frames)');
      }
    }, 4000);

    const ro = new ResizeObserver(() => {
      fit();
    });
    ro.observe(mount);
    if (mount.parentElement) ro.observe(mount.parentElement);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(stallTimer);
      ro.disconnect();
      matsRef.current = null;
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stateLabel =
    state === 'connecting' ? 'SYNCING' : state === 'speaking' ? 'TALKING' : state === 'listening' ? 'ONLINE' : 'STANDBY';

  return (
    <div className="fpo-root" style={{ ['--fpo-accent' as string]: accent }}>
      <style>{`
        .fpo-root { position: relative; width: 100%; min-width: 100%; flex: 1 1 auto; align-self: stretch; height: 300px; min-height: 300px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: transparent; }
        @media (min-width: 640px) { .fpo-root { height: 360px; min-height: 360px; } }
        .fpo-canvas { position: absolute; inset: 0; width: 100%; height: 100%; min-height: 100%; }
        .fpo-canvas canvas { display: block; width: 100% !important; height: 100% !important; }
        .fpo-aura { position: absolute; width: 260px; height: 260px; border-radius: 50%; pointer-events: none;
          background: radial-gradient(circle, var(--fpo-accent) 0%, transparent 65%);
          opacity: 0.22; filter: blur(10px); animation: fpoFallbackPulse 3s ease-in-out infinite; }
        .fpo-fallback { position: absolute; width: 190px; height: 190px; border-radius: 50%;
          background: radial-gradient(circle, #fff 0%, var(--fpo-accent) 45%, transparent 72%);
          box-shadow: 0 0 60px var(--fpo-accent), 0 0 120px var(--fpo-accent);
          animation: fpoFallbackPulse 2.4s ease-in-out infinite; }
        @keyframes fpoFallbackPulse { 0%,100% { transform: scale(0.96); opacity: 0.85; } 50% { transform: scale(1.05); opacity: 1; } }
        .fpo-err { position: absolute; top: 34px; z-index: 8; font-family: monospace; font-size: 10px; color: #f87171; background: rgba(0,0,0,0.7); padding: 4px 10px; border-radius: 8px; border: 1px solid #ef4444; max-width: 90%; text-align: center; }
        .fpo-hit { position: absolute; inset: 0; z-index: 5; background: transparent; border: none; cursor: pointer; }
        .fpo-colors { position: absolute; top: 6px; right: 8px; z-index: 7; display: flex; gap: 7px; align-items: center; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.12); padding: 6px 9px; border-radius: 20px; backdrop-filter: blur(6px); }
        .fpo-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s; }
        .fpo-dot:hover { transform: scale(1.25); }
        .fpo-dot.on { border-color: #fff; box-shadow: 0 0 10px currentColor; transform: scale(1.15); }
        .fpo-label { position: absolute; bottom: 34px; z-index: 6; font-family: 'Orbitron', sans-serif; font-size: 10px; letter-spacing: 4px; text-indent: 4px; color: var(--fpo-accent); text-shadow: 0 0 12px var(--fpo-accent); pointer-events: none; }
        .fpo-name { position: absolute; bottom: 8px; z-index: 6; font-family: 'Orbitron', sans-serif; font-size: 1.4rem; letter-spacing: 8px; text-indent: 8px; color: #fff; text-shadow: 0 0 10px var(--fpo-accent), 0 0 34px var(--fpo-accent); pointer-events: none; animation: fpoFloat 4s infinite ease-in-out; }
        @keyframes fpoFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .fpo-typing { position: absolute; bottom: -22px; width: 100%; text-align: center; color: rgba(7,216,216,0.85); font-size: 12px; font-family: 'Orbitron', monospace; text-shadow: 0 0 10px rgba(9,162,222,0.7); z-index: 6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 12px; pointer-events: none; }
      `}</style>
      <div className="fpo-aura" />
      <div ref={mountRef} className="fpo-canvas" />
      {(webglError || canvasOk === 'fail') && (
        <>
          <div className="fpo-fallback" />
          <div className="fpo-err">3D OFF ({webglError || 'no frames'}) — ye text mujhe bhejo</div>
        </>
      )}
      {/* Debug badge — inline style taaki hamesha dikhe */}
      <div
        data-testid="friday-orb-debug"
        style={{
          position: 'absolute', bottom: 2, right: 6, zIndex: 9,
          fontFamily: 'monospace', fontSize: 9, color: '#4ade80',
          background: 'rgba(0,0,0,0.65)', padding: '2px 7px', borderRadius: 8,
          border: '1px solid rgba(74,222,128,0.4)', pointerEvents: 'none',
        }}
      >
        ORB:{state}:{preset.name}:canvas-{canvasOk}
      </div>
      <button type="button" className="fpo-hit" onClick={onToggle} aria-label="Toggle Friday voice session" title="Tap the orb to awaken Friday" />
      <div className="fpo-colors" title="Orb color">
        {ORB_PRESETS.map((p, i) => (
          <button
            key={p.name}
            type="button"
            className={`fpo-dot ${i === presetIdx ? 'on' : ''}`}
            style={{ background: p.mid, color: p.mid }}
            title={p.name}
            aria-label={`Orb color ${p.name}`}
            onClick={() => pickPreset(i)}
          />
        ))}
      </div>
      <div className="fpo-label">{stateLabel}</div>
      <div className="fpo-name">FRIDAY</div>
      <div className="fpo-typing">{typed}</div>
    </div>
  );
};
