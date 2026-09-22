import * as THREE from 'three';
import type { OrbPalette, OrbQualityProfile } from './orbConfig';

/**
 * ULTRON-style holographic AI core scene.
 * Layer tree:
 *   group
 *   ├── core (white-hot sphere)
 *   ├── inner energy sphere (fbm plasma, tighter scale)
 *   ├── outer plasma sphere (fbm gas)
 *   ├── shell back/front (fresnel glass + scanlines)
 *   ├── wire icosahedron shell
 *   ├── energy rings x2 + orbital ring + satellite bead (traveling energy)
 *   ├── energy trail arcs x2 (thinking/processing activity)
 *   ├── particle field + debris field
 *   └── HUD tick ring (technical micro-detail)
 * Each layer animates independently in update().
 */

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
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,p3)));
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

const PLASMA_VERT = `
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
  vPosition = position;
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}`;

const PLASMA_FRAG = `
uniform float uTime;
uniform float uScale;
uniform float uBrightness;
uniform float uThreshold;
uniform float uNoise;
uniform vec3 uColorDeep;
uniform vec3 uColorMid;
uniform vec3 uColorBright;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
${NOISE_GLSL}
float hash13(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
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
  vec3 outCol = color * uBrightness;
  outCol += (hash13(vPosition * 90.0 + fract(uTime)) - 0.5) * uNoise;
  gl_FragColor = vec4(outCol, finalAlpha);
}`;

const SHELL_VERT = `
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vPos;
varying vec3 vWorldPos;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}`;

const SHELL_FRAG = `
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vPos;
varying vec3 vWorldPos;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uScan;
uniform float uGrid;
void main() {
  float fresnel = pow(1.0 - dot(normalize(vNormal), normalize(vViewPosition)), 2.5);
  float scan = 1.0 - uScan * (0.5 + 0.5 * sin(vPos.y * 60.0 - uTime * 2.0));
  // world-space scan grid: density independent of geometry tessellation
  vec2 g1 = abs(fract(vWorldPos.xy * 7.0) - 0.5);
  vec2 g2 = abs(fract(vWorldPos.zy * 7.0) - 0.5);
  float line1 = 1.0 - smoothstep(0.0, 0.06, min(g1.x, g1.y));
  float line2 = 1.0 - smoothstep(0.0, 0.06, min(g2.x, g2.y));
  float grid = max(line1, line2) * uGrid;
  vec3 col = uColor + uColor * grid * 1.6;
  gl_FragColor = vec4(col, fresnel * uOpacity * scan + grid * 0.05);
}`;

export interface OrbFrameParams {
  timeScale: number;
  brightness: number;
  shellOpacity: number;
  pulse: number;
  ringSpeed: number;
  trailOpacity: number;
  /** real voice intensity 0..1 */
  level: number;
  /** 0..1 alert mix during real errors */
  errorFlash: number;
  /** 0..1 wake expansion 1->0 over the wake cinematic */
  wakeExpand: number;
  /** 0..1 hand-openness expansion: layers breathe outward */
  explode: number;
  /** 0..1 holographic grain (off on weak devices unless enabled) */
  noise: number;
}

export interface OrbSceneHandle {
  group: THREE.Group;
  update: (dt: number, t: number, p: OrbFrameParams) => void;
  setPalette: (pal: OrbPalette) => void;
  dispose: () => void;
}

function makePlasma(pal: OrbPalette, scale: number, threshold: number, segs: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: scale },
      uBrightness: { value: 1 },
      uThreshold: { value: threshold },
      uNoise: { value: 0 },
      uColorDeep: { value: new THREE.Color(pal.deep) },
      uColorMid: { value: new THREE.Color(pal.mid) },
      uColorBright: { value: new THREE.Color(pal.bright) },
    },
    vertexShader: PLASMA_VERT,
    fragmentShader: PLASMA_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

export function createOrbScene(pal: OrbPalette, q: OrbQualityProfile): OrbSceneHandle {
  const group = new THREE.Group();
  const base = {
    mid: new THREE.Color(pal.mid),
    bright: new THREE.Color(pal.bright),
    shell: new THREE.Color(pal.shell),
    particle: new THREE.Color(pal.particle),
    alert: new THREE.Color(pal.alert),
  };
  const tmp = new THREE.Color();

  const light = new THREE.PointLight(base.mid.clone(), 2.0, 10);
  group.add(light);

  // shell (front + back, fresnel + scanlines)
  const shellGeo = new THREE.SphereGeometry(1.0, q.shellSegments, q.shellSegments);
  const shellBack = new THREE.ShaderMaterial({
    vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG,
    uniforms: { uColor: { value: new THREE.Color(0x2a1a00) }, uOpacity: { value: 0.3 }, uTime: { value: 0 }, uScan: { value: 0.25 }, uGrid: { value: 0.35 } },
    transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
  });
  const shellFront = new THREE.ShaderMaterial({
    vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG,
    uniforms: { uColor: { value: base.shell.clone() }, uOpacity: { value: 0.35 }, uTime: { value: 0 }, uScan: { value: 0.35 }, uGrid: { value: 0.6 } },
    transparent: true, blending: THREE.AdditiveBlending, side: THREE.FrontSide, depthWrite: false,
  });
  group.add(new THREE.Mesh(shellGeo, shellBack));
  const shellFrontMesh = new THREE.Mesh(shellGeo, shellFront);
  group.add(shellFrontMesh);

  // outer plasma + inner energy sphere + white-hot core
  const plasma = makePlasma(pal, 0.2, 0.09, q.plasmaSegments);
  const plasmaMesh = new THREE.Mesh(new THREE.SphereGeometry(0.998, q.plasmaSegments, q.plasmaSegments), plasma);
  group.add(plasmaMesh);
  const inner = makePlasma(pal, 0.42, 0.02, Math.max(32, q.plasmaSegments - 16));
  const innerMesh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 48, 48), inner);
  group.add(innerMesh);
  const coreMat = new THREE.MeshBasicMaterial({ color: base.bright.clone(), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 32), coreMat);
  group.add(core);

  // geometric edge shell: cached EdgesGeometry lines (no full-mesh wireframe)
  const wireGeo = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.15, 1));
  const wireMat = new THREE.LineBasicMaterial({ color: base.shell.clone(), transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
  const wire = new THREE.LineSegments(wireGeo, wireMat);
  group.add(wire);

  // floating technical fragments: cached edge geometries on slow orbits
  const fragGroup = new THREE.Group();
  const fragGeos = [
    new THREE.EdgesGeometry(new THREE.TetrahedronGeometry(0.06)),
    new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.05)),
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.07, 0.07, 0.07)),
  ];
  const fragMat = new THREE.LineBasicMaterial({ color: base.bright.clone(), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const frags: THREE.LineSegments[] = [];
  for (let i = 0; i < 6; i++) {
    const f = new THREE.LineSegments(fragGeos[i % fragGeos.length], fragMat);
    const a = (i / 6) * Math.PI * 2;
    f.position.set(Math.cos(a) * 1.35, (i % 2 === 0 ? 0.35 : -0.35), Math.sin(a) * 1.35);
    fragGroup.add(f);
    frags.push(f);
  }
  group.add(fragGroup);

  // energy rings + tilted orbital ring + satellite bead
  const ring1Mat = new THREE.MeshBasicMaterial({ color: base.shell.clone(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.008, 12, 128), ring1Mat);
  ring1.rotation.x = Math.PI / 2.4;
  group.add(ring1);
  const ring2Mat = new THREE.MeshBasicMaterial({ color: base.bright.clone(), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.005, 12, 128), ring2Mat);
  ring2.rotation.x = Math.PI / 1.7;
  ring2.rotation.y = 0.5;
  group.add(ring2);
  const orbitMat = new THREE.MeshBasicMaterial({ color: base.mid.clone(), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.004, 8, 128), orbitMat);
  orbit.rotation.x = Math.PI / 2.1;
  orbit.rotation.y = -0.4;
  group.add(orbit);
  const beadMat = new THREE.MeshBasicMaterial({ color: base.bright.clone(), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 16), beadMat);
  group.add(bead);

  // energy trail arcs (visible during thinking/processing/executing)
  const trailMatA = new THREE.MeshBasicMaterial({ color: base.bright.clone(), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
  const trailA = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.007, 8, 64, Math.PI * 0.7), trailMatA);
  trailA.rotation.x = Math.PI / 2.6;
  group.add(trailA);
  const trailMatB = new THREE.MeshBasicMaterial({ color: base.mid.clone(), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
  const trailB = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.006, 8, 64, Math.PI * 0.55), trailMatB);
  trailB.rotation.x = Math.PI / 1.9;
  group.add(trailB);

  // particle field (inside) + debris (outside) + HUD tick ring
  function scatter(count: number, rMin: number, rMax: number, flattenY = 1): { pos: Float32Array; size: Float32Array } {
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = rMin + Math.random() * (rMax - rMin);
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * flattenY;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      size[i] = Math.random();
    }
    return { pos, size };
  }
  const pf = scatter(q.particles, 0.1, 0.95);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pf.pos, 3));
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(pf.size, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: base.particle.clone() } },
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
        gl_PointSize = (8.0 * aSize + 4.0) * (1.0 / -mvPosition.z);
        vAlpha = 0.8 + 0.2 * sin(uTime + aSize * 10.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        if (length(uv) > 0.5) discard;
        float glow = pow(1.0 - length(uv) * 2.0, 1.8);
        gl_FragColor = vec4(uColor, glow * vAlpha);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const particles = new THREE.Points(pGeo, pMat);
  group.add(particles);

  const db = scatter(q.debris, 1.45, 1.95, 0.6);
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(db.pos, 3));
  const dMat = new THREE.PointsMaterial({ color: base.shell.clone(), size: 0.02, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const debris = new THREE.Points(dGeo, dMat);
  group.add(debris);

  const tickPos = new Float32Array(q.hudTicks * 3);
  for (let i = 0; i < q.hudTicks; i++) {
    const a = (i / q.hudTicks) * Math.PI * 2;
    tickPos[i * 3] = Math.cos(a) * 1.72;
    tickPos[i * 3 + 1] = Math.sin(a) * 1.72;
    tickPos[i * 3 + 2] = 0;
  }
  const tickGeo = new THREE.BufferGeometry();
  tickGeo.setAttribute('position', new THREE.BufferAttribute(tickPos, 3));
  const tickMat = new THREE.PointsMaterial({ color: base.shell.clone(), size: 0.025, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const ticks = new THREE.Points(tickGeo, tickMat);
  group.add(ticks);

  function setPalette(p: OrbPalette) {
    base.mid.set(p.mid); base.bright.set(p.bright); base.shell.set(p.shell);
    base.particle.set(p.particle); base.alert.set(p.alert);
    (plasma.uniforms.uColorDeep.value as THREE.Color).set(p.deep);
    (plasma.uniforms.uColorMid.value as THREE.Color).set(p.mid);
    (plasma.uniforms.uColorBright.value as THREE.Color).set(p.bright);
    (inner.uniforms.uColorDeep.value as THREE.Color).set(p.deep);
    (inner.uniforms.uColorMid.value as THREE.Color).set(p.mid);
    (inner.uniforms.uColorBright.value as THREE.Color).set(p.bright);
    (shellFront.uniforms.uColor.value as THREE.Color).set(p.shell);
    (pMat.uniforms.uColor.value as THREE.Color).set(p.particle);
    (fragMat.color as THREE.Color).set(p.bright);
    light.color.set(p.mid);
  }

  let beadAngle = 0;
  let plasmaClock = 0;
  const beadTilt = new THREE.Matrix4().makeRotationX(Math.PI / 2.1 - Math.PI / 2);
  const white = new THREE.Color(0xffffff);

  function update(dt: number, t: number, p: OrbFrameParams) {
    const e = p.ringSpeed;
    plasmaClock += Math.max(0, dt) * p.timeScale;
    plasma.uniforms.uTime.value = plasmaClock;
    plasma.uniforms.uBrightness.value = p.brightness + p.level * 1.1;
    plasma.uniforms.uNoise.value = p.noise * 0.12;
    inner.uniforms.uTime.value = -t * 1.4;
    inner.uniforms.uBrightness.value = 0.9 + p.pulse * 0.5 + p.level * 0.8;
    pMat.uniforms.uTime.value = t;
    shellFront.uniforms.uTime.value = t;
    shellBack.uniforms.uTime.value = t;
    shellFront.uniforms.uOpacity.value = p.shellOpacity + p.level * 0.25;

    const s = 1 + Math.sin(t * 4) * 0.035 * p.pulse + p.level * 0.07 + p.wakeExpand * 0.25;
    group.scale.set(s, s, s);

    // voice pushes plasma toward white-hot
    (plasma.uniforms.uColorMid.value as THREE.Color).copy(base.mid).lerp(white, p.level * 0.25);

    // alert mix (error only): rings/bead/core drift to alert tint
    const f = Math.max(0, Math.min(1, p.errorFlash));
    ring1Mat.color.copy(tmp.copy(base.shell).lerp(base.alert, f));
    ring2Mat.color.copy(tmp.copy(base.bright).lerp(base.alert, f));
    beadMat.color.copy(tmp.copy(base.bright).lerp(base.alert, f));
    coreMat.color.copy(tmp.copy(base.bright).lerp(base.alert, f));

    plasmaMesh.rotation.y = t * 0.08;
    innerMesh.rotation.y = -t * 0.12;
    innerMesh.rotation.x = t * 0.03;
    wire.rotation.y -= 0.0012 * e;
    wire.rotation.x += 0.0004 * e;
    // openness expansion: outer dressing breathes outward, shell stays readable
    const ex = 1 + p.explode * 0.35;
    ring1.scale.set(ex, ex, ex);
    ring2.scale.set(ex, ex, 1);
    orbit.scale.set(ex, ex, ex);
    debris.scale.set(ex, ex, ex);
    ticks.scale.set(ex, ex, 1);
    fragGroup.scale.set(ex, ex, ex);
    fragGroup.rotation.y += 0.0011 * e;
    for (let i = 0; i < frags.length; i++) {
      frags[i].rotation.x += 0.004 * (i % 2 === 0 ? e : -e * 0.6);
      frags[i].rotation.y += 0.003 * e;
    }
    ring1.rotation.z += 0.004 * e + p.level * 0.02;
    ring2.rotation.z -= 0.003 * e + p.level * 0.015;
    ring2.rotation.x += 0.0008;
    orbit.rotation.z += 0.0015 * e;
    beadAngle += 0.008 * e + 0.004;
    bead.position.set(Math.cos(beadAngle) * 1.62, 0, Math.sin(beadAngle) * 1.62);
    bead.position.applyMatrix4(beadTilt);
    trailMatA.opacity = p.trailOpacity * (0.35 + 0.65 * Math.min(1, p.level + 0.4));
    trailMatB.opacity = p.trailOpacity * 0.7 * (0.35 + 0.65 * Math.min(1, p.level + 0.4));
    trailA.rotation.z += 0.02 * e;
    trailB.rotation.z -= 0.016 * e;
    particles.rotation.y += 0.0015 * e;
    debris.rotation.y += (0.001 + p.level * 0.004) * e;
    ticks.rotation.z -= 0.0009 * e;
    const cs = 1 + Math.sin(t * 5) * 0.12 + p.level * 0.5;
    core.scale.set(cs, cs, cs);
  }

  function dispose() {
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
  }

  return { group, update, setPalette, dispose };
}
