// js/scenery.js — everything built by hand: the torii road, the five-story
// pagoda, the shrine + bonshō bell, stone tōrō lanterns, chōchin paper
// lanterns (with a hand-drawn 竜 on each), sakura trees, the great lake,
// the floating islands with their waterfalls, and the petal wind.
//
// Zero external assets. Geometry is primitives merged into one mesh per
// material (the hogwarts trick); every texture is a canvas painted right
// here; the only real lights are two warm points (plaza + pagoda).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  TAU, hash, smoothstep, pathPoint, pathTangent, TREES, LANTERNS, ISLANDS,
  SHRINE, PAGODA, BELL, LAKE, WATER_Y,
} from './layout.js';
import { H, fbm } from './terrain.js';

// ---------------------------------------------------------------- helpers --
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
function xf(geo, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(s, s, s));
  geo.applyMatrix4(_m);
  return geo;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
const cone = (r, h, n = 10) => new THREE.ConeGeometry(r, h, n);

// ------------------------------------------------------- canvas textures --
function plasterTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e0ce';
  g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 500; i++) { // plaster grain
    g.fillStyle = `rgba(120,100,90,${0.03 + hash(i, 7) * 0.05})`;
    g.fillRect(hash(i, 8) * 256, hash(i, 9) * 128, 2, 2);
  }
  const e = document.createElement('canvas'); // emissive: lit windows only
  e.width = 256; e.height = 128;
  const ge = e.getContext('2d');
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 256, 128);
  // timber frame
  g.fillStyle = '#43332a';
  g.fillRect(0, 0, 256, 10);
  g.fillRect(0, 116, 256, 12);
  for (let px = 0; px < 256; px += 42) g.fillRect(px, 0, 6, 128);
  // window row — some lit, some dark
  for (let wx = 14, i = 0; wx < 240; wx += 42, i++) {
    const lit = hash(i, 31) > 0.35;
    g.fillStyle = lit ? '#ffc274' : '#241a14';
    g.fillRect(wx, 38, 20, 44);
    g.fillStyle = '#43332a'; // muntins
    g.fillRect(wx + 9, 38, 3, 44);
    g.fillRect(wx, 57, 20, 3);
    if (lit) {
      ge.fillStyle = '#ff9d3f';
      ge.fillRect(wx, 38, 20, 44);
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap: new THREE.CanvasTexture(e) };
}

function chochinTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#2a1c12');
  grad.addColorStop(0.13, '#ffb45e');
  grad.addColorStop(0.5, '#ffd489');
  grad.addColorStop(0.87, '#ff9e4d');
  grad.addColorStop(1, '#2a1c12');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(80,30,10,0.25)'; // ribs
  for (let y = 18; y < 116; y += 12) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke();
  }
  g.fillStyle = '#8c1f10';
  g.font = 'bold 62px "Hiragino Mincho ProN", "Noto Serif CJK JP", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('竜', 64, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(inner = 'rgba(255,214,150,0.85)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, 'rgba(255,180,110,0.22)');
  grad.addColorStop(1, 'rgba(255,180,110,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function petalTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32);
  g.rotate(0.6);
  const grad = g.createRadialGradient(0, 0, 2, 0, 0, 26);
  grad.addColorStop(0, 'rgba(255,235,242,0.95)');
  grad.addColorStop(0.7, 'rgba(255,196,215,0.9)');
  grad.addColorStop(1, 'rgba(255,196,215,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(0, 0, 13, 22, 0, 0, TAU);
  g.fill();
  g.globalCompositeOperation = 'destination-out'; // the sakura notch
  g.beginPath();
  g.ellipse(0, -21, 7, 9, 0, 0, TAU);
  g.fill();
  return new THREE.CanvasTexture(c);
}

// ================================================================== build --
export function createScenery(scene) {
  // merge buckets — one mesh per material at the end
  const B = { vermilion: [], darkwood: [], stone: [], slate: [], gold: [], glowbox: [], plaster: [], canopy: [], paper: [] };
  const glowSpots = []; // [x,y,z] for the additive glow Points

  // ---------------------------------------------------------- torii road --
  function torii(bucketV, bucketS, x, z, ry, s) {
    const y = H(x, z);
    const h = 5.4 * s;
    const halfW = 2.1 * s;
    const parts = [
      xf(cyl(0.26 * s, 0.3 * s, h, 8), -halfW, y + h / 2, 0),
      xf(cyl(0.26 * s, 0.3 * s, h, 8), halfW, y + h / 2, 0),
      xf(box(4.7 * s, 0.3 * s, 0.36 * s), 0, y + h - 1.35 * s, 0),      // nuki
      xf(box(0.34 * s, 1.0 * s, 0.3 * s), 0, y + h - 0.62 * s, 0),      // gakuzuka
      xf(box(5.6 * s, 0.4 * s, 0.5 * s), 0, y + h + 0.05 * s, 0),       // shimaki
      xf(box(0.9 * s, 0.34 * s, 0.5 * s), -2.9 * s, y + h + 0.42 * s, 0, 0, 0, 0.22),
      xf(box(0.9 * s, 0.34 * s, 0.5 * s), 2.9 * s, y + h + 0.42 * s, 0, 0, 0, -0.22),
    ];
    const cap = xf(box(6.1 * s, 0.26 * s, 0.58 * s), 0, y + h + 0.33 * s, 0); // kasagi (black)
    const g = mergeGeometries(parts);
    _e.set(0, ry, 0); _q.setFromEuler(_e);
    _m.compose(new THREE.Vector3(x, 0, z), _q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(_m);
    cap.applyMatrix4(_m);
    bucketV.push(g);
    bucketS.push(cap);
  }
  for (let i = 0; i < 15; i++) {
    const t = 0.015 + (i / 14) * 0.93;
    const p = pathPoint(t);
    const tg = pathTangent(t);
    torii(B.vermilion, B.slate, p[0], p[1], Math.atan2(tg[0], tg[1]), i >= 13 ? 1.3 : 0.92 + hash(i, 41) * 0.2);
  }

  // ------------------------------------------------------- stone lanterns --
  for (const L of LANTERNS) {
    const y = H(L.x, L.z);
    B.stone.push(
      xf(cyl(0.55, 0.65, 0.35, 8), L.x, y + 0.17, L.z),
      xf(cyl(0.16, 0.2, 1.0, 8), L.x, y + 0.85, L.z),
      xf(box(0.78, 0.62, 0.78), L.x, y + 1.66, L.z),
      xf(cone(0.85, 0.5, 4), L.x, y + 2.22, L.z, 0, Math.PI / 4),
      xf(new THREE.SphereGeometry(0.14, 8, 6), L.x, y + 2.56, L.z)
    );
    B.glowbox.push(xf(box(0.52, 0.42, 0.52), L.x, y + 1.66, L.z));
    glowSpots.push([L.x, y + 1.66, L.z]);
  }

  // -------------------------------------------------------- the pagoda ----
  const PX = PAGODA.x, PZ = PAGODA.z, PY = PAGODA.y;
  B.stone.push(
    xf(box(21, 1.3, 21), PX, PY + 0.65, PZ),
    xf(box(17.6, 1.3, 17.6), PX, PY + 1.95, PZ)
  );
  const plasterTex = plasterTexture();
  for (let i = 0; i < 5; i++) {
    const w = 15 - i * 2.1;
    const ty = PY + 2.6 + i * 5.0;
    B.plaster.push(xf(box(w, 3.6, w), PX, ty + 1.8, PZ));
    B.vermilion.push(xf(box(w + 1.6, 0.28, w + 1.6), PX, ty + 0.12, PZ)); // balcony rim
    B.slate.push(xf(cone((w / 2) * 1.8, 2.4, 4), PX, ty + 4.7, PZ, 0, Math.PI / 4));
  }
  const spireY = PY + 2.6 + 4 * 5.0 + 5.9;
  B.gold.push(xf(cyl(0.14, 0.14, 5.4, 6), PX, spireY + 2.7, PZ));
  for (let i = 0; i < 5; i++) {
    B.gold.push(xf(new THREE.TorusGeometry(0.95 - i * 0.14, 0.07, 6, 14), PX, spireY + 1.3 + i * 0.62, PZ, Math.PI / 2));
  }
  B.gold.push(xf(new THREE.SphereGeometry(0.34, 10, 8), PX, spireY + 5.0, PZ));

  // --------------------------------------------------- shrine + the bell --
  const SX = SHRINE.x, SZ = SHRINE.z, SY = SHRINE.y;
  // paved plaza disc (slightly above the flattened terrain — no z-fight)
  const plazaGeo = new THREE.CircleGeometry(16, 28);
  plazaGeo.rotateX(-Math.PI / 2);
  B.stone.push(xf(plazaGeo, SX, SY + 0.06, SZ));
  // honden (main hall) at the plaza's north edge
  const HZ = SZ - 11;
  B.stone.push(xf(box(8.4, 0.8, 6.4), SX, SY + 0.4, HZ));
  B.plaster.push(xf(box(6.2, 3.2, 4.6), SX, SY + 2.4, HZ));
  B.darkwood.push(xf(box(1.6, 2.2, 0.2), SX, SY + 1.9, HZ + 2.35)); // door
  B.slate.push(
    xf(box(7.6, 0.26, 3.6), SX, SY + 4.75, HZ - 1.35, -0.55),
    xf(box(7.6, 0.26, 3.6), SX, SY + 4.75, HZ + 1.35, 0.55),
    xf(box(7.8, 0.3, 0.5), SX, SY + 5.45, HZ)
  );
  for (const ex of [-3.6, 3.6]) { // chigi — the crossed gold finials
    B.gold.push(
      xf(box(0.16, 1.6, 0.16), SX + ex, SY + 5.9, HZ - 0.4, 0.5),
      xf(box(0.16, 1.6, 0.16), SX + ex, SY + 5.9, HZ + 0.4, -0.5)
    );
  }
  // bell pavilion
  const BX = BELL.x, BZ = BELL.z;
  for (const [ox, oz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
    B.darkwood.push(xf(cyl(0.2, 0.24, 3.6, 8), BX + ox, SY + 1.8, BZ + oz));
  }
  B.darkwood.push(
    xf(box(3.6, 0.3, 0.3), BX, SY + 3.55, BZ - 1.5),
    xf(box(3.6, 0.3, 0.3), BX, SY + 3.55, BZ + 1.5),
    xf(box(0.3, 0.3, 3.6), BX - 1.5, SY + 3.55, BZ),
    xf(box(0.3, 0.3, 3.6), BX + 1.5, SY + 3.55, BZ)
  );
  B.slate.push(xf(cone(3.1, 1.7, 4), BX, SY + 4.5, BZ, 0, Math.PI / 4));
  // the bonshō itself — a separate group so it can swing when struck
  const bellGroup = new THREE.Group();
  bellGroup.position.set(BX, SY + 3.4, BZ);
  const bronze = new THREE.MeshStandardMaterial({ color: '#6e5a30', metalness: 0.75, roughness: 0.42 });
  const bellBody = new THREE.Mesh(
    mergeGeometries([
      xf(cyl(0.72, 0.88, 1.5, 14), 0, -1.5, 0),
      xf(new THREE.SphereGeometry(0.72, 14, 8, 0, TAU, 0, Math.PI / 2), 0, -0.78, 0),
      xf(new THREE.TorusGeometry(0.16, 0.05, 6, 10), 0, -0.55, 0),
    ]),
    bronze
  );
  bellGroup.add(bellBody);
  scene.add(bellGroup);
  B.darkwood.push(xf(cyl(0.11, 0.11, 2.1, 8), BX + 2.0, SY + 2.4, BZ, 0, 0, Math.PI / 2)); // striker beam
  glowSpots.push([BX, SY + 2.6, BZ]);

  // -------------------------------------------- chōchin lantern strings ---
  const paperTex = chochinTexture();
  const chochinGeo = [];
  for (const zLine of [SZ - 14 + 24, SZ + 14 - 38]) { // two strings across the plaza
    for (const side of [0]) {
      B.darkwood.push(
        xf(cyl(0.1, 0.13, 4.4, 8), SX - 11, SY + 2.2, zLine),
        xf(cyl(0.1, 0.13, 4.4, 8), SX + 11, SY + 2.2, zLine)
      );
      for (let k = 0; k < 7; k++) {
        const t = (k + 0.5) / 7;
        const lx = SX - 11 + 22 * t;
        const ly = SY + 4.3 - Math.sin(Math.PI * t) * 1.15;
        const s = new THREE.SphereGeometry(0.42, 10, 10);
        s.scale(1, 1.32, 1);
        chochinGeo.push(xf(s, lx, ly, zLine));
        glowSpots.push([lx, ly, zLine]);
      }
    }
  }

  // ------------------------------------------------------- sakura trees ---
  const cTint = new THREE.Color();
  for (let ti = 0; ti < TREES.length; ti++) {
    const T = TREES[ti];
    const y = H(T.x, T.z);
    const s = T.s;
    const lean = (hash(ti, 301) - 0.5) * 0.24;
    B.darkwood.push(
      xf(cyl(0.2 * s, 0.34 * s, 2.8 * s, 7), T.x, y + 1.35 * s, T.z, lean, 0, lean * 0.7),
      xf(cyl(0.09 * s, 0.13 * s, 1.7 * s, 6), T.x + 0.5 * s, y + 2.9 * s, T.z + 0.2 * s, 0.6, 0, 0.5),
      xf(cyl(0.08 * s, 0.12 * s, 1.5 * s, 6), T.x - 0.4 * s, y + 2.8 * s, T.z - 0.3 * s, -0.5, 0, -0.55)
    );
    const nBlobs = 3 + (hash(ti, 302) > 0.5 ? 1 : 0);
    for (let b = 0; b < nBlobs; b++) {
      const bx = T.x + (hash(ti, 310 + b) - 0.5) * 3.4 * s;
      const bz = T.z + (hash(ti, 320 + b) - 0.5) * 3.4 * s;
      const by = y + (3.4 + hash(ti, 330 + b) * 1.4) * s;
      const br = (1.5 + hash(ti, 340 + b) * 0.9) * s;
      const g = new THREE.IcosahedronGeometry(br, 1);
      xf(g, bx, by, bz);
      cTint.setStyle('#f2bfd0').lerp(new THREE.Color('#d387a6'), hash(ti, 350 + b));
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let vi = 0; vi < n; vi++) {
        const j = (hash(vi, ti * 7 + b) - 0.5) * 0.12;
        const vy = g.attributes.position.getY(vi);
        const shade = 0.86 + 0.14 * smoothstep(by - br, by + br, vy); // darker underside
        col[vi * 3] = Math.min(1, (cTint.r + j) * shade);
        col[vi * 3 + 1] = Math.min(1, (cTint.g + j) * shade * 0.96);
        col[vi * 3 + 2] = Math.min(1, (cTint.b + j) * shade);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      B.canopy.push(g);
    }
  }

  // -------------------------------------------------- floating islands ----
  const islandGroups = [];
  const wfMats = [];
  const wfMat = () => {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform float uTime;
        void main() {
          float f = fract(vUv.y * 3.0 + uTime * 0.55);
          float streaks = 0.55 + 0.45 * sin((vUv.x + sin(vUv.y * 24.0) * 0.02) * 42.0);
          float a = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
          gl_FragColor = vec4(mix(vec3(0.5, 0.68, 0.9), vec3(0.85, 0.94, 1.0), f), a * (0.16 + 0.3 * f * streaks));
        }`,
    });
    wfMats.push(m);
    return m;
  };
  const rockMat = new THREE.MeshLambertMaterial({ color: '#6b5f7d', emissive: '#161022' });
  const topMat = new THREE.MeshLambertMaterial({ color: '#5a7a4c', emissive: '#0e1408' });
  const miniVer = new THREE.MeshLambertMaterial({ color: '#d64a36', emissive: '#58170c' });
  const miniSlate = new THREE.MeshLambertMaterial({ color: '#2b3040' });
  for (let ii = 0; ii < ISLANDS.length; ii++) {
    const I = ISLANDS[ii];
    const grp = new THREE.Group();
    grp.position.set(I.x, I.y, I.z);
    // jagged inverted rock cone
    const rock = new THREE.ConeGeometry(I.r, I.h, 8, 3);
    rock.rotateZ(Math.PI);
    const rp = rock.attributes.position;
    for (let vi = 0; vi < rp.count; vi++) {
      const vx = rp.getX(vi), vy = rp.getY(vi), vz = rp.getZ(vi);
      const rr = Math.hypot(vx, vz);
      if (rr > 0.5) {
        const k = 1 + (fbm(vx * 0.3 + ii * 9, vz * 0.3 + vy * 0.2, 3) - 0.5) * 0.5;
        rp.setX(vi, vx * k);
        rp.setZ(vi, vz * k);
      }
    }
    rock.computeVertexNormals();
    grp.add(new THREE.Mesh(rock, rockMat));
    const top = new THREE.Mesh(cyl(I.r * 0.98, I.r * 0.9, 1.8, 12), topMat);
    top.position.y = I.h / 2 + 0.9 - I.h * 0.5; // rock spans -h/2..h/2 flipped; top sits at +h/2
    top.position.y = I.h / 2 + 0.9;
    grp.add(top);
    // deco
    const dy = I.h / 2 + 1.8;
    if (I.deco === 'torii') {
      grp.add(
        new THREE.Mesh(mergeGeometries([
          xf(cyl(0.2, 0.24, 4.2, 7), -1.7, dy + 2.1, 0),
          xf(cyl(0.2, 0.24, 4.2, 7), 1.7, dy + 2.1, 0),
          xf(box(4.6, 0.32, 0.4), 0, dy + 4.25, 0),
          xf(box(3.8, 0.26, 0.34), 0, dy + 3.3, 0),
        ]), miniVer)
      );
    } else if (I.deco === 'pagoda' || I.deco === 'shrine') {
      const tiers = I.deco === 'pagoda' ? 3 : 1;
      const bodies = [], roofs = [];
      for (let k = 0; k < tiers; k++) {
        const w = 5.5 - k * 1.3;
        bodies.push(xf(box(w, 2.2, w), 0, dy + 1.1 + k * 3.2, 0));
        roofs.push(xf(cone(w * 0.92, 1.5, 4), 0, dy + 2.8 + k * 3.2, 0, 0, Math.PI / 4));
      }
      grp.add(new THREE.Mesh(mergeGeometries(bodies), miniVer));
      grp.add(new THREE.Mesh(mergeGeometries(roofs), miniSlate));
    } else { // tree
      grp.add(new THREE.Mesh(xf(cyl(0.16, 0.26, 2.4, 6), 0, dy + 1.2, 0), new THREE.MeshLambertMaterial({ color: '#4a3a30' })));
      const blob = new THREE.IcosahedronGeometry(2.1, 1);
      xf(blob, 0, dy + 3.4, 0);
      grp.add(new THREE.Mesh(blob, new THREE.MeshLambertMaterial({ color: '#e8a8c0', emissive: '#2a141c' })));
    }
    // waterfall off the rim
    const wfLen = I.h + 26;
    const wf = new THREE.Mesh(new THREE.PlaneGeometry(2.4, wfLen), wfMat());
    wf.position.set(I.r * 0.62, I.h / 2 - wfLen / 2 + 1, I.r * 0.3);
    grp.add(wf);
    grp.userData.phase = hash(ii, 401) * TAU;
    grp.userData.baseY = I.y;
    scene.add(grp);
    islandGroups.push(grp);
  }

  // ------------------------------------------------------------ the lake --
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uMoon: { value: new THREE.Vector3(640, 480, -900).normalize() },
      },
    ]),
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vWorld;
      uniform float uTime;
      uniform vec3 uMoon;
      #include <fog_pars_fragment>
      void main() {
        vec3 n = normalize(vec3(
          sin(vWorld.x * 0.09 + uTime * 1.2) * 0.07 + sin(vWorld.x * 0.33 + uTime * 2.0) * 0.035,
          1.0,
          sin(vWorld.z * 0.11 + uTime * 1.6) * 0.07 + sin(vWorld.z * 0.29 - uTime * 1.4) * 0.035));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(v, n), 0.0), 2.2);
        vec3 c = mix(vec3(0.055, 0.07, 0.13), vec3(0.63, 0.36, 0.42), fres * 0.85);
        float spec = pow(max(dot(reflect(-uMoon, n), v), 0.0), 120.0);
        c += vec3(1.0, 0.85, 0.62) * spec * 1.4;
        gl_FragColor = vec4(c, 0.94);
        #include <fog_fragment>
      }`,
  });
  const lakeGeo = new THREE.CircleGeometry(155, 40);
  lakeGeo.rotateX(-Math.PI / 2);
  const lake = new THREE.Mesh(lakeGeo, waterMat);
  lake.position.set(LAKE.x, WATER_Y, LAKE.z);
  scene.add(lake);

  // ----------------------------------------------------------- materials --
  const addMerged = (arr, mat, name) => {
    if (!arr.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(arr), mat);
    mesh.name = name;
    scene.add(mesh);
    return mesh;
  };
  addMerged(B.vermilion, new THREE.MeshLambertMaterial({ color: '#d64a36', emissive: '#4d130a' }), 'vermilion');
  addMerged(B.darkwood, new THREE.MeshLambertMaterial({ color: '#4d3c31' }), 'darkwood');
  addMerged(B.stone, new THREE.MeshLambertMaterial({ color: '#8a8894' }), 'stone');
  addMerged(B.slate, new THREE.MeshLambertMaterial({ color: '#272c3c' }), 'slate');
  addMerged(B.gold, new THREE.MeshStandardMaterial({ color: '#c9a86a', metalness: 0.7, roughness: 0.35 }), 'gold');
  addMerged(B.glowbox, new THREE.MeshBasicMaterial({ color: '#ffd9a0' }), 'glowbox');
  addMerged(B.plaster, new THREE.MeshLambertMaterial({
    map: plasterTex.map, emissive: '#ffb060', emissiveMap: plasterTex.emissiveMap, emissiveIntensity: 0.85,
  }), 'plaster');
  addMerged(B.canopy, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#381a26' }), 'canopy');
  addMerged(chochinGeo, new THREE.MeshBasicMaterial({ map: paperTex }), 'chochin');

  // warm point lights — just two real ones
  const plazaLight = new THREE.PointLight('#ffb478', 260, 70, 2);
  plazaLight.position.set(SX, SY + 6, SZ);
  scene.add(plazaLight);
  const pagodaLight = new THREE.PointLight('#ffb478', 420, 90, 2);
  pagodaLight.position.set(PX, PY + 14, PZ);
  scene.add(pagodaLight);

  // ------------------------------------------------------- glow sprites ---
  const glowGeo = new THREE.BufferGeometry();
  const gp = new Float32Array(glowSpots.length * 3);
  glowSpots.forEach((g, i) => { gp[i * 3] = g[0]; gp[i * 3 + 1] = g[1]; gp[i * 3 + 2] = g[2]; });
  glowGeo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  const glowMat = new THREE.PointsMaterial({
    map: glowTexture(), size: 3.0, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  scene.add(new THREE.Points(glowGeo, glowMat));

  // ------------------------------------------------------- petal wind -----
  const N_PET = 900;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(N_PET * 3);
  const pet = []; // {vy, phase, ground, gx, gz}
  for (let i = 0; i < N_PET; i++) {
    const a = hash(i, 501) * TAU;
    const r = Math.sqrt(hash(i, 502)) * 240;
    const x = Math.cos(a) * r, z = 80 + Math.sin(a) * r * 0.9 - 60;
    const g = H(x, z);
    pPos[i * 3] = x;
    pPos[i * 3 + 1] = g + hash(i, 503) * 26;
    pPos[i * 3 + 2] = z;
    pet.push({ vy: 0.45 + hash(i, 504) * 0.5, phase: hash(i, 505) * TAU, ground: g });
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const petals = new THREE.Points(pGeo, new THREE.PointsMaterial({
    map: petalTexture(), size: 0.3, transparent: true, depthWrite: false,
    alphaTest: 0.04, color: '#ffd0de', sizeAttenuation: true,
  }));
  petals.frustumCulled = false;
  scene.add(petals);
  let petCursor = 0;

  // --------------------------------------------------------- bell state ---
  let bellSwing = 0;
  const bellPos = new THREE.Vector3(BX, SY + 2.4, BZ);

  return {
    bellPos,
    ringBell() { bellSwing = 1; },
    update(t, dt) {
      // petals: fall + flutter; resample ground on a rolling cursor
      const arr = pGeo.attributes.position.array;
      for (let i = 0; i < N_PET; i++) {
        const p = pet[i];
        arr[i * 3] += (Math.sin(t * 1.7 + p.phase) * 0.55 + 0.85) * dt;      // wind east
        arr[i * 3 + 1] -= p.vy * dt;
        arr[i * 3 + 2] += Math.cos(t * 1.3 + p.phase * 1.7) * 0.5 * dt;
        if (arr[i * 3 + 1] < p.ground - 0.2) {
          arr[i * 3 + 1] = p.ground + 18 + hash(i, (t * 10) | 0) * 12;
          arr[i * 3] -= 30 + hash(i, 507) * 30; // recycle upwind
        }
      }
      for (let k = 0; k < 12; k++) { // rolling ground refresh (12 petals/frame)
        const i = petCursor = (petCursor + 1) % N_PET;
        pet[i].ground = H(arr[i * 3], arr[i * 3 + 2]);
      }
      pGeo.attributes.position.needsUpdate = true;

      // islands bob; waterfalls scroll
      for (const g of islandGroups) {
        g.position.y = g.userData.baseY + Math.sin(t * 0.07 + g.userData.phase) * 2.2;
      }
      for (const m of wfMats) m.uniforms.uTime.value = t;
      waterMat.uniforms.uTime.value = t;

      // bell swing decay
      if (bellSwing > 0.001) {
        bellGroup.rotation.x = Math.sin(t * 7) * 0.075 * bellSwing;
        bellSwing *= Math.exp(-dt * 0.8);
      }
      // lantern glow breathing
      glowMat.opacity = 0.82 + Math.sin(t * 2.3) * 0.08 + Math.sin(t * 5.1) * 0.04;
    },
  };
}
