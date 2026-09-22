/**
 * LEVEL 2 — procedural 3D builders. Every builder returns REAL THREE geometry
 * (no fake meshes). Complex organic shapes are honest approximations and the
 * registry flags them so the viewer labels them as such.
 */
import * as THREE from 'three';

export interface ProceduralResult {
  group: THREE.Group;
  /** human-readable build note, shown in the info HUD */
  note: string;
}

function mesh(geo: THREE.BufferGeometry, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
  m.position.set(x, y, z);
  return m;
}

/** Segment counts shrink in low-poly mode (PART V: fewer polys, faster render). */
let LOW = false;
const seg = (hi: number, lo: number) => (LOW ? lo : hi);

const builders: Record<string, () => ProceduralResult> = {
  earth: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(1, 48, 32)));
    // equator + orbit rings (hologram dressing lives in the viewer)
    const eq = mesh(new THREE.TorusGeometry(1.15, 0.015, 8, 96));
    eq.rotation.x = Math.PI / 2 - 0.2;
    g.add(eq);
    const moon = mesh(new THREE.SphereGeometry(0.22, 24, 18), 1.9, 0.35, 0);
    g.add(moon);
    return { group: g, note: 'Stylized planet: sphere + equator ring + moon.' };
  },
  heart: () => {
    const g = new THREE.Group();
    // Approximation: twin-lobed pump body + arterial trunks.
    g.add(mesh(new THREE.SphereGeometry(0.62, 32, 24), -0.3, 0.1, 0));
    g.add(mesh(new THREE.SphereGeometry(0.62, 32, 24), 0.3, 0.1, 0));
    const cone = mesh(new THREE.ConeGeometry(0.72, 1.1, 32), 0, -0.75, 0);
    cone.rotation.x = Math.PI;
    g.add(cone);
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.9, 20), -0.25, 0.95, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.8, 20), 0.3, 0.9, -0.1));
    return { group: g, note: 'Procedural approximation, not anatomical.' };
  },
  skeleton: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.32, 24, 18), 0, 2.15, 0)); // skull
    g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 12), 0, 1.5, 0)); // spine
    for (let i = 0; i < 3; i++) {
      const rib = mesh(new THREE.TorusGeometry(0.34 - i * 0.04, 0.035, 8, 32), 0, 1.7 - i * 0.22, 0);
      rib.rotation.x = Math.PI / 2;
      g.add(rib);
    }
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.85, 10), s * 0.5, 1.55, 0)); // arms
      g.add(mesh(new THREE.CylinderGeometry(0.09, 0.07, 1.0, 10), s * 0.22, 0.45, 0)); // legs
    }
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.35, 12), 0, 0.95, 0)); // pelvis
    return { group: g, note: 'Simplified stick-frame figure, not anatomical.' };
  },
  molecule: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.42, 28, 20)));
    for (const [x, z] of [[-0.75, 0.35], [0.75, 0.35], [0, -0.8]] as Array<[number, number]>) {
      g.add(mesh(new THREE.SphereGeometry(0.26, 24, 18), x, 0.15, z));
      const bond = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.85, 10), x / 2, 0.08, z / 2);
      bond.lookAt(new THREE.Vector3(x, 0.15, z));
      bond.rotateX(Math.PI / 2);
      g.add(bond);
    }
    return { group: g, note: 'Generic 4-atom molecule model.' };
  },
  car: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(2.2, 0.5, 1.0), 0, 0.45, 0)); // chassis
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.45, 0.9), -0.1, 0.9, 0)); // cabin
    const wheel = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 24);
    for (const [x, z] of [[-0.75, 0.55], [0.75, 0.55], [-0.75, -0.55], [0.75, -0.55]] as Array<[number, number]>) {
      const w = mesh(wheel.clone(), x, 0.28, z);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
    g.add(mesh(new THREE.SphereGeometry(0.09, 12, 10), 1.12, 0.5, 0.3));
    g.add(mesh(new THREE.SphereGeometry(0.09, 12, 10), 1.12, 0.5, -0.3));
    return { group: g, note: 'Block-model vehicle, not a real car CAD model.' };
  },
  house: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.6, 1.0, 1.3), 0, 0.5, 0));
    const roof = mesh(new THREE.ConeGeometry(1.25, 0.8, 4), 0, 1.4, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    g.add(mesh(new THREE.BoxGeometry(0.35, 0.6, 0.06), 0, 0.3, 0.66)); // door
    return { group: g, note: 'Simple block house.' };
  },
  tree: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.0, seg(16, 8)), 0, 0.5, 0));
    g.add(mesh(new THREE.ConeGeometry(0.75, 1.0, seg(20, 8)), 0, 1.4, 0));
    g.add(mesh(new THREE.ConeGeometry(0.55, 0.8, seg(20, 8)), 0, 2.0, 0));
    return { group: g, note: 'Stylized pine tree.' };
  },
  airplane: () => {
    const g = new THREE.Group();
    const fus = mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, seg(20, 10)));
    fus.rotation.z = Math.PI / 2;
    g.add(fus);
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 2.0), 0, 0, 0)); // wings
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.5, 0.06), -1.0, 0.25, 0)); // tail
    const nose = mesh(new THREE.ConeGeometry(0.22, 0.5, seg(20, 10)), 1.35, 0, 0);
    nose.rotation.z = -Math.PI / 2;
    g.add(nose);
    return { group: g, note: 'Simple airplane model.' };
  },
  robot: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), 0, 1.85, 0)); // head
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), 0, 2.3, 0)); // antenna
    g.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), 0, 2.48, 0));
    g.add(mesh(new THREE.BoxGeometry(0.9, 1.0, 0.55), 0, 1.0, 0)); // torso
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.85, 10), s * 0.62, 1.0, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 10), s * 0.28, 0.05, 0));
    }
    return { group: g, note: 'Toy-block robot figure.' };
  },
  dog: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.5, 0.45), 0, 0.65, 0)); // body
    g.add(mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), 0.7, 1.0, 0)); // head
    for (const s of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.09, 0.22, 10), 0.7, 1.28, s * 0.14)); // ears
    for (const [x, z] of [[-0.4, 0.16], [0.4, 0.16], [-0.4, -0.16], [0.4, -0.16]] as Array<[number, number]>) {
      g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.45, 10), x, 0.22, z));
    }
    const tail = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), -0.65, 0.85, 0);
    tail.rotation.z = 0.7;
    g.add(tail);
    return { group: g, note: 'Block-model dog.' };
  },
  phone: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.8, 1.6, 0.09), 0, 0, 0));
    g.add(mesh(new THREE.BoxGeometry(0.68, 1.42, 0.02), 0, 0, 0.05)); // screen
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), 0, 0.68, 0.05)); // camera dot
    return { group: g, note: 'Slab smartphone model.' };
  },
  rocket: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.5, seg(24, 10)), 0, 0.3, 0));
    g.add(mesh(new THREE.ConeGeometry(0.32, 0.7, seg(24, 10)), 0, 1.4, 0));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.55, 0.3), Math.cos(a) * 0.36, -0.35, Math.sin(a) * 0.36));
    }
    g.add(mesh(new THREE.ConeGeometry(0.16, 0.5, 12), 0, -0.85, 0));
    return { group: g, note: 'Stylized rocket.' };
  },
  chair: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.1, 0.9), 0, 0.55, 0)); // seat
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), 0, 1.05, -0.42)); // back
    for (const [x, z] of [[-0.38, 0.38], [0.38, 0.38], [-0.38, -0.38], [0.38, -0.38]] as Array<[number, number]>) {
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8), x, 0.27, z));
    }
    return { group: g, note: 'Simple chair.' };
  },
  solar: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.55, seg(32, 12), seg(24, 10))));
    const o1 = mesh(new THREE.TorusGeometry(1.0, 0.012, 8, 64));
    o1.rotation.x = Math.PI / 2;
    const o2 = mesh(new THREE.TorusGeometry(1.5, 0.012, 8, 64));
    o2.rotation.x = Math.PI / 2 + 0.15;
    g.add(o1, o2);
    g.add(mesh(new THREE.SphereGeometry(0.16, 16, 12), 1.0, 0, 0));
    g.add(mesh(new THREE.SphereGeometry(0.22, 16, 12), -1.1, 0.35, 0.4));
    return { group: g, note: 'Stylized sun + orbiting planets.' };
  },
  cube: () => ({ group: new THREE.Group().add(mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4))), note: 'Unit cube.' }),
  sphere: () => ({ group: new THREE.Group().add(mesh(new THREE.SphereGeometry(1, seg(48, 12), seg(32, 8)))), note: 'Unit sphere.' }),
  cylinder: () => ({ group: new THREE.Group().add(mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.6, seg(32, 10)))), note: 'Unit cylinder.' }),
  torus: () => ({ group: new THREE.Group().add(mesh(new THREE.TorusGeometry(0.9, 0.32, seg(20, 8), seg(64, 20)))), note: 'Torus ring.' }),
  cone: () => ({ group: new THREE.Group().add(mesh(new THREE.ConeGeometry(0.85, 1.6, seg(32, 10)))), note: 'Unit cone.' }),
  pyramid: () => ({ group: new THREE.Group().add(mesh(new THREE.ConeGeometry(1.0, 1.4, 4))), note: '4-sided pyramid.' }),
};

export function buildProcedural(id: string, lowPoly = false): ProceduralResult | null {
  const b = builders[id];
  if (!b) return null;
  LOW = lowPoly;
  try {
    const r = b();
    // validate: must contain at least one mesh with real geometry
    let meshes = 0;
    r.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry && (m.geometry as THREE.BufferGeometry).attributes?.position) meshes++;
    });
    if (meshes === 0) return null;
    if (lowPoly) r.note += ' Low-poly build.';
    return r;
  } catch {
    return null;
  } finally {
    LOW = false;
  }
}
