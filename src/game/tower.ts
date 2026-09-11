/**
 * Pure stacking maths — no Three.js, no DOM. Kept separate so the rules can be
 * reasoned about (and tested) without standing up a renderer.
 */
import { BASE_SIZE, PERFECT_EPS, PERFECT_REGROW } from './config'

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

export type Placement =
  | { kind: 'perfect'; slab: Slab }
  | { kind: 'sliced'; slab: Slab; debris: Slab }
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
export function resolveDrop(prev: Slab, movingPos: number, axis: Axis, y: number): Placement {
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
    const regrown = Math.min(BASE_SIZE, size + PERFECT_REGROW)
    const slab = withSize(withPos({ ...prev, y }, axis, prevPos), axis, regrown)
    return { kind: 'perfect', slab }
  }

  // Partial overlap: keep the intersection, shear off the rest.
  const overlap = size - offset
  const centre = (movingPos + prevPos) / 2
  const slab = withSize(withPos({ ...prev, y }, axis, centre), axis, overlap)

  const debrisCentre = centre + Math.sign(delta) * (size / 2)
  const debris = withSize(withPos({ ...prev, y }, axis, debrisCentre), axis, offset)

  return { kind: 'sliced', slab, debris }
}

/** Axis alternates each level so the tower twists as it climbs. */
export function axisForLevel(level: number): Axis {
  return level % 2 === 0 ? 'x' : 'z'
}
