/**
 * Ballistics for aiming — pure maths, no physics engine.
 *
 * The preview arc the player sees and the velocity actually handed to the
 * rigid-body solver come from the same functions, so what you see is what you
 * get. Drag is resolved to a yaw/pitch/power triple and nothing else.
 */
import {
  DRAG_FULL_PX, GRAVITY, PITCH_MAX, PITCH_MIN,
  POWER_MAX, POWER_MIN, YAW_RANGE,
} from './config'

export interface Vec3 { x: number; y: number; z: number }

export interface Aim {
  /** Left/right, radians. */
  yaw: number
  /** Up/down, radians. */
  pitch: number
  /** 0..1. */
  power: number
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * Turn a drag offset (pixels, from the touch-down point) into an aim.
 *
 * Dragging back and down is a slingshot pull: it raises power and lifts the
 * barrel. Horizontal drag swings the shot left and right.
 */
export function aimFromDrag(dx: number, dy: number): Aim {
  const nx = clamp(dx / DRAG_FULL_PX, -1, 1)
  const ny = clamp(dy / DRAG_FULL_PX, -1, 1)
  return {
    yaw: nx * YAW_RANGE,
    pitch: clamp(PITCH_MIN + (ny + 1) / 2 * (PITCH_MAX - PITCH_MIN), PITCH_MIN, PITCH_MAX),
    power: clamp((ny + 1) / 2, 0, 1),
  }
}

/** Muzzle velocity for an aim. Shots travel towards -z, into the scene. */
export function launchVelocity(aim: Aim): Vec3 {
  const speed = POWER_MIN + aim.power * (POWER_MAX - POWER_MIN)
  const cp = Math.cos(aim.pitch)
  return {
    x: Math.sin(aim.yaw) * cp * speed,
    y: Math.sin(aim.pitch) * speed,
    z: -Math.cos(aim.yaw) * cp * speed,
  }
}

/** Position under constant gravity at time `t`. */
export function pointAt(origin: Vec3, v: Vec3, t: number): Vec3 {
  return {
    x: origin.x + v.x * t,
    y: origin.y + v.y * t + 0.5 * GRAVITY * t * t,
    z: origin.z + v.z * t,
  }
}

/** Sampled arc for the aiming preview. Stops once the shot is below the floor. */
export function samplePath(origin: Vec3, v: Vec3, steps: number, dt: number, floorY = 0): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i < steps; i++) {
    const p = pointAt(origin, v, i * dt)
    out.push(p)
    if (p.y < floorY) break
  }
  return out
}

/** Time to fall back to `y`, ignoring anything in the way. Null if it never does. */
export function timeToHeight(origin: Vec3, v: Vec3, y: number): number | null {
  // 0.5*g*t^2 + vy*t + (originY - y) = 0
  const a = 0.5 * GRAVITY
  const b = v.y
  const c = origin.y - y
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const root = Math.sqrt(disc)
  const t1 = (-b + root) / (2 * a)
  const t2 = (-b - root) / (2 * a)
  const times = [t1, t2].filter((t) => t > 1e-6).sort((p, q) => p - q)
  return times[0] ?? null
}
