# pi — Overload

[![Deploy to GitHub Pages](https://github.com/pbotwin/pi/actions/workflows/deploy.yml/badge.svg)](https://github.com/pbotwin/pi/actions/workflows/deploy.yml)

A neon physics demolition game for phone portrait screens.

**Play: https://pbotwin.github.io/pi/** · **Watch it play itself: [`/?demo=1`](https://pbotwin.github.io/pi/?demo=1)**

Each sector puts a neon scaffold on a platform with glowing cores buried inside
it. You get four charges. Drag anywhere to aim — the arc previews where the shot
goes — and release to fire. Blocks shatter into tumbling shards, structures
topple under their own weight, and a core dies when something hits it hard
enough or it falls off the world. Clear every core to advance; unused charges
bank as bonus score.

## How it works

Rigid bodies are simulated with **cannon-es**; Three.js only ever draws what the
solver reports. Blocks that take a hard enough hit are swapped for a handful of
smaller dynamic shards, which is what turns "boxes fall over" into destruction.
A body cap keeps a chain reaction from melting a phone.

Two things are kept as pure functions with no engine and no DOM, so they can be
tested directly:

- **`structure.ts`** — procedural scaffolds. Generation is checked to never emit
  intersecting pieces and to leave nothing floating, so towers cannot explode
  the instant the solver wakes up.
- **`trajectory.ts`** — the aiming maths. The preview arc and the velocity handed
  to the solver come from the same functions, so what you see is what you get.

## Stack

- **Three.js** — rendering, shadows, neon materials
- **cannon-es** — rigid-body physics
- **TypeScript** — strict mode
- **Vite** — dev server and production build
- **Vitest** — structure generation and ballistics

No art assets. Every block is a scaled unit cube: a dark emissive body wrapped
in additive wireframe edges, which reads as neon far more cheaply than a bloom
pass would on a phone.

## Commands

```bash
npm install
npm run dev       # dev server with hot reload
npm test          # structure + trajectory tests
npm run build     # typecheck + production build into dist/
npm run preview   # serve the built output locally
```

## Layout

```
src/
  main.ts               entry point, drag-to-aim input
  style.css             HUD, power meter, overlay, portrait layout
  game/
    Game.ts             scene, physics world, destruction, game loop
    structure.ts        procedural scaffolds — pure data, no engine
    structure.test.ts   overlap, support and difficulty-curve tests
    trajectory.ts       aiming and ballistics — pure maths
    trajectory.test.ts  aim mapping, launch, arc sampling tests
    neon.ts             neon block and core meshes
    config.ts           gameplay tunables
    audio.ts            procedural WebAudio blips
  ui/
    hud.ts              score, sector, cores, charges, overlay
```

Feel is tuned entirely through `config.ts` — gravity, fracture threshold,
fragment count, shot power, camera framing, body cap.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: install → test →
typecheck + build → publish `dist/` to GitHub Pages. Tests gate the deploy, so a
failing test blocks publishing. Pull requests build and test without publishing.

Vite is configured with `base: '/pi/'` because the site is served from a
repository subpath rather than a domain root.
