/** Player settings. Pure model plus a merge that tolerates old saved shapes. */

export interface Settings {
  sound: boolean
  haptics: boolean
  /** Dim the camera punch and shockwaves for motion sensitivity. */
  reducedMotion: boolean
  /** Shown next to scores, and sent with them if a global board is enabled. */
  name: string
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  haptics: true,
  reducedMotion: false,
  name: '',
}

export const NAME_MAX = 12

/** Keep names short, printable and free of markup. */
export function sanitizeName(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .slice(0, NAME_MAX)
}

/**
 * Merge a stored blob over the defaults, ignoring anything of the wrong type.
 * A settings file from an older build can never break the game.
 */
export function mergeSettings(stored: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS }
  if (typeof stored !== 'object' || stored === null) return out
  const s = stored as Record<string, unknown>
  if (typeof s.sound === 'boolean') out.sound = s.sound
  if (typeof s.haptics === 'boolean') out.haptics = s.haptics
  if (typeof s.reducedMotion === 'boolean') out.reducedMotion = s.reducedMotion
  if (typeof s.name === 'string') out.name = sanitizeName(s.name)
  return out
}
