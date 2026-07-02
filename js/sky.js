// js/sky.js — the dusk. A gradient shader dome (indigo zenith → magenta →
// ember horizon where the sun just sank), a twinkling star field, one huge
// low moon with a halo, drifting violet clouds, and all the scene lights.
// Everything here is fog:false — the dome IS the backdrop the fog fades into.

import * as THREE from 'three';
import { TAU, hash } from './layout.js';

export function createSky(scene) {
  // --- gradient dome ---
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1450, 32, 18),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      uniforms: { uSun: { value: new THREE.Vector3(-0.55, -0.06, 0.83).normalize() } },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform vec3 uSun;
        void main() {
          float h = clamp(vDir.y, -0.05, 1.0);
          vec3 zenith  = vec3(0.078, 0.055, 0.180);
          vec3 mid     = vec3(0.430, 0.180, 0.360);
          vec3 horizon = vec3(0.860, 0.420, 0.310);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
          c = mix(c, zenith, smoothstep(0.12, 0.65, h));
          // ember glow where the sun went down
          float g = pow(max(dot(normalize(vDir), uSun), 0.0), 4.0);
          c += vec3(0.55, 0.22, 0.08) * g * (1.0 - smoothstep(0.0, 0.4, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  dome.renderOrder = -10;
  scene.add(dome);

  // --- stars (upper dome only, per-star twinkle phase) ---
  const N_STARS = 1400;
  const sPos = new Float32Array(N_STARS * 3);
  const sPhase = new Float32Array(N_STARS);
  for (let i = 0; i < N_STARS; i++) {
    const a = hash(i, 1) * TAU;
    const y = 0.12 + hash(i, 2) * 0.88;             // altitude bias
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    sPos[i * 3] = Math.cos(a) * r * 1380;
    sPos[i * 3 + 1] = y * 1380;
    sPos[i * 3 + 2] = Math.sin(a) * r * 1380;
    sPhase[i] = hash(i, 3) * TAU;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sPhase, 1));
  const starMat = new THREE.ShaderMaterial({
    fog: false,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute float aPhase;
      uniform float uTime;
      varying float vA;
      void main() {
        vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 2.2 + aPhase));
        // stars fade near the bright horizon
        vA *= smoothstep(90.0, 420.0, position.y);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 1.4 + 1.6 * fract(aPhase * 7.31);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.12, length(d)) * vA;
        gl_FragColor = vec4(0.92, 0.93, 1.0, a);
      }`,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // --- moon: canvas disc + additive halo ---
  const mc = document.createElement('canvas');
  mc.width = mc.height = 256;
  const mg = mc.getContext('2d');
  const grad = mg.createRadialGradient(128, 128, 20, 128, 128, 128);
  grad.addColorStop(0, '#fff7e8');
  grad.addColorStop(0.72, '#f4e7cd');
  grad.addColorStop(0.98, '#e8d5b4');
  grad.addColorStop(1, 'rgba(232,213,180,0)');
  mg.fillStyle = grad;
  mg.fillRect(0, 0, 256, 256);
  mg.globalAlpha = 0.12; // faint maria
  mg.fillStyle = '#a89478';
  for (let i = 0; i < 26; i++) {
    const a = hash(i, 51) * TAU, rr = 20 + hash(i, 52) * 68;
    mg.beginPath();
    mg.arc(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr * 0.8, 6 + hash(i, 53) * 22, 0, TAU);
    mg.fill();
  }
  const moonTex = new THREE.CanvasTexture(mc);
  moonTex.colorSpace = THREE.SRGBColorSpace;
  const MOON_POS = new THREE.Vector3(640, 480, -900);
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(62, 40),
    new THREE.MeshBasicMaterial({ map: moonTex, fog: false, transparent: true, depthWrite: false })
  );
  moon.position.copy(MOON_POS);
  moon.lookAt(0, 0, 0);
  scene.add(moon);

  const hc = document.createElement('canvas');
  hc.width = hc.height = 128;
  const hg = hc.getContext('2d');
  const hGrad = hg.createRadialGradient(64, 64, 4, 64, 64, 64);
  hGrad.addColorStop(0, 'rgba(255,240,214,0.55)');
  hGrad.addColorStop(0.4, 'rgba(255,226,200,0.16)');
  hGrad.addColorStop(1, 'rgba(255,226,200,0)');
  hg.fillStyle = hGrad;
  hg.fillRect(0, 0, 128, 128);
  const haloTex = new THREE.CanvasTexture(hc);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTex, fog: false, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  halo.scale.setScalar(340);
  halo.position.copy(MOON_POS);
  scene.add(halo);

  // --- clouds: big soft violet sprites, drifting ---
  const cc = document.createElement('canvas');
  cc.width = 256; cc.height = 128;
  const cg = cc.getContext('2d');
  for (let i = 0; i < 46; i++) {
    const cx = 30 + hash(i, 61) * 196, cy = 34 + hash(i, 62) * 60;
    const cr = 14 + hash(i, 63) * 30;
    const g2 = cg.createRadialGradient(cx, cy, 2, cx, cy, cr);
    g2.addColorStop(0, 'rgba(255,255,255,0.10)');
    g2.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = g2;
    cg.fillRect(0, 0, 256, 128);
  }
  const cloudTex = new THREE.CanvasTexture(cc);
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, fog: false, transparent: true, depthWrite: false,
      color: new THREE.Color().setHSL(0.87 - hash(i, 71) * 0.06, 0.45, 0.62),
      opacity: 0.16 + hash(i, 72) * 0.12,
    }));
    const a = hash(i, 73) * TAU;
    sp.position.set(Math.cos(a) * (300 + hash(i, 74) * 600), 170 + hash(i, 75) * 190, Math.sin(a) * (300 + hash(i, 74) * 600));
    sp.scale.set(240 + hash(i, 76) * 260, 90 + hash(i, 77) * 90, 1);
    sp.userData.vx = 0.9 + hash(i, 78) * 1.4;
    scene.add(sp);
    clouds.push(sp);
  }

  // --- lights (this file owns the global lighting rig) ---
  scene.add(new THREE.HemisphereLight('#8a6aa0', '#232c1e', 0.95));
  const moonLight = new THREE.DirectionalLight('#aebfff', 1.6);
  moonLight.position.copy(MOON_POS);
  scene.add(moonLight, moonLight.target);
  scene.add(new THREE.AmbientLight('#2c2438', 1.0));

  return {
    update(t, dt) {
      starMat.uniforms.uTime.value = t;
      for (const c of clouds) {
        c.position.x += c.userData.vx * dt;
        if (c.position.x > 1000) c.position.x = -1000;
      }
    },
  };
}
