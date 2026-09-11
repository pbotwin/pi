import { describe, expect, it } from 'vitest'
import { axisForLevel, resolveDrop, sizeAlong, type Slab } from './tower'
import { BASE_SIZE, PERFECT_EPS } from './config'

const base = (): Slab => ({ x: 0, z: 0, w: BASE_SIZE, d: BASE_SIZE, y: 0 })

describe('resolveDrop', () => {
  it('treats a dead-centre drop as perfect and grows the slab back', () => {
    const prev = base()
    const r = resolveDrop(prev, 0, 'x', 1)
    expect(r.kind).toBe('perfect')
    if (r.kind !== 'perfect') return
    expect(r.slab.x).toBe(0)
    // Already at BASE_SIZE, so regrowth is capped rather than overshooting.
    expect(r.slab.w).toBe(BASE_SIZE)
  })

  it('still counts as perfect just inside the tolerance', () => {
    const r = resolveDrop(base(), PERFECT_EPS - 0.001, 'x', 1)
    expect(r.kind).toBe('perfect')
  })

  it('slices once the offset exceeds the tolerance', () => {
    const r = resolveDrop(base(), PERFECT_EPS + 0.001, 'x', 1)
    expect(r.kind).toBe('sliced')
  })

  it('splits overlap and debris so they reconstruct the original footprint', () => {
    const prev = base()
    const r = resolveDrop(prev, 1, 'x', 1)
    expect(r.kind).toBe('sliced')
    if (r.kind !== 'sliced') return

    // offset 1 on a size-3 slab => 2 kept, 1 shorn off.
    expect(r.slab.w).toBeCloseTo(2)
    expect(r.debris.w).toBeCloseTo(1)
    expect(r.slab.w + r.debris.w).toBeCloseTo(BASE_SIZE)

    // Kept piece centres between the two slabs; debris sits beyond its edge.
    expect(r.slab.x).toBeCloseTo(0.5)
    expect(r.debris.x).toBeCloseTo(2)
  })

  it('mirrors correctly for a negative offset', () => {
    const r = resolveDrop(base(), -1, 'x', 1)
    expect(r.kind).toBe('sliced')
    if (r.kind !== 'sliced') return
    expect(r.slab.x).toBeCloseTo(-0.5)
    expect(r.debris.x).toBeCloseTo(-2)
    expect(r.slab.w).toBeCloseTo(2)
  })

  it('leaves the untouched axis alone', () => {
    const prev: Slab = { x: 0, z: 0, w: 3, d: 1.4, y: 0 }
    const r = resolveDrop(prev, 1, 'x', 1)
    if (r.kind !== 'sliced') throw new Error('expected slice')
    expect(r.slab.d).toBe(1.4)
    expect(r.slab.z).toBe(0)
  })

  it('slices along z when that is the active axis', () => {
    const r = resolveDrop(base(), 1, 'z', 1)
    if (r.kind !== 'sliced') throw new Error('expected slice')
    expect(r.slab.d).toBeCloseTo(2)
    expect(r.slab.z).toBeCloseTo(0.5)
    expect(r.slab.w).toBe(BASE_SIZE)
  })

  it('misses when the offset reaches the full slab width', () => {
    expect(resolveDrop(base(), BASE_SIZE, 'x', 1).kind).toBe('miss')
    expect(resolveDrop(base(), -BASE_SIZE, 'x', 1).kind).toBe('miss')
    expect(resolveDrop(base(), 5, 'x', 1).kind).toBe('miss')
  })

  it('places the new slab at the requested height', () => {
    const r = resolveDrop(base(), 0.5, 'x', 2.75)
    if (r.kind !== 'sliced') throw new Error('expected slice')
    expect(r.slab.y).toBe(2.75)
    expect(r.debris.y).toBe(2.75)
  })

  it('never returns a slab wider than it started', () => {
    for (const offset of [0.3, 0.9, 1.5, 2.1, 2.9]) {
      const r = resolveDrop(base(), offset, 'x', 1)
      if (r.kind !== 'sliced') continue
      expect(r.slab.w).toBeLessThan(BASE_SIZE)
      expect(r.slab.w).toBeGreaterThan(0)
    }
  })

  it('shrinks monotonically as the offset grows', () => {
    let previousWidth = Infinity
    for (const offset of [0.2, 0.6, 1.0, 1.8, 2.4]) {
      const r = resolveDrop(base(), offset, 'x', 1)
      if (r.kind !== 'sliced') continue
      expect(r.slab.w).toBeLessThan(previousWidth)
      previousWidth = r.slab.w
    }
  })
})

describe('axisForLevel', () => {
  it('alternates so the tower twists as it climbs', () => {
    expect(axisForLevel(0)).toBe('x')
    expect(axisForLevel(1)).toBe('z')
    expect(axisForLevel(2)).toBe('x')
    expect(axisForLevel(3)).toBe('z')
  })
})

describe('sizeAlong', () => {
  it('reads the correct dimension per axis', () => {
    const slab: Slab = { x: 0, z: 0, w: 2, d: 5, y: 0 }
    expect(sizeAlong(slab, 'x')).toBe(2)
    expect(sizeAlong(slab, 'z')).toBe(5)
  })
})
