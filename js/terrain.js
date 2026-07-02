// js/terrain.js — the valley heightfield. One deterministic function H(x,z)
// shared by the geometry builder AND runtime walking, so feet never sink.
// Recipe follows the hogwarts/forest playbook: fbm value noise, a flattened
// walking ramp along the torii path, a shrine plaza, a pagoda hill, a lake
// basin, and a mountain ring that swallows the horizon into the dusk fog.

import * as THREE from 'three';
import {
  hash, smoothstep, distToPath, pathRampY, TREES, SHRINE, PAGODA, LAKE,
} from './layout.js';

// --- value noise + fbm (deterministic; NO Math.random anywhere near here) ---
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
export function fbm(x, z, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += vnoise(x * f, z * f) * amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return v; // ~[0, 1)
}

// --- the height function ---
export function H(x, z) {
  let y = (fbm(x * 0.008 + 3.7, z * 0.008 - 1.2, 4) - 0.5) * 44
        + (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 3.2 + 6;

  // mountain ring — the world's walls, hazy in the fog
  const d = Math.hypot(x, z);
  const ring = smoothstep(420, 820, d);
  y += ring * (55 + fbm(x * 0.004 + 9.1, z * 0.004 + 7.7, 4) * 240);

  // torii-path walking ramp
  const dp = distToPath(x, z);
  const fPath = (1 - smoothstep(6, 26, dp)) * 0.93;
  y = y * (1 - fPath) + pathRampY(z) * fPath;

  // shrine plaza — dead flat
  const dPl = Math.hypot(x - SHRINE.x, z - SHRINE.z);
  const fPl = 1 - smoothstep(16, 32, dPl);
  y = y * (1 - fPl) + SHRINE.y * fPl;

  // pagoda hill
  const dH = Math.hypot(x - PAGODA.x, z - PAGODA.z);
  y += 17 * (1 - smoothstep(14, 60, dH));
  const fH = 1 - smoothstep(9, 20, dH);
  y = y * (1 - fH) + PAGODA.y * fH;

  // lake basin (south-east)
  const ex = (x - LAKE.x) / LAKE.rx, ez = (z - LAKE.z) / LAKE.rz;
  const e = ex * ex + ez * ez;
  const fL = 1 - smoothstep(0.55, 1.12, e);
  y = y * (1 - fL) + (-3.5) * fL;

  return y;
}
export const getGroundHeight = H;

// --- terrain mesh with painted vertex colors ---
export function createTerrain(scene) {
  const SIZE = 1700, SEG = 220;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const grassA = new THREE.Color('#41603f');   // dusk grass
  const grassB = new THREE.Color('#5c6b44');
  const rock = new THREE.Color('#54505c');     // violet-grey scree
  const sand = new THREE.Color('#a89272');     // the walking path
  const shore = new THREE.Color('#7d7460');
  const petal = new THREE.Color('#9c6b7a');    // fallen-blossom carpet
  const cTmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = H(x, z);
    pos.setY(i, y);

    // slope via finite difference
    const s = Math.hypot(H(x + 2, z) - y, H(x, z + 2) - y) / 2;

    cTmp.copy(grassA).lerp(grassB, fbm(x * 0.03 + 40, z * 0.03 + 40, 3));
    cTmp.lerp(rock, smoothstep(0.55, 1.0, s));
    if (y > 90) cTmp.lerp(rock, 0.6); // high ring is bare stone

    // fallen sakura carpet under each tree
    for (let k = 0; k < TREES.length; k++) {
      const t = TREES[k];
      const dt = Math.hypot(x - t.x, z - t.z);
      const rr = 5.5 * t.s;
      if (dt < rr) { cTmp.lerp(petal, (1 - dt / rr) * 0.55); break; }
    }

    // sandy walking path
    const dp = distToPath(x, z);
    if (dp < 8) cTmp.lerp(sand, 1 - smoothstep(2.6, 8, dp));
    // shore band around the lake
    if (y < 3.2 && y > -1) cTmp.lerp(shore, 0.6);

    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true })
  );
  mesh.name = 'terrain';
  scene.add(mesh);

  // Fuji-like silhouette far beyond the ring, half-eaten by the haze
  const fuji = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(520, 470, 48, 1, true),
    new THREE.MeshLambertMaterial({ color: '#3a3346' })
  );
  cone.position.y = 235;
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(170, 150, 48, 1, true),
    new THREE.MeshLambertMaterial({ color: '#cfc4d6' })
  );
  cap.position.y = 395;
  fuji.add(cone, cap);
  fuji.position.set(-620, 0, -1250);
  scene.add(fuji);

  return mesh;
}
