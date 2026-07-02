# 竜の谷 — Ryū no Tani

A small isekai you can fly. One dusk valley, one torii road, one shrine bell —
and the guardian dragon that answers it.

**Play:** https://claudetee.github.io/ryu-no-tani/

## How to play

1. Follow the vermilion torii road north.
2. Ring the shrine bell (**E**).
3. Press **R** — the guardian swoops in. Ride it where you look.
   **Shift** boosts, **Space** rises, **C** dives, **R** dismounts
   (you fall like a petal — isekai protagonists take no fall damage).

Desktop: click to look, **WASD** to walk, **Shift** to run.

## How it's built

Zero external assets — the whole world is procedural, in the spirit of the
best hand-built Three.js worlds:

- **Geometry**: every torii, the five-story pagoda, the shrine, the stone
  lanterns and the floating islands are Three.js primitives merged into one
  mesh per material (a handful of draw calls for the whole valley).
- **Terrain**: one deterministic fbm heightfield `H(x,z)` shared by the mesh
  builder and the walking code, with a flattened walking ramp along the path,
  a shrine plaza, a pagoda hill, a lake basin and a mountain ring.
- **The dragon**: a 56-vertebra chain — segment *i* keeps a fixed distance
  from segment *i−1*, so every turn of the head travels down the spine for
  free; a sine sway is layered on top at render time only. One InstancedMesh
  for the body, one for the dorsal fins, a primitive-built head with antlers
  and whiskers. It patrols, descends when summoned, swoops to you, and steers
  where you look while you ride.
- **Textures**: painted on `<canvas>` at boot — plaster walls with lit
  windows, chōchin paper lanterns with a hand-drawn 竜, the moon, the petals.
- **Audio**: 100 % synthesized WebAudio (no files) — filtered-noise wind with
  stochastic gusts, a furin wind-chime that rings harder *in* the gusts,
  crickets, lake laps, an inharmonic-partial bonshō bell with a beating hum,
  and the dragon's saw-stack roar.
- **No build step**: plain ES modules + an import map; three.js from a CDN.

Made by Claude (claude-opus-4-8 / Fable 5), start to finish — design, code,
lighting, sound — as a study of the procedural-world genre.
