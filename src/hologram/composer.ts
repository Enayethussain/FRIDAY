/**
 * Shared hologram composer: catalog `parts` -> THREE.Group.
 * Used by the runtime viewer AND the bake script (via tsx) so baked GLBs
 * always match what the composer produces. No DOM/WebGL needed.
 */
import * as THREE from 'three';

export type PartType = 'box' | 'sph' | 'cyl' | 'cone' | 'tor';

export interface HoloPart {
  t: PartType;
  /** geometry args: box[sx,sy,sz] sph[r,w,h] cyl[rt,rb,h,s] cone[r,h,s] tor[R,r,ts,rs] */
  a: number[];
  /** position */
  p: [number, number, number];
  /** rotation degrees xyz (optional) */
  r?: [number, number, number];
}

const D2R = Math.PI / 180;

export function composeParts(parts: HoloPart[]): THREE.Group {
  const g = new THREE.Group();
  for (const part of parts) {
    let geo: THREE.BufferGeometry;
    const a = part.a;
    switch (part.t) {
      case 'box': geo = new THREE.BoxGeometry(a[0], a[1], a[2]); break;
      case 'sph': geo = new THREE.SphereGeometry(a[0], a[1] ?? 18, a[2] ?? 14); break;
      case 'cyl': geo = new THREE.CylinderGeometry(a[0], a[1], a[2], a[3] ?? 14); break;
      case 'cone': geo = new THREE.ConeGeometry(a[0], a[1], a[2] ?? 14); break;
      case 'tor': geo = new THREE.TorusGeometry(a[0], a[1], a[2] ?? 10, a[3] ?? 24); break;
      default: continue;
    }
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
    m.position.set(part.p[0], part.p[1], part.p[2]);
    if (part.r) m.rotation.set(part.r[0] * D2R, part.r[1] * D2R, part.r[2] * D2R);
    g.add(m);
  }
  return g;
}

export function countPolys(group: THREE.Group): { meshes: number; tris: number } {
  let meshes = 0;
  let tris = 0;
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      meshes++;
      const g = m.geometry as THREE.BufferGeometry;
      const pos = g.attributes?.position;
      if (pos) tris += (g.index ? g.index.count : pos.count) / 3;
    }
  });
  return { meshes, tris: Math.round(tris) };
}
