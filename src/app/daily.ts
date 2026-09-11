/**
 * The daily challenge. Everyone playing on the same calendar day gets the same
 * variation, so scores are comparable without a server deciding anything.
 */

/** Stable 32-bit hash of a string. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** `YYYY-MM-DD` in the player's own timezone. */
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function dailySeed(date: Date): number {
  return hashString(`pi.stack.${dayKey(date)}`)
}

/** Small, fast, deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DailyTuning {
  /** Multiplier on the starting slab speed. */
  speedScale: number
  /** Multiplier on how far the slab travels. */
  swingScale: number
}

/** Same day, same tuning — and always inside sane bounds. */
export function dailyTuning(date: Date): DailyTuning {
  const rand = mulberry32(dailySeed(date))
  return {
    speedScale: 0.9 + rand() * 0.35,
    swingScale: 0.92 + rand() * 0.22,
  }
}
