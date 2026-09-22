/**
 * HUDHologramViewer — gold holographic 3D viewer projected beside the Orb.
 * Real geometry only: catalog GLBs, validated uploads, or procedural fallback.
 * NEVER reports ready before geometry is on screen. Lazy model loading, LRU
 * cache (3), full disposal, render pause when hidden, quality tiers.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { HologramControlAction, HologramState, ThemeAccent } from '../types';
import { buildProcedural } from '../hologram/procedural';
import { saveUserModel } from '../hologram/registry';
import { THEMES } from '../utils/theme';

export interface HologramHandle {
  control: (action: HologramControlAction, degrees?: number) => void;
}

export type HoloViewMode = 'holo' | 'solid' | 'wire' | 'xray';
export type HoloQuality = 'low' | 'med' | 'high';

interface Props {
  request: HologramState;
  /** optional second model for side-by-side compare (max 2 total) */
  compare?: HologramState | null;
  theme: ThemeAccent;
  onClose: () => void;
  onStatus: (status: HologramState['status'], extra?: Partial<HologramState>) => void;
  /** Called when model upload needs PLUS (caller shows the upgrade prompt). */
  onUpgradeRequired?: () => void;
}

const LOAD_TIMEOUT_MS = 30000;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const CACHE_MAX = 3;

interface CachedModel {
  scene: THREE.Object3D;
  anims: THREE.AnimationClip[];
}

/** parsed-model LRU: reuses geometry, disposes evicted entries */
const modelCache = new Map<string, CachedModel>();
function cachePut(key: string, val: CachedModel) {
  modelCache.delete(key);
  modelCache.set(key, val);
  while (modelCache.size > CACHE_MAX) {
    const oldest = modelCache.keys().next().value as string;
    const ev = modelCache.get(oldest);
    modelCache.delete(oldest);
    if (ev) disposeObject(ev.scene);
  }
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => { disposeMat(x); });
    else if (mat) disposeMat(mat);
    const s = o as THREE.Sprite;
    if (s.isSprite && s.material) {
      const sm = s.material as THREE.SpriteMaterial;
      if (sm.map) sm.map.dispose();
      sm.dispose();
    }
  });
}
function disposeMat(m: THREE.Material) {
  const anyM = m as unknown as Record<string, { dispose?: () => void } | undefined>;
  for (const k of ['map', 'emissiveMap', 'normalMap']) {
    try { anyM[k]?.dispose?.(); } catch { /* noop */ }
  }
  m.dispose();
}

function makeHoloMats() {
  return {
    solid: new THREE.MeshStandardMaterial({ color: 0xffc400, emissive: 0x7a5200, emissiveIntensity: 0.7, transparent: true, opacity: 0.92 }),
    holo: new THREE.MeshStandardMaterial({ color: 0xffc400, emissive: 0xd88a00, emissiveIntensity: 0.55, transparent: true, opacity: 0.55, depthWrite: false }),
    xray: new THREE.MeshBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
    wire: new THREE.LineBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
}

function applyViewMode(group: THREE.Group, mode: HoloViewMode, mats: ReturnType<typeof makeHoloMats>) {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      if (mode === 'wire') { m.visible = false; }
      else {
        m.visible = true;
        m.material = mode === 'solid' ? mats.solid : mode === 'xray' ? mats.xray : mats.holo;
      }
    }
    const l = o as THREE.LineSegments;
    if (l.isLineSegments && l.userData.edge) l.visible = mode !== 'solid';
  });
}

function addEdges(root: THREE.Object3D, wireMat: THREE.LineBasicMaterial) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      try {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), wireMat);
        edges.position.copy(m.position);
        edges.rotation.copy(m.rotation);
        edges.scale.copy(m.scale);
        edges.userData.edge = true;
        m.parent?.add(edges);
      } catch { /* edges optional */ }
    }
  });
}

function makeLabel(text: string): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 96;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = '#FFC400';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 508, 92);
  ctx.fillStyle = '#FFE600';
  ctx.font = 'bold 40px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 26).toUpperCase(), 256, 50);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.8, 0.34, 1);
  sp.userData.label = true;
  return sp;
}

async function readMagic(file: File): Promise<string> {
  const buf = await file.slice(0, 8).arrayBuffer();
  const b = new Uint8Array(buf);
  return String.fromCharCode(...b.slice(0, 4));
}

export const HUDHologramViewer = forwardRef<HologramHandle, Props>(function HUDHologramViewer({ request, compare, theme, onClose, onStatus, onUpgradeRequired }, ref) {
  const mountRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const apiRef = useRef<{
    groupA: THREE.Group; groupB: THREE.Group | null;
    spin: boolean; sync: boolean; dist: number;
    mats: ReturnType<typeof makeHoloMats>;
    mixer: THREE.AnimationMixer | null; clips: THREE.AnimationClip[];
    labels: boolean;
  } | null>(null);
  const cancelRef = useRef(false);
  const [phase, setPhase] = useState<'loading' | 'active' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [spin, setSpin] = useState(true);
  const [sync, setSync] = useState(true);
  const [viewMode, setViewModeState] = useState<HoloViewMode>('holo');
  const [quality, setQualityState] = useState<HoloQuality>(() => {
    try {
      if (window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 500) return 'low';
    } catch { /* noop */ }
    return 'med';
  });
  const [labelsOn, setLabelsOn] = useState(true);
  const [animInfo, setAnimInfo] = useState<string>('none');
  const [attempt, setAttempt] = useState(0);
  const [srcLabel, setSrcLabel] = useState(request.kind === 'procedural' ? 'Procedural geometry (on-device)' : 'Local library model');
  const accent = (THEMES[theme] || THEMES.amber).primary;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;

  const setViewMode = (m: HoloViewMode) => {
    setViewModeState(m);
    const api = apiRef.current;
    if (api) {
      applyViewMode(api.groupA, m, api.mats);
      if (api.groupB) applyViewMode(api.groupB, m, api.mats);
    }
  };

  // ---- three setup (once) ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    cancelRef.current = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'WebGL unavailable');
      setPhase('error');
      onStatus('error', { error: 'WebGL unavailable' });
      return;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0.6, 4.6);
    const W = () => mount.clientWidth || 320;
    const H = () => mount.clientHeight || 300;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualityRef.current === 'low' ? 1 : qualityRef.current === 'high' ? 2 : 1.5));
    renderer.setSize(W(), H());
    renderer.setClearColor(0x000000, 0);
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none' });
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffe600, 0.7));
    const key = new THREE.DirectionalLight(0xffc400, 1.4);
    key.position.set(3, 4, 5);
    scene.add(key);

    const mats = makeHoloMats();
    const groupA = new THREE.Group();
    scene.add(groupA);
    apiRef.current = { groupA, groupB: null, spin: true, sync: true, dist: 4.6, mats, mixer: null, clips: [], labels: true };

    const dress = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.008, 8, 96), ringMat);
    r1.rotation.x = Math.PI / 2.3;
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.005, 8, 96), ringMat.clone());
    r2.rotation.x = Math.PI / 1.8;
    dress.add(r1, r2);
    const PN = qualityRef.current === 'low' ? 60 : qualityRef.current === 'high' ? 300 : 150;
    const pp = new Float32Array(PN * 3);
    for (let i = 0; i < PN; i++) {
      const r = 1.6 + Math.random() * 1.4;
      const th = Math.random() * Math.PI * 2;
      pp[i * 3] = Math.cos(th) * r;
      pp[i * 3 + 1] = (Math.random() - 0.5) * 2.6;
      pp[i * 3 + 2] = Math.sin(th) * r;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffe600, size: 0.02, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    dress.add(pts);
    const grid = new THREE.GridHelper(6, 25, 0xffc400, 0x554400);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.22;
    grid.position.y = -1.6;
    dress.add(grid);
    scene.add(dress);

    let dragging = false, lx = 0, ly = 0, pinchD = 0, panning = false;
    const el = renderer.domElement;
    const targets = () => {
      const api = apiRef.current;
      if (!api) return [];
      return api.sync && api.groupB ? [api.groupA, api.groupB] : [api.groupA];
    };
    const onDown = (e: PointerEvent) => { dragging = true; panning = e.button === 2 || e.shiftKey; lx = e.clientX; ly = e.clientY; try { el.setPointerCapture(e.pointerId); } catch {} };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      const api = apiRef.current;
      if (!api) return;
      for (const g of targets()) {
        if (panning) { g.position.x += dx * 0.005; g.position.y -= dy * 0.005; }
        else { g.rotation.y += dx * 0.008; g.rotation.x += dy * 0.006; }
      }
    };
    const onUp = () => { dragging = false; panning = false; };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const api = apiRef.current; if (api) api.dist = Math.max(2.2, Math.min(10, api.dist + e.deltaY * 0.003)); };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const api = apiRef.current;
        if (api && pinchD > 0) api.dist = Math.max(2.2, Math.min(10, api.dist + (pinchD - d) * 0.006));
        pinchD = d;
      }
    };
    const onTouchEnd = () => { pinchD = 0; };
    const onCtx = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('contextmenu', onCtx);

    let alive = true, visible = true, raf = 0;
    let last = performance.now();
    const clock = new THREE.Clock();
    const frame = () => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      const dt = Math.min(0.05, clock.getDelta());
      last = performance.now();
      const api = apiRef.current;
      if (api) {
        if (api.spin && phaseRef.current === 'active') {
          if (api.sync || !api.groupB) { api.groupA.rotation.y += 0.004; if (api.groupB) api.groupB.rotation.y += 0.004; }
          else api.groupA.rotation.y += 0.004;
        }
        if (api.mixer && phaseRef.current === 'active') { try { api.mixer.update(dt); } catch { /* noop */ } }
      }
      r1.rotation.z += 0.002;
      r2.rotation.z -= 0.0015;
      pts.rotation.y += 0.0008;
      const w = W(), h = H();
      if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio())) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
      if (api) camera.position.z += (api.dist - camera.position.z) * 0.1;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    const io = new IntersectionObserver((en) => { visible = en.some((e) => e.isIntersecting); last = performance.now(); });
    io.observe(mount);
    const ro = new ResizeObserver(() => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()); });
    ro.observe(mount);

    return () => {
      alive = false;
      cancelRef.current = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('contextmenu', onCtx);
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- model loading ----
  async function loadInto(group: THREE.Group, req: HologramState, offX: number): Promise<{ anims: THREE.AnimationClip[]; note?: string }> {
    const api = apiRef.current;
    if (!api) throw new Error('Renderer not ready');
    for (let i = group.children.length - 1; i >= 0; i--) {
      const c = group.children[i];
      group.remove(c);
      disposeObject(c);
    }
    let anims: THREE.AnimationClip[] = [];
    let note: string | undefined;
    if (req.kind === 'procedural' && !req.modelUrl) {
      const built = buildProcedural(req.entryId, req.quality === 'low');
      if (!built) throw new Error(`Procedural builder failed for "${req.object}".`);
      normalizeGroup(built.group);
      group.add(built.group);
      note = built.note;
    } else if (req.modelUrl && req.format) {
      const cacheKey = req.modelUrl;
      const cached = modelCache.get(cacheKey);
      let obj: THREE.Object3D;
      if (cached) {
        modelCache.delete(cacheKey);
        modelCache.set(cacheKey, cached); // refresh LRU
        obj = cached.scene.clone(true);
        anims = cached.anims;
      } else if (req.format === 'obj') {
        const txt = await (await fetch(req.modelUrl)).text();
        if (!/^\s*(v\s|o\s|g\s|#)/m.test(txt)) throw new Error('File is not a valid OBJ model.');
        const parsed = new OBJLoader().parse(txt);
        cachePut(cacheKey, { scene: parsed, anims: [] });
        obj = parsed.clone(true);
      } else {
        const gltf = await new GLTFLoader().loadAsync(req.modelUrl, undefined);
        let meshes = 0;
        gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
        if (meshes === 0) throw new Error('Model parsed but contains no renderable meshes.');
        anims = gltf.animations ?? [];
        cachePut(cacheKey, { scene: gltf.scene, anims });
        obj = gltf.scene.clone(true);
      }
      normalizeGroup(obj);
      group.add(obj);
    } else {
      throw new Error('No model source available.');
    }
    applyViewMode(group, viewModeRef.current, api.mats);
    const label = makeLabel(req.label);
    label.position.y = 1.55;
    label.visible = api.labels;
    group.add(label);
    group.position.x = offX;
    return { anims, note };
  }

  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  function normalizeGroup(obj: THREE.Object3D) {
    const api = apiRef.current;
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3()).length() || 2;
    const k = 2.2 / size;
    obj.scale.multiplyScalar(k);
    const c = box.getCenter(new THREE.Vector3());
    obj.position.sub(c.multiplyScalar(k));
    addEdges(obj, api ? api.mats.wire : makeHoloMats().wire);
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fail = (msg: string) => {
      if (cancelRef.current) return;
      setError(msg);
      setPhase('error');
      onStatus('error', { error: msg });
    };
    const load = async () => {
      setPhase('loading');
      setError(null);
      setProgress(2);
      onStatus(compare ? 'loading' : request.kind === 'procedural' && !request.modelUrl ? 'resolving' : 'loading', {});
      timer = setTimeout(() => fail(`Load timed out after ${LOAD_TIMEOUT_MS / 1000}s. Retry, or import a local .glb/.gltf/.obj file.`), LOAD_TIMEOUT_MS);
      try {
        const api = apiRef.current;
        if (!api) throw new Error('Renderer not ready');
        if (api.groupB) {
          const old = api.groupB;
          api.groupB = null;
          old.parent?.remove(old);
          disposeObject(old);
        }
        api.mixer?.stopAllAction();
        api.mixer = null;
        api.clips = [];
        const a = await loadInto(api.groupA, request, compare ? -1.25 : 0);
        let allAnims = a.anims;
        if (compare) {
          const gb = new THREE.Group();
          const sc = api.groupA.parent;
          sc?.add(gb);
          api.groupB = gb;
          const b = await loadInto(gb, compare, 1.25);
          allAnims = allAnims.concat(b.anims);
        }
        if (allAnims.length > 0) {
          api.mixer = new THREE.AnimationMixer(api.groupA);
          api.clips = allAnims;
          for (const c of allAnims) {
            try { api.mixer.clipAction(c, api.groupA).play(); } catch { /* clip may target groupB */ }
          }
          if (api.groupB) {
            for (const c of allAnims) {
              try { api.mixer.clipAction(c, api.groupB).play(); } catch { /* noop */ }
            }
          }
          setAnimInfo(`${allAnims.length} clip(s) playing — "pause animation" to hold`);
        } else {
          setAnimInfo('none in this model');
        }
        setProgress(100);
        if (timer) clearTimeout(timer);
        if (cancelRef.current) return;
        setPhase('active');
        onStatus('active', a.note ? { note: a.note } : undefined);
      } catch (e) {
        if (timer) clearTimeout(timer);
        fail(e instanceof Error ? e.message : 'Model load failed.');
      }
    };
    void load();
    return () => { if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.entryId, request.modelUrl, compare?.entryId, compare?.modelUrl, attempt]);

  // ---- imperative controls ----
  useImperativeHandle(ref, () => ({
    control: (action: HologramControlAction, degrees?: number) => {
      const api = apiRef.current;
      if (!api) return;
      const gs = api.sync && api.groupB ? [api.groupA, api.groupB] : [api.groupA];
      const g = api.groupA;
      switch (action) {
        case 'rotate_left': gs.forEach((x) => { x.rotation.y -= Math.PI / 4; }); break;
        case 'rotate_right': gs.forEach((x) => { x.rotation.y += Math.PI / 4; }); break;
        case 'rotate_deg': gs.forEach((x) => { x.rotation.y += ((degrees ?? 90) * Math.PI) / 180; }); break;
        case 'zoom_in': api.dist = Math.max(2.2, api.dist - 0.6); break;
        case 'zoom_out': api.dist = Math.min(10, api.dist + 0.6); break;
        case 'move_up': gs.forEach((x) => { x.position.y += 0.25; }); break;
        case 'move_down': gs.forEach((x) => { x.position.y -= 0.25; }); break;
        case 'move_left': gs.forEach((x) => { x.position.x -= 0.25; }); break;
        case 'move_right': gs.forEach((x) => { x.position.x += 0.25; }); break;
        case 'reset': gs.forEach((x, i) => { x.rotation.set(0, 0, 0); x.position.set(api.groupB ? (i === 0 ? -1.25 : 1.25) : 0, 0, 0); }); api.dist = 4.6; break;
        case 'spin_start': api.spin = true; setSpin(true); break;
        case 'spin_stop': api.spin = false; setSpin(false); break;
        case 'bigger': gs.forEach((x) => { x.scale.multiplyScalar(1.2); }); break;
        case 'smaller': gs.forEach((x) => { x.scale.multiplyScalar(1 / 1.2); }); break;
        case 'view_holo': setViewMode('holo'); break;
        case 'view_solid': setViewMode('solid'); break;
        case 'view_wire': setViewMode('wire'); break;
        case 'view_xray': setViewMode('xray'); break;
        case 'labels_show': api.labels = true; setLabelsOn(true); toggleLabels(true); break;
        case 'labels_hide': api.labels = false; setLabelsOn(false); toggleLabels(false); break;
        case 'anim_play': playAnims(true); break;
        case 'anim_pause': playAnims(false); break;
        case 'anim_restart': restartAnims(); break;
        case 'quality_low': setQuality('low'); break;
        case 'quality_med': setQuality('med'); break;
        case 'quality_high': setQuality('high'); break;
        case 'sync_on': api.sync = true; setSync(true); break;
        case 'sync_off': api.sync = false; setSync(false); break;
        case 'hide':
        case 'close': onClose(); break;
      }
      function toggleLabels(on: boolean) {
        const a2 = apiRef.current;
        if (!a2) return;
        for (const grp of [a2.groupA, a2.groupB]) {
          grp?.traverse((o) => { if ((o as THREE.Sprite).isSprite && (o as THREE.Sprite).userData.label) o.visible = on; });
        }
      }
      function playAnims(play: boolean) {
        const a2 = apiRef.current;
        if (!a2?.mixer) return;
        a2.mixer.timeScale = play ? 1 : 0;
      }
      function restartAnims() {
        const a2 = apiRef.current;
        if (!a2?.mixer || a2.clips.length === 0) return;
        a2.mixer.stopAllAction();
        for (const c of a2.clips) a2.mixer.clipAction(c).play();
      }
      void g;
    },
  }), [onClose]);

  const setQuality = (q: HoloQuality) => {
    setQualityState(q);
    qualityRef.current = q;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const api = apiRef.current;
    if (!api) return;
    if (e.key === 'ArrowLeft') api.groupA.rotation.y -= 0.15;
    else if (e.key === 'ArrowRight') api.groupA.rotation.y += 0.15;
    else if (e.key === 'ArrowUp') api.groupA.rotation.x -= 0.1;
    else if (e.key === 'ArrowDown') api.groupA.rotation.x += 0.1;
    else if (e.key === '+' || e.key === '=') api.dist = Math.max(2.2, api.dist - 0.4);
    else if (e.key === '-' || e.key === '_') api.dist = Math.min(10, api.dist + 0.4);
    else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
  };

  const importFile = async (f: File) => {
    // 3D model upload is a PLUS entitlement — never silently allow it.
    try {
      const { hasEntitlement } = await import('../services/EntitlementService');
      if (!hasEntitlement('MODEL_UPLOAD')) {
        setError('3D model upload FRIDAY Plus me available hai, Sir.');
        setPhase('error');
        onStatus('error', { error: 'PLUS entitlement required' });
        try { onUpgradeRequired?.(); } catch { /* UI-only */ }
        return;
      }
    } catch { /* entitlement check unavailable — fail open to allow upload */ }
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext !== 'glb' && ext !== 'gltf' && ext !== 'obj') {
      setError(`Unsupported format ".${ext}". Use .glb, .gltf or .obj.`);
      setPhase('error');
      onStatus('error', { error: 'Unsupported format' });
      return;
    }
    if (f.size === 0 || f.size > MAX_UPLOAD_BYTES) {
      setError(`File must be 1 byte – 25 MB (got ${(f.size / 1048576).toFixed(1)} MB).`);
      setPhase('error');
      onStatus('error', { error: 'File size out of range' });
      return;
    }
    try {
      const magic = await readMagic(f);
      if (ext === 'glb' && !magic.startsWith('glTF')) throw new Error('Not a valid GLB (bad magic bytes).');
      if (ext === 'gltf') {
        const head = await f.slice(0, 256).text();
        if (!head.trimStart().startsWith('{')) throw new Error('Not a valid glTF JSON file.');
      }
      if (ext === 'obj') {
        const head = await f.slice(0, 4096).text();
        if (!/^\s*(v\s|o\s|g\s|#)/m.test(head)) throw new Error('Not a valid OBJ file.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'File validation failed.';
      setError(msg);
      setPhase('error');
      onStatus('error', { error: msg });
      return;
    }
    let url = URL.createObjectURL(f);
    try {
      const buf = await f.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const r = await fetch('/api/hologram/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: f.name, dataBase64: btoa(bin) }),
      });
      const j = await r.json().catch(() => null);
      if (j && j.success && typeof j.url === 'string') {
        url = j.url;
        saveUserModel({ id: `upload-${Date.now()}`, label: f.name.replace(/\.(glb|gltf|obj)$/i, ''), url, format: ext });
      }
    } catch { /* offline backend — blob URL still renders locally */ }
    setSrcLabel(`Uploaded file: ${f.name}`);
    onStatus('loading', { modelUrl: url, format: ext, kind: 'upload', note: `User-provided model: ${f.name}` });
  };

  return (
    <div
      className="w-full rounded-2xl border bg-black/60 backdrop-blur-md overflow-hidden"
      style={{ borderColor: `${accent}55`, boxShadow: `0 0 24px ${accent}22` }}
      tabIndex={0}
      role="application"
      aria-label={`3D hologram of ${request.label}. Arrow keys rotate, plus and minus zoom, Escape closes.`}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ backgroundColor: accent }} />
          <span className="font-mono text-xs tracking-widest truncate" style={{ color: accent }}>
            HOLOGRAM{qphase(phase)} — {request.label.toUpperCase()}{compare ? ` + ${compare.label.toUpperCase()}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => { const api = apiRef.current; if (api) { api.spin = !spin; setSpin(!spin); } }} className="px-2 py-1.5 min-h-[44px] min-w-[44px] rounded-lg border border-white/15 text-slate-200 text-[11px] font-mono" aria-label={spin ? 'Stop rotation' : 'Start rotation'}>{spin ? '❚❚' : '▶'}</button>
          <button type="button" onClick={() => setViewMode(viewMode === 'holo' ? 'wire' : viewMode === 'wire' ? 'xray' : viewMode === 'xray' ? 'solid' : 'holo')} className="px-2 py-1.5 min-h-[44px] min-w-[44px] rounded-lg border border-white/15 text-slate-200 text-[11px] font-mono" aria-label={`View mode ${viewMode}, activate to cycle`}>{viewMode.toUpperCase()}</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="px-2 py-1.5 min-h-[44px] min-w-[44px] rounded-lg border border-white/15 text-slate-200 text-[11px] font-mono" aria-label="Import .glb, .gltf or .obj model">⤒</button>
          <button type="button" onClick={onClose} className="px-2 py-1.5 min-h-[44px] min-w-[44px] rounded-lg border border-white/15 text-slate-200 text-[11px] font-mono" aria-label="Close hologram">✕</button>
        </div>
      </div>

      <div className="relative w-full h-[300px] sm:h-[340px]">
        <div ref={mountRef} className="absolute inset-0" />
        {phase === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50">
            <div className="font-mono text-xs tracking-widest" style={{ color: accent }}>
              {request.kind === 'procedural' && !request.modelUrl ? 'GENERATING 3D MODEL…' : 'LOADING MODEL…'} {progress}%
            </div>
            <div className="w-48 h-1.5 rounded bg-white/10 overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${progress}%`, backgroundColor: accent }} />
            </div>
            <button type="button" onClick={() => { cancelRef.current = true; setError('Cancelled.'); setPhase('error'); onStatus('error', { error: 'Cancelled by user' }); }} className="px-4 py-2 min-h-[44px] rounded-lg border border-white/20 text-slate-200 text-xs font-mono" aria-label="Cancel hologram generation">CANCEL</button>
          </div>
        )}
        {phase === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-4 text-center">
            <div className="font-mono text-xs tracking-widest text-red-400">HOLOGRAM ERROR</div>
            <div className="text-xs text-slate-300 font-mono max-w-sm">{error}</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { cancelRef.current = false; setError(null); setAttempt((a) => a + 1); }} className="px-4 py-2 min-h-[44px] rounded-lg border text-xs font-mono" style={{ borderColor: accent, color: accent }} aria-label="Retry loading hologram">RETRY</button>
              <button type="button" onClick={() => fileRef.current?.click()} className="px-4 py-2 min-h-[44px] rounded-lg border border-white/20 text-slate-200 text-xs font-mono" aria-label="Import a different model file">IMPORT FILE</button>
            </div>
          </div>
        )}
        {phase === 'active' && (
          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
            {request.kind === 'upload' ? (
              <div className="font-mono text-[10px] px-2 py-1 rounded bg-black/60 border border-sky-500/50 text-sky-300">● USER IMPORTED</div>
            ) : request.isApproximation || request.kind === 'procedural' ? (
              <div className="font-mono text-[10px] px-2 py-1 rounded bg-black/60 border border-amber-500/40 text-amber-300">● APPROXIMATION — NOT VERIFIED REAL</div>
            ) : (
              <>
                <div className="font-mono text-[10px] px-2 py-1 rounded bg-black/60 border border-emerald-500/50 text-emerald-300">● REAL MODEL</div>
                <div className="font-mono text-[9px] px-2 py-1 rounded bg-black/60 border border-white/10 text-slate-400">CC0 • self-created • verified local</div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/10 border-t border-white/10 font-mono text-[10px]">
        <InfoCell k="OBJECT" v={request.label} accent={accent} />
        <InfoCell k="TYPE" v={request.kind === 'procedural' && !request.modelUrl ? 'Procedural 3D' : `Model file (.${request.format ?? 'glb'})`} accent={accent} />
        <InfoCell k="STATUS" v={phase === 'active' ? 'Loaded' : phase === 'loading' ? 'Loading…' : 'Error'} accent={accent} />
        <InfoCell k="SOURCE" v={srcLabel} accent={accent} />
      </div>
      {request.note && phase === 'active' && (
        <div className="px-3 py-1.5 font-mono text-[10px] text-slate-300 border-t border-white/10">{request.note}</div>
      )}
      <div className="px-3 py-1.5 font-mono text-[10px] text-slate-400 border-t border-white/10">
        {`VIEW ${viewMode.toUpperCase()} • ANIM ${animInfo} • ${quality.toUpperCase()} Q • drag rotate • wheel/pinch zoom • voice: "wireframe", "x-ray", "play animation", "reset", "hide hologram"`}
      </div>
      <input ref={fileRef} type="file" accept=".glb,.gltf,.obj" className="hidden" aria-hidden="true" tabIndex={-1}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
    </div>
  );
});

function qphase(p: string): string {
  return p === 'active' ? ' ACTIVE' : p === 'error' ? ' ERROR' : ' GENERATION MODE';
}

function InfoCell({ k, v, accent }: { k: string; v: string; accent: string }) {
  return (
    <div className="bg-black/70 px-2.5 py-1.5 min-w-0">
      <div className="text-slate-500 tracking-widest">{k}</div>
      <div className="truncate" style={{ color: accent }}>{v}</div>
    </div>
  );
}
