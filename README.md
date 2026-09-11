# pi — Stack

[![Deploy to GitHub Pages](https://github.com/pbotwin/pi/actions/workflows/deploy.yml/badge.svg)](https://github.com/pbotwin/pi/actions/workflows/deploy.yml)

A one-tap 3D tower-stacking game built for phone portrait screens.

**Play: https://pbotwin.github.io/pi/**

A slab slides back and forth above the tower. Tap to drop it. Whatever hangs
over the edge is sheared off and tumbles away, so the tower narrows with every
sloppy drop. Land one dead centre and it counts as *perfect* — the slab grows
back slightly and the combo climbs. Miss entirely and the run ends.

## Stack

- **Three.js** — WebGL rendering, orthographic isometric camera, real shadows
- **TypeScript** — strict mode
- **Vite** — dev server and production build
- **Vitest** — unit tests for the stacking maths

No art assets: every slab is one shared `BoxGeometry` scaled per block, coloured
by a hue that drifts with height so the tower reads as a gradient.

## Commands

```bash
npm install
npm run dev       # dev server with hot reload
npm test          # run the unit tests
npm run build     # typecheck + production build into dist/
npm run preview   # serve the built output locally
```

## Layout

```
src/
  main.ts            entry point, input wiring
  style.css          HUD, overlay, portrait layout
  game/
    Game.ts          scene, camera rig, game loop, state machine
    tower.ts         pure stacking maths (no Three.js, no DOM)
    tower.test.ts    unit tests for the above
    config.ts        gameplay tunables
    palette.ts       colour ramp
    audio.ts         procedural WebAudio blips
  ui/
    hud.ts           score, combo, overlay, localStorage best
```

`tower.ts` deliberately holds no rendering code, so the rules can be tested
without standing up a WebGL context. Gameplay feel is tuned entirely through
`config.ts`.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: install → test →
typecheck + build → publish `dist/` to GitHub Pages. Tests gate the deploy, so a
failing test blocks publishing. Pull requests build and test without publishing.

Vite is configured with `base: '/pi/'` because the site is served from a
repository subpath rather than a domain root.
