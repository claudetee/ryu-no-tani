// js/main.js — the shell. One renderer, one camera, one frame loop; the
// world modules (terrain/sky/scenery/dragon) each return { update } and the
// tiny quest here is deterministic: walk the torii road → ring the bell (E)
// → the guardian descends → R to ride. The dragon owns the camera while
// riding; movement owns it on foot; nobody else ever touches it.

import * as THREE from 'three';
import { SPAWN, SHRINE } from './layout.js';
import { createTerrain, H } from './terrain.js';
import { createSky } from './sky.js';
import { createScenery } from './scenery.js';
import { createDragon } from './dragon.js';
import { createMovement } from './movement.js';
import { createAudio } from './audio.js';

const q = new URLSearchParams(location.search);

// --- renderer / scene / camera ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
const MAX_PR = Math.min(window.devicePixelRatio, 2);
let currentPR = MAX_PR;
renderer.setPixelRatio(MAX_PR);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.38;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#33243f', 0.00135);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 3200);
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- build the world ---
createTerrain(scene);
const sky = createSky(scene);
const scenery = createScenery(scene);
const movement = createMovement(camera, renderer.domElement);
const audio = createAudio();
const dragon = createDragon(scene, {
  getPlayerPos: (out) => out.copy(camera.position),
  getLookDir: (out) => movement.lookDir(out),
  isDown: movement.isDown,
});
dragon.onRoar = () => audio.roar();

movement.teleport(SPAWN.x, SPAWN.z);

// --- UI ---
const $ = (id) => document.getElementById(id);
const intro = $('intro');
const objectiveEl = $('objective');
const toastEl = $('toast');
const hud = $('hud');
const hudBase = hud.textContent;
let toastTimer = 0;
function toast(text, ms = 3800) {
  toastEl.textContent = text;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), ms);
}
function objective(text) {
  objectiveEl.textContent = text;
  objectiveEl.classList.add('visible');
}

// --- the quest (a 4-state director; predicates are machine-checked) ---
// 0 walk the road · 1 ring the bell · 2 mount · 3 flying
let stage = 0;
objective('鳥居をくぐって — follow the torii road north');
setTimeout(() => intro.classList.add('hidden'), 14000);

const audioArm = () => audio.ensure();
window.addEventListener('pointerdown', audioArm);
window.addEventListener('keydown', audioArm);

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') {
    const dxB = camera.position.x - scenery.bellPos.x;
    const dzB = camera.position.z - scenery.bellPos.z;
    if (dxB * dxB + dzB * dzB < 110) {
      scenery.ringBell();
      audio.bell();
      if (!dragon.summoned) {
        dragon.summon();
        stage = 2;
        objective('竜に乗れ — press R to ride the guardian');
        toast('The mountain answers. Something vast is descending…', 5200);
      }
    } else if (!dragon.summoned) {
      toast('The bell hangs in the small pavilion on the plaza — get closer.');
    }
  }
  if (e.code === 'KeyR') {
    if (!dragon.summoned) {
      toast('The guardian sleeps. Ring the shrine bell first.');
      return;
    }
    if (dragon.riding) {
      dragon.toggleRide();
      movement.startFall(camera.position);
      stage = 2;
      objective('竜に乗れ — press R to ride again');
      toast('You drift down like a petal.');
    } else {
      dragon.toggleRide();
      toast('The dragon banks toward you — hold on.');
    }
  }
});
dragon.onMount = () => {
  stage = 3;
  objective('space rise · C dive · shift boost · R dismount');
  toast('You are riding the guardian of the valley.', 4200);
};

// intro dismiss on first movement
window.addEventListener('keydown', (e) => {
  if (/^(KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(e.code)) {
    intro.classList.add('hidden');
  }
}, { once: true });

// --- screenshot/harness presets: ?view=overview|shrine|dragon|pagoda ---
const VIEW = q.get('view');
const viewFixed = !!VIEW;
if (VIEW) {
  intro.classList.add('hidden');
  const set = (x, y, z, lx, ly, lz) => {
    camera.position.set(x, y, z);
    camera.lookAt(lx, ly, lz);
  };
  if (VIEW === 'overview') set(120, 85, 200, 0, 22, -20);
  else if (VIEW === 'shrine') set(14, 16, 78, 0, 15, 30);
  else if (VIEW === 'pagoda') set(34, 34, 24, 0, 42, -40);
  else if (VIEW === 'dragon') set(130, 78, -50, 60, 78, -140);
  else if (VIEW === 'road') set(2, 9.5, 210, -4, 9, 150);
}

// --- frame loop ---
const clock = new THREE.Clock();
let frameAvg = 16;
let prCool = 0;
let fpsN = 0, fpsT = 0;
const listener = new THREE.Vector3();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  dragon.update(t, dt);
  if (dragon.riding) {
    camera.position.lerp(dragon.saddle, 1 - Math.exp(-14 * dt));
    movement.applyLook();
  } else if (!viewFixed) {
    movement.update(t, dt);
  }

  // stage-1 trigger: reaching the plaza promotes the objective
  if (stage === 0 && Math.hypot(camera.position.x - SHRINE.x, camera.position.z - SHRINE.z) < 26) {
    stage = 1;
    objective('鐘を鳴らせ — ring the bell (E)');
    toast('The bronze bell waits by the shrine.');
  }

  sky.update(t, dt);
  scenery.update(t, dt);
  audio.update(t, dt, listener.copy(camera.position), { rideSpeed: dragon.riding ? dragon.speed : 0 });

  renderer.render(scene, camera);

  // adaptive resolution — hold ~60 fps by stepping pixel ratio
  frameAvg += (dt * 1000 - frameAvg) * 0.05;
  prCool -= dt;
  if (prCool <= 0) {
    let next = currentPR;
    if (frameAvg > 19 && currentPR > 1.0) next = Math.max(1.0, currentPR - 0.25);
    else if (frameAvg < 12.5 && currentPR < MAX_PR) next = Math.min(MAX_PR, currentPR + 0.25);
    if (next !== currentPR) {
      currentPR = next;
      renderer.setPixelRatio(currentPR);
      renderer.setSize(window.innerWidth, window.innerHeight);
      prCool = 1.5;
    }
  }

  // fps readout
  fpsN++; fpsT += dt;
  if (fpsT >= 0.5) {
    hud.textContent = `${hudBase} · ${Math.round(fpsN / fpsT)} fps`;
    fpsN = 0; fpsT = 0;
  }
});

document.getElementById('loading').style.opacity = '0';

// --- harness hooks ---
window.__ryu = { scene, camera, renderer, movement, dragon, scenery, get stage() { return stage; }, ready: true };
// in-page e2e: synthetic keys walk the whole quest, results land in the DOM
if (q.get('selftest') === '1') import('./selftest.js').then((m) => m.runSelfTest(window.__ryu));
