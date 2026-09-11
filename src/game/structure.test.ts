import { describe, expect, it } from 'vitest'
import {
  baysFor, buildStructure, coresFor, countKind, floorsFor, makeRand,
  overlaps, structureHeight, type Piece,
} from './structure'
import { BEAM_H, FLOORS_MAX, CORES_MAX, PILLAR_H } from './config'

const build = (level: number, seed = 1, baseY = 0): Piece[] =>
  buildStructure(level, baseY, makeRand(seed))

describe('difficulty curve', () => {
  it('grows with level and then plateaus', () => {
    expect(floorsFor(1)).toBeLessThan(floorsFor(9))
    expect(floorsFor(99)).toBe(FLOORS_MAX)
    expect(coresFor(1)).toBeLessThan(coresFor(9))
    expect(coresFor(99)).toBe(CORES_MAX)
    expect(baysFor(1)).toBeLessThanOrEqual(baysFor(10))
  })

  it('never regresses as levels climb', () => {
    for (let l = 1; l < 40; l++) {
      expect(floorsFor(l + 1)).toBeGreaterThanOrEqual(floorsFor(l))
      expect(coresFor(l + 1)).toBeGreaterThanOrEqual(coresFor(l))
      expect(baysFor(l + 1)).toBeGreaterThanOrEqual(baysFor(l))
    }
  })
})

describe('buildStructure', () => {
  it('produces the promised number of cores', () => {
    for (const level of [1, 2, 5, 9, 14, 30]) {
      expect(countKind(build(level), 'core')).toBe(coresFor(level))
    }
  })

  it('always has something to shoot at', () => {
    for (let l = 1; l <= 30; l++) {
      expect(countKind(build(l, l), 'core')).toBeGreaterThan(0)
    }
  })

  it('never generates pieces intersecting each other', () => {
    for (const level of [1, 3, 6, 10, 20]) {
      for (const seed of [1, 2, 99]) {
        const pieces = build(level, seed)
        for (let i = 0; i < pieces.length; i++) {
          for (let j = i + 1; j < pieces.length; j++) {
            const a = pieces[i]!
            const b = pieces[j]!
            expect(overlaps(a, b), `${a.kind}@${i} overlaps ${b.kind}@${j}`).toBe(false)
          }
        }
      }
    }
  })

  it('rests everything on or above the base — nothing floats below it', () => {
    const baseY = 0.5
    for (const level of [1, 4, 12]) {
      for (const p of build(level, 7, baseY)) {
        expect(p.y - p.h / 2).toBeGreaterThanOrEqual(baseY - 1e-9)
      }
    }
  })

  it('supports every piece on the base or on a beam below it', () => {
    const baseY = 0
    const pieces = build(8, 3, baseY)
    const beams = pieces.filter((p) => p.kind === 'beam')
    for (const p of pieces) {
      if (p.kind === 'beam') continue
      const bottom = p.y - p.h / 2
      const onBase = Math.abs(bottom - baseY) < 1e-6
      const onBeam = beams.some((b) => Math.abs(bottom - (b.y + b.h / 2)) < 1e-6)
      expect(onBase || onBeam, `${p.kind} at y=${p.y} is unsupported`).toBe(true)
    }
  })

  it('is deterministic for a seed, and varies across seeds', () => {
    const a = JSON.stringify(build(6, 42))
    const b = JSON.stringify(build(6, 42))
    const c = JSON.stringify(build(6, 43))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('keeps cores inside the footprint, not hanging off the edge', () => {
    for (const level of [1, 5, 12]) {
      const pieces = build(level, 11)
      const beam = pieces.find((p) => p.kind === 'beam')!
      const halfSpan = beam.w / 2
      for (const core of pieces.filter((p) => p.kind === 'core')) {
        expect(Math.abs(core.x) + core.w / 2).toBeLessThanOrEqual(halfSpan + 1e-9)
      }
    }
  })

  it('reports a height matching the pieces it generated', () => {
    for (const level of [1, 4, 11]) {
      const pieces = build(level, 5)
      const top = Math.max(...pieces.map((p) => p.y + p.h / 2))
      expect(structureHeight(level)).toBeCloseTo(top)
    }
  })

  it('stacks floors at the expected pitch', () => {
    const pieces = build(5, 2)
    const beams = pieces.filter((p) => p.kind === 'beam').sort((a, b) => a.y - b.y)
    for (let i = 1; i < beams.length; i++) {
      expect(beams[i]!.y - beams[i - 1]!.y).toBeCloseTo(PILLAR_H + BEAM_H)
    }
  })

  it('stays a sane size even at absurd levels', () => {
    const pieces = build(500, 1)
    expect(pieces.length).toBeLessThan(80)
    expect(countKind(pieces, 'core')).toBe(CORES_MAX)
  })
})
