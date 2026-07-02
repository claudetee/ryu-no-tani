// js/audio.js — the valley's soundscape, 100% synthesized WebAudio, zero
// assets (the storyhopper/hogwarts recipe): filtered-noise beds, slow LFO
// swells, stochastic transients. The WHOLE graph is pooled — every voice is
// a persistent chain built once, and "events" are gain/frequency automation.
//
// Voices: wind (always; gusts), furin wind-chime (near the shrine; rings
// harder when the wind gusts — the chime LISTENS to the same gust envelope),
// crickets (grove), lake laps (shore), ride-wind (speed-driven), the bonshō
// bell (inharmonic partials, ~9 s decay), and the dragon's roar.

export function createAudio() {
  let ctx = null;
  let master = null;
  const chains = {};
  let gustLevel = 0;

  function noiseBuffer(seconds = 2) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { // brown-ish noise
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }
  function noiseVoice(filterType, freq, q, gain0) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(2 + Math.random());
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain0;
    src.connect(f).connect(g).connect(master);
    src.start();
    return { src, f, g };
  }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    chains.wind = noiseVoice('lowpass', 380, 0.4, 0.06);
    chains.gorge = noiseVoice('bandpass', 900, 2.5, 0.0); // whistle layer for altitude
    chains.lake = noiseVoice('lowpass', 240, 0.6, 0.0);
    chains.ride = noiseVoice('bandpass', 620, 0.8, 0.0);
    chains.crick = noiseVoice('bandpass', 4300, 12, 0.0);
    // cricket chirp pattern: an LFO-gated gain INSIDE the chain
    const cg = ctx.createGain();
    cg.gain.value = 0;
    chains.crick.g.disconnect();
    chains.crick.g.connect(cg).connect(master);
    chains.crickGate = cg;
  }

  // --- furin: tiny FM bell, randomly triggered, gust-driven ---
  function chime(when, vol) {
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    const g = ctx.createGain();
    const f0 = 1900 + Math.random() * 1400;
    car.frequency.value = f0;
    mod.frequency.value = f0 * 2.76;
    mg.gain.value = f0 * 0.6;
    mod.connect(mg).connect(car.frequency);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.6 + Math.random());
    car.connect(g).connect(master);
    car.start(when);
    mod.start(when);
    car.stop(when + 3);
    mod.stop(when + 3);
  }

  // --- the bonshō: inharmonic partials + strike noise, long decay ---
  function bell() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const f0 = 88;
    const partials = [
      [1.0, 0.9, 9.0], [2.0, 0.5, 7.0], [2.98, 0.34, 5.5],
      [4.21, 0.2, 4.0], [5.44, 0.12, 2.8], [7.2, 0.07, 1.8],
    ];
    for (const [ratio, amp, dur] of partials) {
      for (const det of [-0.7, 0.7]) { // beating pair — the "hum" of a real bell
        const o = ctx.createOscillator();
        o.frequency.value = f0 * ratio + det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(amp * 0.16, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g).connect(master);
        o.start(t0);
        o.stop(t0 + dur + 0.1);
      }
    }
    const strike = ctx.createBufferSource();
    strike.buffer = noiseBuffer(0.3);
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.value = 640;
    sf.Q.value = 1.2;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.5, t0);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    strike.connect(sf).connect(sg).connect(master);
    strike.start(t0);
  }

  // --- the roar: detuned saw sub + swept noise snarl ---
  function roar() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    for (const f of [57, 58.2, 86]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 1.25, t0);
      o.frequency.exponentialRampToValueAtTime(f, t0 + 0.9);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 340;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.16, t0 + 0.1);
      g.gain.setValueAtTime(0.16, t0 + 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.7);
      o.connect(lp).connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + 2);
    }
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, t0);
    bp.frequency.exponentialRampToValueAtTime(320, t0 + 1.2);
    bp.Q.value = 1.6;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t0);
    ng.gain.linearRampToValueAtTime(0.1, t0 + 0.12);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.5);
    n.connect(bp).connect(ng).connect(master);
    n.start(t0);
  }

  let nextChime = 0;
  let nextGust = 0;
  let crickPhase = 0;

  return {
    ensure,
    bell,
    roar,
    update(t, dt, listener, info) {
      if (!ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;

      // gusts: a slow random swell every 6–14 s; everything else listens to it
      if (now > nextGust) {
        nextGust = now + 6 + Math.random() * 8;
        const peak = 0.4 + Math.random() * 0.6;
        gustLevel = peak;
        chains.wind.g.gain.cancelScheduledValues(now);
        chains.wind.g.gain.setTargetAtTime(0.06 + peak * 0.07, now, 1.4);
        chains.wind.g.gain.setTargetAtTime(0.06, now + 3, 2.5);
      }
      gustLevel *= Math.exp(-dt * 0.25);

      // altitude whistle (riding high)
      const alt = Math.max(0, listener.y - 40);
      chains.gorge.g.gain.setTargetAtTime(Math.min(0.05, alt * 0.0005), now, 0.8);

      // ride wind from dragon speed
      const spd = info.rideSpeed || 0;
      chains.ride.g.gain.setTargetAtTime(Math.min(0.16, spd * 0.0035), now, 0.35);
      chains.ride.f.frequency.setTargetAtTime(420 + spd * 14, now, 0.4);

      // lake laps by distance to shore
      const dLake = Math.hypot(listener.x - 170, listener.z - 190);
      chains.lake.g.gain.setTargetAtTime(
        0.035 * (1 - Math.min(1, Math.max(0, (dLake - 90) / 120))), now, 1.2);

      // crickets in the west grove, gated chirp trains
      const dGrove = Math.hypot(listener.x + 92, listener.z - 110);
      const crickVol = 0.05 * (1 - Math.min(1, Math.max(0, (dGrove - 40) / 90)));
      crickPhase += dt;
      const train = crickPhase % 2.3 < 1.1 ? (Math.sin(crickPhase * 2 * Math.PI * 11) > 0 ? 1 : 0) : 0;
      chains.crickGate.gain.setTargetAtTime(crickVol * train, now, 0.01);

      // furin near the shrine — more when gusty
      const dShrine = Math.hypot(listener.x - 0, listener.z - 40);
      if (now > nextChime && dShrine < 70) {
        const prox = 1 - dShrine / 70;
        nextChime = now + (2 + Math.random() * 9) / (0.4 + gustLevel);
        chime(now + Math.random() * 0.2, 0.05 * prox * (0.5 + gustLevel));
      }
    },
  };
}
