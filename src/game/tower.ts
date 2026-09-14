/**
 * Pure stacking maths — no Three.js, no DOM. Kept separate so the rules can be
 * reasoned about (and tested) without standing up a renderer.
 */
import {
  BASE_SIZE, COMBO_RAMP, GOOD_EPS, GOOD_REGROW, PERFECT_EPS,
  PERFECT_REGROW, PERFECT_REGROW_MAX, ZONE_SIZE,
} from './config'

export type Axis = 'x' | 'z'

export interface Slab {
  x: number
  z: number
  /** Size along x. */
  w: number
  /** Size along z. */
  d: number
  /** Centre height. */
  y: number
}

/** How cleanly a sheared drop landed. */
export type SliceTier = 'good' | 'plain'

export type Placement =
  | { kind: 'perfect'; slab: Slab }
  | { kind: 'sliced'; tier: SliceTier; slab: Slab; debris: Slab }
  | { kind: 'miss'; debris: Slab }

export function sizeAlong(slab: Slab, axis: Axis): number {
  return axis === 'x' ? slab.w : slab.d
}

function withSize(slab: Slab, axis: Axis, size: number): Slab {
  return axis === 'x' ? { ...slab, w: size } : { ...slab, d: size }
}

function withPos(slab: Slab, axis: Axis, pos: number): Slab {
  return axis === 'x' ? { ...slab, x: pos } : { ...slab, z: pos }
}

/**
 * Resolve a drop.
 *
 * `prev` is the slab already on the tower, `movingPos` the centre of the
 * incoming slab along `axis`. The incoming slab always matches `prev`'s
 * footprint, so overlap depends only on the offset between their centres.
 */
/**
 * Size handed back for a perfect drop. A sustained streak returns more than an
 * isolated hit, so precision compounds instead of merely holding station.
 */
export function regrowFor(combo: number): number {
  if (combo <= 0) return 0
  return Math.min(PERFECT_REGROW_MAX, PERFECT_REGROW * (1 + (combo - 1) * COMBO_RAMP))
}

export function resolveDrop(
  prev: Slab,
  movingPos: number,
  axis: Axis,
  y: number,
  regrow = PERFECT_REGROW,
): Placement {
  const prevPos = axis === 'x' ? prev.x : prev.z
  const size = sizeAlong(prev, axis)
  const delta = movingPos - prevPos
  const offset = Math.abs(delta)

  // Missed the tower entirely.
  if (offset >= size) {
    const debris = withPos({ ...prev, y }, axis, movingPos)
    return { kind: 'miss', debris }
  }

  // Close enough to count as a clean hit: snap it and grant a little size back.
  if (offset <= PERFECT_EPS) {
    const regrown = Math.min(BASE_SIZE, size + regrow)
    const slab = withSize(withPos({ ...prev, y }, axis, prevPos), axis, regrown)
    return { kind: 'perfect', slab }
  }

  // Partial overlap: keep the intersection, shear off the rest.
  const overlap = size - offset
  const centre = (movingPos + prevPos) / 2

  // A near miss hands a sliver back, softening the punishment for being a
  // fraction late without ever exceeding what was there before the drop.
  const tier: SliceTier = offset <= GOOD_EPS ? 'good' : 'plain'
  const kept = tier === 'good' ? Math.min(size, overlap + GOOD_REGROW) : overlap

  const slab = withSize(withPos({ ...prev, y }, axis, centre), axis, kept)

  const debrisCentre = centre + Math.sign(delta) * (size / 2)
  const debris = withSize(withPos({ ...prev, y }, axis, debrisCentre), axis, offset)

  return { kind: 'sliced', tier, slab, debris }
}

/** Zone index for a score — a new landmark every ZONE_SIZE blocks. */
export function zoneIndex(score: number): number {
  return Math.floor(Math.max(0, score) / ZONE_SIZE)
}

const ZONE_NAMES = [
  'GROUND LEVEL', 'MIDRISE', 'SKYLINE', 'CLOUD DECK', 'STRATOSPHERE',
  'MESOSPHERE', 'THERMOSPHERE', 'LOW ORBIT', 'DEEP ORBIT', 'THE VOID',
]

/** Name of the zone at a score. Past the last name, the void just deepens. */
export function zoneName(score: number): string {
  const i = zoneIndex(score)
  return ZONE_NAMES[i] ?? `${ZONE_NAMES[ZONE_NAMES.length - 1]} ${i - ZONE_NAMES.length + 2}`
}

/** True on the exact block that crosses into a new zone (never at the start). */
export function entersZone(score: number): boolean {
  return score > 0 && score % ZONE_SIZE === 0
}

/** Axis alternates each level so the tower twists as it climbs. */
export function axisForLevel(level: number): Axis {
  return level % 2 === 0 ? 'x' : 'z'
}
