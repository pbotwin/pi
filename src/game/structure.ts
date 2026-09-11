/**
 * Procedural target structures — pure data, no physics engine and no renderer.
 *
 * A structure is a stack of floors. Each floor is a row of pillars with a beam
 * laid across the top, which is a shape that stands up under a rigid-body
 * solver and collapses convincingly when you knock a pillar out. Cores are the
 * things you actually have to destroy; they sit on beams, tucked between
 * pillars so they are awkward to reach.
 */
import {
  BAY, BEAM_H, CORES_BASE, CORES_MAX, CORE_SIZE,
  FLOORS_BASE, FLOORS_MAX, PILLAR_H, PILLAR_W,
} from './config'

export type PieceKind = 'pillar' | 'beam' | 'core'

export interface Piece {
  kind: PieceKind
  /** Centre position. */
  x: number
  y: number
  z: number
  /** Full extents. */
  w: number
  h: number
  d: number
}

export type Rand = () => number

/** Deterministic RNG so a level can be replayed and tested. */
export function makeRand(seed: number): Rand {
  let s = (seed >>> 0) || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

export function floorsFor(level: number): number {
  return Math.min(FLOORS_MAX, FLOORS_BASE + Math.floor((level - 1) / 2))
}

export function coresFor(level: number): number {
  return Math.min(CORES_MAX, CORES_BASE + Math.floor(level / 2))
}

/** Bays widen every few levels, so later towers are broader as well as taller. */
export function baysFor(level: number): number {
  return Math.min(4, 2 + Math.floor((level - 1) / 3))
}

/**
 * Build a level. `baseY` is the top surface the structure stands on.
 *
 * Pieces are returned bottom-up, and every piece rests either on that surface
 * or on the beam directly below it — nothing floats.
 */
export function buildStructure(level: number, baseY: number, rand: Rand): Piece[] {
  const floors = floorsFor(level)
  const bays = baysFor(level)
  const cores = coresFor(level)

  const pieces: Piece[] = []
  const span = bays * BAY
  const depth = 1.0

  // Which floors get a core, spread over the height rather than clustered.
  const coreFloors = new Set<number>()
  for (let i = 0; i < cores; i++) {
    const band = Math.floor((i / cores) * floors)
    let f = Math.min(floors - 1, band + (rand() < 0.5 ? 0 : 1))
    while (coreFloors.has(f) && f < floors - 1) f++
    coreFloors.add(f)
  }

  let y = baseY
  for (let f = 0; f < floors; f++) {
    // Pillars: one at each bay boundary.
    for (let i = 0; i <= bays; i++) {
      const x = -span / 2 + i * BAY
      pieces.push({
        kind: 'pillar',
        x, y: y + PILLAR_H / 2, z: 0,
        w: PILLAR_W, h: PILLAR_H, d: depth,
      })
    }

    // A core sits on this floor's deck, between two pillars.
    if (coreFloors.has(f)) {
      const bay = Math.floor(rand() * bays)
      const x = -span / 2 + bay * BAY + BAY / 2
      pieces.push({
        kind: 'core',
        x, y: y + CORE_SIZE / 2, z: 0,
        w: CORE_SIZE, h: CORE_SIZE, d: CORE_SIZE,
      })
    }

    // Beam laid across the pillar tops becomes the next floor's deck.
    const beamY = y + PILLAR_H + BEAM_H / 2
    pieces.push({
      kind: 'beam',
      x: 0, y: beamY, z: 0,
      w: span + PILLAR_W, h: BEAM_H, d: depth,
    })

    y = y + PILLAR_H + BEAM_H
  }

  return pieces
}

/** Total height of a built structure above its base. */
export function structureHeight(level: number): number {
  return floorsFor(level) * (PILLAR_H + BEAM_H)
}

export function countKind(pieces: Piece[], kind: PieceKind): number {
  return pieces.reduce((n, p) => (p.kind === kind ? n + 1 : n), 0)
}

/** Axis-aligned overlap test, used to assert nothing is generated intersecting. */
export function overlaps(a: Piece, b: Piece, epsilon = 1e-6): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 - epsilon &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2 - epsilon &&
    Math.abs(a.z - b.z) < (a.d + b.d) / 2 - epsilon
  )
}
