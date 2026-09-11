import { describe, expect, it } from 'vitest'
import { aimFromDrag, launchVelocity, pointAt, samplePath, timeToHeight } from './trajectory'
import {
  DRAG_FULL_PX, GRAVITY, PITCH_MAX, PITCH_MIN, POWER_MAX, POWER_MIN, YAW_RANGE,
} from './config'

const speed = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z)

describe('aimFromDrag', () => {
  it('centres on no drag', () => {
    const aim = aimFromDrag(0, 0)
    expect(aim.yaw).toBeCloseTo(0)
    expect(aim.power).toBeCloseTo(0.5)
  })

  it('clamps beyond a full-scale drag instead of running away', () => {
    const far = aimFromDrag(DRAG_FULL_PX * 9, DRAG_FULL_PX * 9)
    expect(far.yaw).toBeCloseTo(YAW_RANGE)
    expect(far.power).toBe(1)
    expect(far.pitch).toBeCloseTo(PITCH_MAX)

    const near = aimFromDrag(-DRAG_FULL_PX * 9, -DRAG_FULL_PX * 9)
    expect(near.yaw).toBeCloseTo(-YAW_RANGE)
    expect(near.power).toBe(0)
    expect(near.pitch).toBeCloseTo(PITCH_MIN)
  })

  it('keeps pitch inside its range for any input', () => {
    for (let d = -800; d <= 800; d += 37) {
      const aim = aimFromDrag(d, d)
      expect(aim.pitch).toBeGreaterThanOrEqual(PITCH_MIN - 1e-9)
      expect(aim.pitch).toBeLessThanOrEqual(PITCH_MAX + 1e-9)
      expect(aim.power).toBeGreaterThanOrEqual(0)
      expect(aim.power).toBeLessThanOrEqual(1)
    }
  })

  it('maps drag direction to aim direction monotonically', () => {
    let prev = -Infinity
    for (let d = -DRAG_FULL_PX; d <= DRAG_FULL_PX; d += 20) {
      const yaw = aimFromDrag(d, 0).yaw
      expect(yaw).toBeGreaterThanOrEqual(prev)
      prev = yaw
    }
  })
})

describe('launchVelocity', () => {
  it('scales speed between the configured bounds', () => {
    expect(speed(launchVelocity({ yaw: 0, pitch: 0, power: 0 }))).toBeCloseTo(POWER_MIN)
    expect(speed(launchVelocity({ yaw: 0, pitch: 0, power: 1 }))).toBeCloseTo(POWER_MAX)
  })

  it('fires into the scene, never back at the player', () => {
    for (const yaw of [-YAW_RANGE, 0, YAW_RANGE]) {
      for (const pitch of [PITCH_MIN, 0, PITCH_MAX]) {
        expect(launchVelocity({ yaw, pitch, power: 0.5 }).z).toBeLessThan(0)
      }
    }
  })

  it('swings left and right with yaw', () => {
    expect(launchVelocity({ yaw: 0.4, pitch: 0, power: 0.5 }).x).toBeGreaterThan(0)
    expect(launchVelocity({ yaw: -0.4, pitch: 0, power: 0.5 }).x).toBeLessThan(0)
    expect(launchVelocity({ yaw: 0, pitch: 0, power: 0.5 }).x).toBeCloseTo(0)
  })

  it('raises the shot with pitch', () => {
    expect(launchVelocity({ yaw: 0, pitch: 0.3, power: 0.5 }).y).toBeGreaterThan(0)
    expect(launchVelocity({ yaw: 0, pitch: -0.05, power: 0.5 }).y).toBeLessThan(0)
  })
})

describe('pointAt', () => {
  const origin = { x: 0, y: 3, z: 10 }

  it('starts at the muzzle', () => {
    const p = pointAt(origin, { x: 1, y: 2, z: -3 }, 0)
    expect(p).toEqual(origin)
  })

  it('falls under gravity', () => {
    const flat = pointAt(origin, { x: 0, y: 0, z: -10 }, 1)
    expect(flat.y).toBeCloseTo(origin.y + 0.5 * GRAVITY)
    expect(flat.y).toBeLessThan(origin.y)
  })

  it('arcs — rises then falls for an upward shot', () => {
    const v = { x: 0, y: 12, z: -10 }
    const a = pointAt(origin, v, 0.2).y
    const b = pointAt(origin, v, 0.55).y
    const c = pointAt(origin, v, 1.6).y
    expect(b).toBeGreaterThan(a)
    expect(c).toBeLessThan(b)
  })
})

describe('samplePath', () => {
  it('stops once the arc drops below the floor', () => {
    const path = samplePath({ x: 0, y: 2, z: 10 }, { x: 0, y: 0, z: -10 }, 200, 0.05, 0)
    expect(path.length).toBeLessThan(200)
    expect(path[path.length - 1]!.y).toBeLessThan(0)
  })

  it('respects the step budget for a shot that stays airborne', () => {
    const path = samplePath({ x: 0, y: 2, z: 10 }, { x: 0, y: 30, z: -10 }, 12, 0.02, 0)
    expect(path).toHaveLength(12)
  })

  it('moves steadily into the scene', () => {
    const path = samplePath({ x: 0, y: 3, z: 12 }, { x: 0, y: 5, z: -18 }, 30, 0.03, -99)
    for (let i = 1; i < path.length; i++) {
      expect(path[i]!.z).toBeLessThan(path[i - 1]!.z)
    }
  })
})

describe('timeToHeight', () => {
  it('agrees with the arc it was derived from', () => {
    const origin = { x: 0, y: 4, z: 10 }
    const v = { x: 0, y: 9, z: -12 }
    const t = timeToHeight(origin, v, 0)
    expect(t).not.toBeNull()
    expect(pointAt(origin, v, t!).y).toBeCloseTo(0)
  })

  it('returns the first crossing, not the one behind us', () => {
    const t = timeToHeight({ x: 0, y: 4, z: 0 }, { x: 0, y: 9, z: -1 }, 0)
    expect(t!).toBeGreaterThan(0)
  })

  it('is null for a height that is never reached', () => {
    expect(timeToHeight({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -5 }, 50)).toBeNull()
  })
})
