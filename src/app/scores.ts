/**
 * The score table and lifetime stats. Pure data handling — no storage, no DOM —
 * so the ranking rules can be tested directly.
 */

export type Mode = 'endless' | 'daily'

export interface ScoreEntry {
  score: number
  /** Longest perfect streak in that run. */
  combo: number
  /** Epoch milliseconds. */
  at: number
  mode: Mode
  /** Present for daily runs: the `YYYY-MM-DD` the run belongs to. */
  day?: string
}

export interface Stats {
  played: number
  blocks: number
  perfects: number
  bestCombo: number
  best: number
}

export const EMPTY_STATS: Stats = {
  played: 0, blocks: 0, perfects: 0, bestCombo: 0, best: 0,
}

export const TABLE_SIZE = 10

/**
 * Highest score first. Ties break towards the longer streak, then the older
 * run — beating a score should require actually beating it.
 */
export function compareEntries(a: ScoreEntry, b: ScoreEntry): number {
  if (b.score !== a.score) return b.score - a.score
  if (b.combo !== a.combo) return b.combo - a.combo
  return a.at - b.at
}

export function addScore(table: ScoreEntry[], entry: ScoreEntry, limit = TABLE_SIZE): ScoreEntry[] {
  return [...table, entry].sort(compareEntries).slice(0, limit)
}

/** 1-based placing the entry would take, or null if it misses the table. */
export function rankOf(table: ScoreEntry[], entry: ScoreEntry, limit = TABLE_SIZE): number | null {
  const placed = addScore(table, entry, limit)
  const index = placed.findIndex((e) => e === entry)
  return index < 0 ? null : index + 1
}

export function isPersonalBest(table: ScoreEntry[], score: number): boolean {
  const top = table[0]
  return !top || score > top.score
}

export function bestOf(table: ScoreEntry[]): number {
  return table[0]?.score ?? 0
}

/** Only entries belonging to the given day, already ranked. */
export function forDay(table: ScoreEntry[], day: string): ScoreEntry[] {
  return table.filter((e) => e.mode === 'daily' && e.day === day).sort(compareEntries)
}

export function recordRun(stats: Stats, score: number, perfects: number, combo: number): Stats {
  return {
    played: stats.played + 1,
    blocks: stats.blocks + score,
    perfects: stats.perfects + perfects,
    bestCombo: Math.max(stats.bestCombo, combo),
    best: Math.max(stats.best, score),
  }
}

/** Blocks per run, to one decimal. Zero runs reads as 0 rather than NaN. */
export function averageScore(stats: Stats): number {
  if (stats.played <= 0) return 0
  return Math.round((stats.blocks / stats.played) * 10) / 10
}

export interface Milestone {
  id: string
  label: string
  hint: string
  reached: (stats: Stats) => boolean
}

/** Long-horizon goals, so there is something to chase beyond one run. */
export const MILESTONES: Milestone[] = [
  { id: 'first', label: 'First Steps', hint: 'Stack 10 blocks', reached: (s) => s.best >= 10 },
  { id: 'steady', label: 'Steady Hand', hint: 'Stack 25 blocks', reached: (s) => s.best >= 25 },
  { id: 'tower', label: 'Tower Block', hint: 'Stack 50 blocks', reached: (s) => s.best >= 50 },
  { id: 'sky', label: 'Skyline', hint: 'Stack 100 blocks', reached: (s) => s.best >= 100 },
  { id: 'streak5', label: 'In The Groove', hint: 'Chain 5 perfects', reached: (s) => s.bestCombo >= 5 },
  { id: 'streak15', label: 'Metronome', hint: 'Chain 15 perfects', reached: (s) => s.bestCombo >= 15 },
  { id: 'grind', label: 'Regular', hint: 'Play 25 runs', reached: (s) => s.played >= 25 },
  { id: 'mason', label: 'Master Mason', hint: 'Place 1,000 blocks total', reached: (s) => s.blocks >= 1000 },
]

export function unlockedCount(stats: Stats): number {
  return MILESTONES.reduce((n, m) => (m.reached(stats) ? n + 1 : n), 0)
}
