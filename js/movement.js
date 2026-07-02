// js/movement.js — first-person walking. Pointer-lock mouse look (yaw/pitch,
// 'YXZ' so the horizon never rolls), WASD on the terrain heightfield, a run
// key, a soft jump, gentle head-bob, and a feather-fall used when the player
// dismounts the dragon mid-air (an isekai protagonist does not take fall
// damage from their own dragon).

import * as THREE from 'three';
import { H } from './terrain.js';

export function createMovement(camera, dom) {
  const keys = new Set();
  const pos = new THREE.Vector3(0, 0, 0); // feet
  let yaw = 0;                             // face north = -Z (down the torii road)
  let pitch = 0;
  let velY = 0;
  let grounded = true;
  let feather = false;                     // slow-fall after dismount
  let bobT = 0;
  let locked = false;
  const EYE = 1.65;

  dom.addEventListener('click', () => {
    if (!locked) dom.requestPointerLock?.();
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === dom;
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    yaw -= e.movementX * 0.0023;
    pitch -= e.movementY * 0.0023;
    pitch = Math.max(-1.45, Math.min(1.45, pitch));
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const look = new THREE.Vector3();
  const api = {
    pos,
    keys,
    get locked() { return locked; },
    isDown: (c) => keys.has(c),
    lookDir(out = look) {
      out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      return out;
    },
    teleport(x, z) {
      pos.set(x, H(x, z), z);
      velY = 0;
    },
    startFall(from) {
      pos.copy(from);
      pos.y -= EYE;
      velY = 0;
      feather = true;
      grounded = false;
    },
    // main.js calls this only when NOT riding
    update(t, dt) {
      let mx = 0, mz = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
      const moving = mx !== 0 || mz !== 0;
      if (moving) {
        const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
        const spd = (run ? 11.5 : 5.4) * (feather ? 0.5 : 1);
        const l = Math.hypot(mx, mz);
        const s = Math.sin(yaw), c = Math.cos(yaw);
        // camera-relative: -z is forward
        // right = (cos yaw, 0, -sin yaw), forward = (-sin yaw, 0, -cos yaw);
        // W gives mz=-1 → +forward. (v1 had the mz sign flipped: W walked
        // backward — the moedisk playtest bug.)
        pos.x += ((mx * c + mz * s) / l) * spd * dt;
        pos.z += ((mz * c - mx * s) / l) * spd * dt;
        bobT += dt * (run ? 11 : 7.5);
      }
      const ground = H(pos.x, pos.z);
      if (grounded && keys.has('Space')) {
        velY = 5.6;
        grounded = false;
      }
      if (!grounded || pos.y > ground + 0.01) {
        const g = feather ? 3.2 : 18;
        velY = Math.max(velY - g * dt, feather ? -7 : -40);
        pos.y += velY * dt;
        if (pos.y <= ground) {
          pos.y = ground;
          velY = 0;
          grounded = true;
          feather = false;
        }
      } else {
        pos.y = ground;
        grounded = true;
      }
      const bob = grounded && moving ? Math.sin(bobT) * 0.05 : 0;
      camera.position.set(pos.x, pos.y + EYE + bob, pos.z);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      return moving;
    },
    // while riding, the dragon owns camera.position — we still own rotation
    applyLook() {
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    },
  };
  camera.rotation.order = 'YXZ';
  return api;
}
