// js/dragon.js — the guardian ryū. An Eastern dragon is a RIBBON, not a bird:
// the whole animal is a chain of 56 vertebrae where segment i simply keeps a
// fixed distance from segment i-1 every frame. The head flies; the body
// follows; every bend the head takes travels down the spine for free. A
// sine-wave lateral+vertical sway is layered on top AT RENDER TIME only, so
// the physics chain stays stable while the body never stops swimming.
//
// Draw calls: vertebrae (1 InstancedMesh) + dorsal fins (1) + head jade (1)
// + head gold (antlers/whiskers, 1) + mane (1) + eyes (1) + one PointLight.
//
// Modes: ambient (high patrol loop over the valley) → summon → descends to a
// low circle over the shrine (ambientLow) → R → come (swoops to the player)
// → ride (steers where you look; Space/C climb & dive, Shift boosts) → R →
// return (rejoins the low circle). The player NEVER owns the dragon's state
// machine — main.js only calls summon() / toggleRide().

import * as THREE from 'three';
import { TAU, SHRINE } from './layout.js';
import { H } from './terrain.js';

const N = 56;
const SPACING = 1.05;
const UP = new THREE.Vector3(0, 1, 0);

export function createDragon(scene, opts) {
  const { getPlayerPos, getLookDir, isDown } = opts;

  // ---------------------------------------------------------- geometry ----
  // vertebra: unit-radius ring along +Z with a gold belly baked as colors
  const vertGeo = new THREE.CylinderGeometry(1, 0.94, SPACING * 1.7, 10, 1);
  vertGeo.rotateX(Math.PI / 2);
  {
    const p = vertGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    const jade = new THREE.Color('#2f8a68');
    const jadeD = new THREE.Color('#1e5c46');
    const gold = new THREE.Color('#d8b25e');
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = THREE.MathUtils.smoothstep(y, -0.75, 0.15);
      c.copy(gold).lerp(jade, t);
      if (y > 0.6) c.lerp(jadeD, 0.35); // darker spine line
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    vertGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const body = new THREE.InstancedMesh(
    vertGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2, emissive: '#0f3325', emissiveIntensity: 0.9 }),
    N
  );
  body.frustumCulled = false;
  scene.add(body);

  const spikeIdx = [];
  for (let i = 4; i <= 46; i += 2) spikeIdx.push(i);
  const spikeGeo = new THREE.ConeGeometry(0.34, 1.35, 5);
  spikeGeo.rotateX(-0.5); // swept back
  const spikes = new THREE.InstancedMesh(
    spikeGeo,
    new THREE.MeshStandardMaterial({ color: '#e0574a', roughness: 0.5, metalness: 0.1, emissive: '#4d130c' }),
    spikeIdx.length
  );
  spikes.frustumCulled = false;
  scene.add(spikes);

  // radius profile: slim neck → deep chest → whip tail
  const RAD = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    let r = 0.42 + 0.6 * Math.pow(Math.sin(Math.min(1, u * 1.4) * Math.PI * 0.72), 1.15);
    r *= 1 - THREE.MathUtils.smoothstep(u, 0.68, 1) * 0.85;
    RAD.push(Math.max(0.09, r));
  }

  // ------------------------------------------------------------- head -----
  const head = new THREE.Group();
  const jadeMat = new THREE.MeshStandardMaterial({ color: '#2f8a68', roughness: 0.55, metalness: 0.2, emissive: '#0f3325', emissiveIntensity: 0.9 });
  const goldMat = new THREE.MeshStandardMaterial({ color: '#c9a86a', roughness: 0.4, metalness: 0.6, emissive: '#2e2210' });
  const coralMat = new THREE.MeshStandardMaterial({ color: '#e0574a', roughness: 0.55, emissive: '#4d130c' });
  const bx = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
    g.translate(x, y, z);
    return g;
  };
  const face = new THREE.Mesh(mergeGeos([
    bx(1.5, 1.12, 1.6, 0, 0.05, 0.15),           // skull
    bx(1.02, 0.62, 1.5, 0, -0.1, 1.5),            // snout
    bx(0.9, 0.26, 1.3, 0, -0.62, 1.35, 0.14),     // jaw, slightly open
    bx(0.5, 0.22, 0.55, -0.52, 0.62, 0.75),       // brows
    bx(0.5, 0.22, 0.55, 0.52, 0.62, 0.75),
  ]), jadeMat);
  head.add(face);
  const antler = (sx) => {
    const parts = [];
    const main = new THREE.CylinderGeometry(0.05, 0.09, 1.6, 6);
    main.translate(0, 0.8, 0);
    main.rotateX(-0.95);
    main.rotateZ(sx * 0.35);
    main.translate(sx * 0.42, 0.55, -0.15);
    parts.push(main);
    const tine = new THREE.CylinderGeometry(0.03, 0.06, 0.9, 5);
    tine.translate(0, 0.45, 0);
    tine.rotateX(-0.25);
    tine.rotateZ(sx * 0.55);
    tine.translate(sx * 0.62, 0.95, -0.75);
    parts.push(tine);
    return parts;
  };
  const whisker = (sx) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.42, -0.15, 1.95),
      new THREE.Vector3(sx * 1.15, -0.3, 2.6),
      new THREE.Vector3(sx * 1.65, -0.85, 2.3),
      new THREE.Vector3(sx * 1.45, -1.45, 1.5),
    ]);
    return new THREE.TubeGeometry(curve, 14, 0.032, 5);
  };
  head.add(new THREE.Mesh(mergeGeos([...antler(1), ...antler(-1), whisker(1), whisker(-1)]), goldMat));
  const maneParts = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const g = new THREE.ConeGeometry(0.3, 1.5, 5);
    g.translate(0, 0.75, 0);
    g.rotateX(Math.PI * 0.62);            // point backward
    g.rotateZ(0);
    const r = 0.72;
    g.translate(Math.cos(a) * r, Math.sin(a) * r * 0.9, -0.75);
    maneParts.push(g);
  }
  head.add(new THREE.Mesh(mergeGeos(maneParts), coralMat));
  const eyeGeo = mergeGeos([
    (() => { const s = new THREE.SphereGeometry(0.16, 8, 6); s.translate(-0.5, 0.22, 1.0); return s; })(),
    (() => { const s = new THREE.SphereGeometry(0.16, 8, 6); s.translate(0.5, 0.22, 1.0); return s; })(),
  ]);
  head.add(new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: '#ffd66e' })));
  const glow = new THREE.PointLight('#ffc27a', 40, 26, 2);
  glow.position.set(0, 0.3, 1.2);
  head.add(glow);
  head.scale.setScalar(1.45);
  scene.add(head);

  function mergeGeos(arr) {
    // (BufferGeometryUtils would also do — tiny local merge keeps this file
    // self-contained since every part here shares position/normal/uv)
    let total = 0;
    for (const g of arr) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const idx = [];
    let vo = 0;
    for (const g of arr) {
      const gg = g.index ? g : g;
      pos.set(gg.attributes.position.array, vo * 3);
      nor.set(gg.attributes.normal.array, vo * 3);
      uv.set(gg.attributes.uv.array, vo * 2);
      const gi = gg.index ? gg.index.array : null;
      if (gi) for (let k = 0; k < gi.length; k++) idx.push(gi[k] + vo);
      else for (let k = 0; k < gg.attributes.position.count; k++) idx.push(k + vo);
      vo += gg.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(idx);
    return out;
  }

  // ------------------------------------------------------- flight paths ---
  function sampleLoop(pts) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), true);
    const samples = curve.getSpacedPoints(700);
    let len = 0;
    for (let i = 1; i < samples.length; i++) len += samples[i].distanceTo(samples[i - 1]);
    return { samples, len };
  }
  const HIGH = sampleLoop([
    [150, 70, -90], [20, 95, -175], [-145, 85, -70],
    [-165, 115, 60], [-40, 125, 175], [125, 80, 145],
  ]);
  const lowPts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    lowPts.push([SHRINE.x + Math.cos(a) * 34, SHRINE.y + 15 + Math.sin(a * 2) * 3, SHRINE.z + Math.sin(a) * 34]);
  }
  const LOW = sampleLoop(lowPts);
  const loopPoint = (loop, u, out) => {
    const f = ((u % 1) + 1) % 1 * (loop.samples.length - 1);
    const i = Math.floor(f);
    return out.copy(loop.samples[i]).lerp(loop.samples[Math.min(i + 1, loop.samples.length - 1)], f - i);
  };

  // ----------------------------------------------------------- state ------
  const raw = [];       // the physics chain
  const disp = [];      // chain + swim offsets (what gets rendered)
  const fwd = [], rgt = [], up2 = [];
  for (let i = 0; i < N; i++) {
    raw.push(new THREE.Vector3(150 - i * SPACING, 70, -90));
    disp.push(new THREE.Vector3());
    fwd.push(new THREE.Vector3(1, 0, 0));
    rgt.push(new THREE.Vector3(0, 0, 1));
    up2.push(new THREE.Vector3(0, 1, 0));
  }
  let mode = 'ambient';   // ambient | descend | ambientLow | come | ride | return
  let summoned = false;
  let riding = false;
  let uu = 0;
  let phase = 0;
  let bank = 0;
  let headingPrev = 0;
  const vel = new THREE.Vector3(10, 0, 0);
  const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _w = new THREE.Vector3();
  const api = {
    head, riding: false, summoned: false, mode: 'ambient',
    speed: 0,
    onRoar: null, onMount: null, onDismount: null,
    saddle: new THREE.Vector3(),
    saddleUp: new THREE.Vector3(0, 1, 0),
  };

  function steer(target, speed, dt, gain = 1.6) {
    _d.copy(target).sub(raw[0]).normalize().multiplyScalar(speed);
    vel.lerp(_d, 1 - Math.exp(-gain * dt));
    raw[0].addScaledVector(vel, dt);
  }

  api.summon = () => {
    if (summoned) return;
    summoned = true;
    api.summoned = true;
    mode = 'descend';
    api.onRoar?.();
  };
  api.toggleRide = () => {
    if (!summoned) return false;
    if (riding) {
      riding = false;
      api.riding = false;
      mode = 'return';
      api.onDismount?.();
    } else if (mode !== 'come') {
      mode = 'come';
      api.onRoar?.();
    }
    return true;
  };

  // ------------------------------------------------------------ update ----
  api.update = (t, dt) => {
    const speedNow = vel.length();
    api.speed = speedNow;
    phase += dt * (2.0 + speedNow * 0.045);

    // --- head motion per mode ---
    if (mode === 'ambient' || mode === 'ambientLow') {
      const loop = mode === 'ambient' ? HIGH : LOW;
      const spd = mode === 'ambient' ? 13 : 9;
      uu = (uu + (dt * spd) / loop.len) % 1;
      loopPoint(loop, uu, _t);
      // gentle weave so the patrol never looks railed
      _t.x += Math.sin(t * 0.7) * 4;
      _t.y += Math.sin(t * 0.53) * 2.5;
      _t.z += Math.cos(t * 0.61) * 4;
      vel.copy(_t).sub(raw[0]).divideScalar(Math.max(dt, 1e-4)).clampLength(0, 60);
      raw[0].copy(_t);
    } else if (mode === 'descend') {
      loopPoint(LOW, uu, _t);
      steer(_t, 26, dt, 1.8);
      if (raw[0].distanceTo(_t) < 8) mode = 'ambientLow';
    } else if (mode === 'come') {
      const pp = getPlayerPos(_w);
      const look = getLookDir(_d.set(0, 0, -1));
      _t.copy(pp).addScaledVector(look, 9);
      _t.y = Math.max(_t.y + 2.0, H(_t.x, _t.z) + 3);
      steer(_t, 40, dt, 2.2);
      if (raw[0].distanceTo(pp) < 11) {
        mode = 'ride';
        riding = true;
        api.riding = true;
        api.onMount?.();
      }
    } else if (mode === 'ride') {
      const look = getLookDir(_d.set(0, 0, -1));
      const boost = isDown('ShiftLeft') || isDown('ShiftRight');
      const spd = boost ? 46 : 21;
      _t.copy(look).multiplyScalar(spd);
      if (isDown('Space')) _t.y += 14;
      if (isDown('KeyC')) _t.y -= 14;
      // soft world bounds: fold the request back toward the valley
      const rr = Math.hypot(raw[0].x, raw[0].z);
      if (rr > 780) {
        _w.set(-raw[0].x, 0, -raw[0].z).normalize().multiplyScalar(spd);
        _t.lerp(_w, THREE.MathUtils.smoothstep(rr, 780, 900));
      }
      vel.lerp(_t, 1 - Math.exp(-1.7 * dt));
      raw[0].addScaledVector(vel, dt);
      const floor = H(raw[0].x, raw[0].z) + 2.6;
      if (raw[0].y < floor) { raw[0].y = floor; vel.y = Math.max(vel.y, 0); }
      if (raw[0].y > 380) { raw[0].y = 380; vel.y = Math.min(vel.y, 0); }
    } else if (mode === 'return') {
      loopPoint(LOW, uu, _t);
      steer(_t, 22, dt, 1.6);
      if (raw[0].distanceTo(_t) < 7) mode = 'ambientLow';
    }

    // --- banking from turn rate ---
    const heading = Math.atan2(vel.x, vel.z);
    let dh = heading - headingPrev;
    if (dh > Math.PI) dh -= TAU;
    if (dh < -Math.PI) dh += TAU;
    headingPrev = heading;
    const bankTarget = THREE.MathUtils.clamp((-dh / Math.max(dt, 1e-4)) * 0.32, -0.65, 0.65);
    bank += (bankTarget - bank) * (1 - Math.exp(-3.5 * dt));

    // --- the chain: each vertebra keeps SPACING from the one ahead ---
    for (let i = 1; i < N; i++) {
      _d.copy(raw[i]).sub(raw[i - 1]);
      const l = _d.length() || 1e-5;
      raw[i].copy(raw[i - 1]).addScaledVector(_d, SPACING / l);
    }

    // --- frames + swim offsets + instance matrices ---
    const swimAmp = Math.min(1.35, 0.4 + speedNow * 0.028);
    for (let i = 0; i < N; i++) {
      const a = raw[Math.max(0, i - 1)], b = raw[Math.min(N - 1, i + 1)];
      _d.copy(a).sub(b);
      if (_d.lengthSq() < 1e-6) _d.copy(fwd[i]);
      fwd[i].copy(_d.normalize());
      _w.crossVectors(UP, fwd[i]);
      if (_w.lengthSq() < 0.02) _w.copy(rgt[i]); // straight-up dive: keep last frame
      rgt[i].copy(_w.normalize());
      up2[i].crossVectors(fwd[i], rgt[i]);
      // roll the frame into the bank (fades toward the tail)
      const bk = bank * (1 - i / N * 0.6);
      if (Math.abs(bk) > 0.001) {
        const cb = Math.cos(bk), sb = Math.sin(bk);
        _w.copy(rgt[i]);
        rgt[i].multiplyScalar(cb).addScaledVector(up2[i], sb);
        up2[i].multiplyScalar(cb).addScaledVector(_w, -sb);
      }
      const fade = THREE.MathUtils.smoothstep(i, 0, 7); // head stays steady
      disp[i].copy(raw[i])
        .addScaledVector(rgt[i], Math.sin(phase - i * 0.42) * swimAmp * fade)
        .addScaledVector(up2[i], Math.cos(phase * 0.83 - i * 0.34) * 0.5 * fade);
    }
    const m = _m4, v1 = _v1, v2 = _v2, v3 = _v3;
    for (let i = 0; i < N; i++) {
      const r = RAD[i];
      v1.copy(rgt[i]).multiplyScalar(r);
      v2.copy(up2[i]).multiplyScalar(r);
      v3.copy(fwd[i]);
      m.makeBasis(v1, v2, v3);
      m.setPosition(disp[i]);
      body.setMatrixAt(i, m);
    }
    body.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < spikeIdx.length; k++) {
      const i = spikeIdx[k];
      const s = RAD[i] * 0.85;
      v1.copy(rgt[i]).multiplyScalar(s);
      v2.copy(up2[i]).multiplyScalar(s);
      v3.copy(fwd[i]).multiplyScalar(s);
      m.makeBasis(v1, v2, v3);
      m.setPosition(_t.copy(disp[i]).addScaledVector(up2[i], RAD[i] * 0.9));
      spikes.setMatrixAt(k, m);
    }
    spikes.instanceMatrix.needsUpdate = true;

    // head rides segment 0
    head.position.copy(disp[0]).addScaledVector(fwd[0], 1.0);
    m.makeBasis(rgt[0], up2[0], fwd[0]);
    head.quaternion.setFromRotationMatrix(m);

    // saddle = segment 3, just above the spine
    api.saddle.copy(disp[3]).addScaledVector(up2[3], RAD[3] + 1.15);
    api.saddleUp.copy(up2[3]);
    api.mode = mode;
  };

  const _m4 = new THREE.Matrix4();
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  api.headPos = raw[0];
  return api;
}
