# pi — Stack

[![Deploy to GitHub Pages](https://github.com/pbotwin/pi/actions/workflows/deploy.yml/badge.svg)](https://github.com/pbotwin/pi/actions/workflows/deploy.yml)

A one-tap 3D tower-stacking game for phone portrait screens, wrapped in a real
app shell: menus, a daily challenge, score tables, lifetime stats, milestones,
settings and offline play.

**Play: https://pbotwin.github.io/pi/** · **Watch it play itself: [`/?demo=1`](https://pbotwin.github.io/pi/?demo=1)**

A slab slides above the tower. Tap to drop it. Whatever hangs over the edge is
sheared off, so the tower narrows with every sloppy drop. Land one dead centre
for a **perfect** — the slab grows back, and a *streak* of perfects gives back
progressively more, so precision compounds instead of merely holding station.
Miss the tower completely and the run ends.

## Features

- **Endless** and a **daily challenge** — one shared variation per calendar day,
  derived from the date, so everyone plays the same thing without a server
- **Score tables** per mode, **lifetime stats** and **8 milestones**
- **Best-height band** floating in the scene, marking your record to beat
- **Feel**: perfect shockwaves, slice dust, camera punch, haptics, procedural audio
- **Settings**: name, sound, vibration, reduced motion, data reset
- **Share** a run via the native share sheet, clipboard fallback
- **Installable PWA**, playable offline
- **Deep links** — `#scores`, `#stats`, `#settings` address screens directly

## Scores and the global board

GitHub Pages serves static files only, so there is no server to hold a shared
leaderboard. Scores are therefore stored on the device by default.

Everything goes through one `Leaderboard` interface, with a local implementation
and a Supabase-backed global one. Supply two build-time variables and the global
board takes over — no other code changes:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

The anon key is meant to be public; safety comes from row-level security on the
table, not from hiding the key. Never put a service-role key here. If the
network fails the game silently falls back to the local board, so a run is never
lost.

## Architecture

Game logic is kept free of Three.js and the DOM so it can be tested directly:

- `game/tower.ts` — stacking maths: slicing, perfect tolerance, streak regrowth
- `app/scores.ts` — ranking, tie-breaks, stats, milestones
- `app/daily.ts` — date → seed → daily tuning
- `app/settings.ts` — defaults and tolerant merging of stored settings

`ui/shell.ts` owns navigation and persistence; `game/Game.ts` renders and reports
events through a small hooks interface, and knows nothing about the UI.

## Commands

```bash
npm install
npm run dev       # dev server with hot reload
npm test          # 45 unit tests
npm run build     # typecheck + production build into dist/
npm run preview   # serve the built output locally
```

## Layout

```
src/
  main.ts              entry point, input wiring, service worker
  style.css            HUD, screens, portrait layout
  app/
    scores.ts          ranking, stats, milestones  (pure)
    daily.ts           daily seed and tuning       (pure)
    settings.ts        settings model              (pure)
    storage.ts         safe localStorage access
    leaderboard.ts     local + Supabase boards behind one interface
    app.test.ts        tests for the above
  game/
    Game.ts            scene, camera rig, loop, state machine
    tower.ts           stacking maths              (pure)
    tower.test.ts      tests for the above
    effects.ts         shockwaves, dust, haptics
    config.ts          gameplay tunables
    palette.ts         colour ramp
    audio.ts           procedural WebAudio blips
  ui/
    shell.ts           menus, screens, persistence, routing
```

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: install → test →
typecheck + build → publish `dist/` to GitHub Pages. Tests gate the deploy, so a
failing test blocks publishing. Pull requests build and test without publishing.

Vite is configured with `base: '/pi/'` because the site is served from a
repository subpath rather than a domain root.
