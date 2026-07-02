// js/selftest.js — in-page e2e (?selftest=1). Dispatches synthetic keyboard
// events through the REAL window listeners and walks the whole quest:
// spawn-walk forward → teleport to the bell → E → summon → R → mount → R →
// dismount. Results land in #selftest + document.title so a headless
// --dump-dom run can assert them. Never loaded in normal play.
//
// All waits are FRAME-based (rAF), not wall-clock: under headless
// virtual-time budgets setTimeout fast-forwards while rAF may not keep the
// same ratio, so ms-sleeps would assert against a world where no frame has
// run yet (the first version of this file did exactly that).

export async function runSelfTest(ryu) {
  const out = [];
  const el = document.createElement('div');
  el.id = 'selftest';
  el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99;color:#0f0;font:12px monospace;background:#000a;padding:4px';
  document.body.appendChild(el);
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
  const frames = (n) => new Promise((r) => {
    let k = 0;
    const f = () => { if (++k >= n) r(); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  const flush = () => { const l = 'SELFTEST ' + out.join(' | '); el.textContent = l; document.title = l; };
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.message).slice(0, 120)));

  await frames(10);
  // 1) W must walk TOWARD the shrine (-Z) from spawn
  const z0 = ryu.movement.pos.z;
  key('keydown', 'KeyW');
  await frames(120);
  key('keyup', 'KeyW');
  const dz = ryu.movement.pos.z - z0;
  out.push(`walkW dz=${dz.toFixed(1)} ${dz < -1 ? 'PASS' : 'FAIL'}`);
  flush();

  // 2) E at the bell must summon the dragon
  ryu.movement.teleport(9, 52);
  await frames(5); // camera syncs to feet on the next update
  key('keydown', 'KeyE');
  key('keyup', 'KeyE');
  await frames(5);
  out.push(`bellE summoned=${ryu.dragon.summoned} ${ryu.dragon.summoned ? 'PASS' : 'FAIL'}`);
  flush();

  // 3) R must bring the dragon (mode: come) and mount
  key('keydown', 'KeyR');
  key('keyup', 'KeyR');
  let mounted = false;
  for (let i = 0; i < 90; i++) {
    await frames(10);
    if (ryu.dragon.riding) { mounted = true; break; }
  }
  out.push(`rideR riding=${ryu.dragon.riding} mode=${ryu.dragon.mode} ${mounted ? 'PASS' : 'FAIL'}`);
  flush();

  // 4) fly a moment, then R must dismount and feather-fall to ground
  await frames(60);
  key('keydown', 'KeyR');
  key('keyup', 'KeyR');
  await frames(10);
  out.push(`dismount riding=${ryu.dragon.riding} ${!ryu.dragon.riding ? 'PASS' : 'FAIL'}`);
  flush();

  if (errs.length) out.push('ERRS: ' + errs.join(' ;; '));
  const line = 'SELFTEST ' + out.join(' | ');
  el.textContent = line;
  document.title = line;
  console.log(line);
}
