import { describe, expect, it } from 'vitest'
import {
  EMPTY_STATS, MILESTONES, TABLE_SIZE, addScore, averageScore, bestOf,
  compareEntries, forDay, isPersonalBest, rankOf, recordRun, unlockedCount,
  type ScoreEntry,
} from './scores'
import {
  DEFAULT_SETTINGS, NAME_MAX, mergeSettings, sanitizeName,
} from './settings'
import { dailySeed, dailyTuning, dayKey, hashString, mulberry32 } from './daily'

const entry = (score: number, combo = 0, at = 1000): ScoreEntry =>
  ({ score, combo, at, mode: 'endless' })

describe('score table', () => {
  it('ranks highest first', () => {
    const table = [entry(5), entry(30), entry(12)].sort(compareEntries)
    expect(table.map((e) => e.score)).toEqual([30, 12, 5])
  })

  it('breaks ties on the longer streak, then the earlier run', () => {
    const older = entry(20, 3, 100)
    const newer = entry(20, 3, 900)
    const streaky = entry(20, 8, 500)
    const table = [newer, older, streaky].sort(compareEntries)
    expect(table).toEqual([streaky, older, newer])
  })

  it('keeps only the top N', () => {
    let table: ScoreEntry[] = []
    for (let i = 1; i <= 40; i++) table = addScore(table, entry(i))
    expect(table).toHaveLength(TABLE_SIZE)
    expect(table[0]!.score).toBe(40)
    expect(table[TABLE_SIZE - 1]!.score).toBe(31)
  })

  it('does not mutate the table it was given', () => {
    const table = [entry(10)]
    const copy = [...table]
    addScore(table, entry(99))
    expect(table).toEqual(copy)
  })

  it('reports the placing a run would take', () => {
    const table = [entry(50), entry(30), entry(10)]
    expect(rankOf(table, entry(60))).toBe(1)
    expect(rankOf(table, entry(40))).toBe(2)
    expect(rankOf(table, entry(1))).toBe(4)
  })

  it('returns null when a run misses the table entirely', () => {
    let table: ScoreEntry[] = []
    for (let i = 100; i < 100 + TABLE_SIZE; i++) table = addScore(table, entry(i))
    expect(rankOf(table, entry(1))).toBeNull()
  })

  it('recognises a personal best, including the very first run', () => {
    expect(isPersonalBest([], 1)).toBe(true)
    expect(isPersonalBest([entry(20)], 21)).toBe(true)
    expect(isPersonalBest([entry(20)], 20)).toBe(false)
  })

  it('reads the best score, and zero from an empty table', () => {
    expect(bestOf([])).toBe(0)
    expect(bestOf([entry(7), entry(3)])).toBe(7)
  })

  it('filters daily runs to their own day', () => {
    const table: ScoreEntry[] = [
      { score: 5, combo: 0, at: 1, mode: 'daily', day: '2026-09-11' },
      { score: 9, combo: 0, at: 2, mode: 'daily', day: '2026-09-12' },
      { score: 7, combo: 0, at: 3, mode: 'daily', day: '2026-09-11' },
      entry(99),
    ]
    const today = forDay(table, '2026-09-11')
    expect(today.map((e) => e.score)).toEqual([7, 5])
  })
})

describe('stats', () => {
  it('accumulates across runs', () => {
    let s = EMPTY_STATS
    s = recordRun(s, 10, 3, 3)
    s = recordRun(s, 22, 5, 5)
    expect(s.played).toBe(2)
    expect(s.blocks).toBe(32)
    expect(s.perfects).toBe(8)
    expect(s.bestCombo).toBe(5)
    expect(s.best).toBe(22)
  })

  it('keeps the best figures when a later run is worse', () => {
    let s = recordRun(EMPTY_STATS, 40, 10, 10)
    s = recordRun(s, 2, 0, 0)
    expect(s.best).toBe(40)
    expect(s.bestCombo).toBe(10)
  })

  it('averages without dividing by zero', () => {
    expect(averageScore(EMPTY_STATS)).toBe(0)
    expect(averageScore({ ...EMPTY_STATS, played: 4, blocks: 10 })).toBe(2.5)
  })

  it('unlocks milestones as the numbers climb', () => {
    expect(unlockedCount(EMPTY_STATS)).toBe(0)
    const strong = { played: 30, blocks: 1200, perfects: 90, bestCombo: 16, best: 120 }
    expect(unlockedCount(strong)).toBe(MILESTONES.length)
  })

  it('gives every milestone a unique id', () => {
    expect(new Set(MILESTONES.map((m) => m.id)).size).toBe(MILESTONES.length)
  })
})

describe('settings', () => {
  it('falls back to defaults for junk input', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(mergeSettings('nope')).toEqual(DEFAULT_SETTINGS)
    expect(mergeSettings({ sound: 'yes' })).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps values of the right type and ignores the rest', () => {
    const merged = mergeSettings({ sound: false, haptics: 'x', name: 'Vaso' })
    expect(merged.sound).toBe(false)
    expect(merged.haptics).toBe(DEFAULT_SETTINGS.haptics)
    expect(merged.name).toBe('Vaso')
  })

  it('strips markup characters', () => {
    expect(sanitizeName('  <b>hi</b>  ')).toBe('bhib')
    expect(sanitizeName('a&b"c\'d')).toBe('abcd')
    expect(sanitizeName('Ana Maria_1')).toBe('Ana Maria_1')
  })

  it('trims names to the maximum length', () => {
    expect(sanitizeName('a'.repeat(50))).toHaveLength(NAME_MAX)
    // Truncation happens after stripping, so the cap always holds.
    expect(sanitizeName('<script>hi</script>').length).toBeLessThanOrEqual(NAME_MAX)
  })

  it('allows non-latin names', () => {
    expect(sanitizeName('ვასო')).toBe('ვასო')
  })
})

describe('daily challenge', () => {
  it('gives every day its own key', () => {
    expect(dayKey(new Date(2026, 8, 11))).toBe('2026-09-11')
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('is stable within a day and differs across days', () => {
    const a = dailySeed(new Date(2026, 8, 11, 1, 0))
    const b = dailySeed(new Date(2026, 8, 11, 23, 0))
    const c = dailySeed(new Date(2026, 8, 12, 1, 0))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('hands everyone the same tuning on the same day', () => {
    const a = dailyTuning(new Date(2026, 8, 11, 6, 0))
    const b = dailyTuning(new Date(2026, 8, 11, 20, 0))
    expect(a).toEqual(b)
  })

  it('keeps tuning inside playable bounds every day for a year', () => {
    for (let i = 0; i < 365; i++) {
      const t = dailyTuning(new Date(2026, 0, 1 + i))
      expect(t.speedScale).toBeGreaterThanOrEqual(0.9)
      expect(t.speedScale).toBeLessThanOrEqual(1.25)
      expect(t.swingScale).toBeGreaterThanOrEqual(0.92)
      expect(t.swingScale).toBeLessThanOrEqual(1.14)
    }
  })

  it('hashes distinctly and stays in range', () => {
    expect(hashString('a')).not.toBe(hashString('b'))
    expect(hashString('')).toBeGreaterThanOrEqual(0)
    expect(hashString('pi')).toBeLessThanOrEqual(0xffffffff)
  })

  it('produces a repeatable spread from a seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const runA = [a(), a(), a()]
    const runB = [b(), b(), b()]
    expect(runA).toEqual(runB)
    for (const v of runA) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(new Set(runA).size).toBe(3)
  })
})
