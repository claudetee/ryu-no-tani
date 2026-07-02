// js/layout.js — the single source of truth for WHERE things are.
// Pure data + tiny math; terrain.js and scenery.js both import from here so
// the ground and the buildings can never disagree.

export const TAU = Math.PI * 2;
export const WATER_Y = 2.0;

// The valley runs south (spawn, +z) to north (shrine → pagoda hill, -z).
export const SPAWN = { x: 0, z: 236 };
export const SHRINE = { x: 0, z: 40, y: 12, r: 28 };   // flattened plaza
export const PAGODA = { x: 0, z: -40, y: 27 };          // hilltop
export const BELL = { x: 9, z: 48 };
export const LAKE = { x: 170, z: 190, rx: 135, rz: 105 };

// Torii path polyline (x, z) — spawn to plaza edge.
export const PATH_PTS = [
  [0, 236], [9, 192], [-11, 144], [7, 98], [1, 66], [0, 52],
];

// deterministic hash — layout must be identical on every load
export function hash(ix, iz) {
  let n = (ix * 374761393 + iz * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967296;
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// --- path helpers (arc-length parameterized over the polyline) ---
const segLen = [];
let pathLen = 0;
for (let i = 0; i < PATH_PTS.length - 1; i++) {
  const dx = PATH_PTS[i + 1][0] - PATH_PTS[i][0];
  const dz = PATH_PTS[i + 1][1] - PATH_PTS[i][1];
  const l = Math.hypot(dx, dz);
  segLen.push(l);
  pathLen += l;
}
export function pathPoint(t) {
  let d = Math.min(0.9999, Math.max(0, t)) * pathLen;
  for (let i = 0; i < segLen.length; i++) {
    if (d <= segLen[i]) {
      const f = d / segLen[i];
      return [
        PATH_PTS[i][0] + (PATH_PTS[i + 1][0] - PATH_PTS[i][0]) * f,
        PATH_PTS[i][1] + (PATH_PTS[i + 1][1] - PATH_PTS[i][1]) * f,
      ];
    }
    d -= segLen[i];
  }
  return [...PATH_PTS[PATH_PTS.length - 1]];
}
export function pathTangent(t) {
  const a = pathPoint(Math.max(0, t - 0.01));
  const b = pathPoint(Math.min(1, t + 0.01));
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}
export function distToPath(x, z) {
  let best = Infinity;
  for (let i = 0; i < PATH_PTS.length - 1; i++) {
    const ax = PATH_PTS[i][0], az = PATH_PTS[i][1];
    const bx = PATH_PTS[i + 1][0], bz = PATH_PTS[i + 1][1];
    const dx = bx - ax, dz = bz - az;
    let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - x, pz = az + dz * t - z;
    const d = px * px + pz * pz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
// the walking ramp the terrain flattens toward: spawn ~6 m → plaza 12 m
export function pathRampY(z) {
  const t = Math.min(1, Math.max(0, (236 - z) / (236 - 52)));
  return 6 + t * 6;
}

// --- sakura tree positions (x, z, s=scale) ---
export const TREES = [];
for (let i = 0; i < 14; i++) {
  const t = (i + 0.5) / 14;
  const p = pathPoint(t);
  const tg = pathTangent(t);
  const nx = -tg[1], nz = tg[0];
  for (const side of [-1, 1]) {
    if (hash(i, side + 3) < 0.25) continue;
    const off = 10 + hash(i, side) * 8;
    TREES.push({
      x: p[0] + nx * off * side + (hash(i, side + 7) - 0.5) * 5,
      z: p[1] + nz * off * side + (hash(i, side + 11) - 0.5) * 5,
      s: 0.85 + hash(i, side + 5) * 0.6,
    });
  }
}
for (let i = 0; i < 8; i++) { // plaza ring
  const a = (i / 8) * TAU + 0.35;
  TREES.push({ x: SHRINE.x + Math.cos(a) * 23, z: SHRINE.z + Math.sin(a) * 23, s: 1.0 + hash(i, 99) * 0.5 });
}
for (let i = 0; i < 12; i++) { // west grove
  TREES.push({ x: -55 - hash(i, 201) * 75, z: 55 + hash(i, 202) * 115, s: 0.8 + hash(i, 203) * 0.8 });
}

// --- stone lantern positions along the path + plaza ring ---
export const LANTERNS = [];
for (let i = 0; i < 9; i++) {
  const t = 0.06 + (i / 9) * 0.88;
  const p = pathPoint(t);
  const tg = pathTangent(t);
  const side = i % 2 ? 1 : -1;
  LANTERNS.push({ x: p[0] - tg[1] * 4.2 * side, z: p[1] + tg[0] * 4.2 * side });
}
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * TAU + 0.15;
  LANTERNS.push({ x: SHRINE.x + Math.cos(a) * 13, z: SHRINE.z + Math.sin(a) * 13 });
}

// --- floating islands (the isekai skyline; also the flight destinations) ---
export const ISLANDS = [
  { x: -95, z: -150, y: 148, r: 26, h: 42, deco: 'pagoda' },
  { x: 135, z: -60, y: 118, r: 16, h: 26, deco: 'torii' },
  { x: 60, z: 130, y: 172, r: 20, h: 32, deco: 'tree' },
  { x: -165, z: 55, y: 198, r: 31, h: 50, deco: 'shrine' },
  { x: 230, z: -170, y: 150, r: 13, h: 22, deco: 'tree' },
];
