/**
 * Score boards behind one interface.
 *
 * GitHub Pages is static, so there is nowhere to run a server. The local board
 * always works. If Supabase credentials are supplied at build time the remote
 * board takes over and scores become global — no other code has to change.
 *
 * Supabase's anon key is designed to be published; safety comes from row-level
 * security on the table, not from hiding the key. Never put a service-role key
 * here — that one is a real secret.
 */
import { load, save } from './storage'
import type { Mode } from './scores'

export interface BoardEntry {
  name: string
  score: number
  combo: number
  at: number
}

export interface Leaderboard {
  readonly kind: 'local' | 'global'
  /** Highest scores first. */
  top(mode: Mode, limit: number): Promise<BoardEntry[]>
  submit(entry: BoardEntry, mode: Mode, day?: string): Promise<boolean>
}

const LOCAL_KEY = 'pi.stack.board'

/** Everything the player has done on this device. Always available. */
export class LocalBoard implements Leaderboard {
  readonly kind = 'local' as const

  async top(mode: Mode, limit: number): Promise<BoardEntry[]> {
    const all = load<Record<string, BoardEntry[]>>(LOCAL_KEY, {})
    return (all[mode] ?? []).slice(0, limit)
  }

  async submit(entry: BoardEntry, mode: Mode): Promise<boolean> {
    const all = load<Record<string, BoardEntry[]>>(LOCAL_KEY, {})
    const next = [...(all[mode] ?? []), entry]
      .sort((a, b) => b.score - a.score || b.combo - a.combo || a.at - b.at)
      .slice(0, 50)
    all[mode] = next
    return save(LOCAL_KEY, all)
  }
}

interface SupabaseConfig { url: string; key: string }

function supabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (typeof url !== 'string' || typeof key !== 'string') return null
  if (!url.startsWith('https://') || key.length < 20) return null
  return { url: url.replace(/\/$/, ''), key }
}

/** PostgREST-backed global board. Any failure falls back to the local one. */
export class GlobalBoard implements Leaderboard {
  readonly kind = 'global' as const
  private fallback = new LocalBoard()

  constructor(private cfg: SupabaseConfig) {}

  private headers(): Record<string, string> {
    return {
      apikey: this.cfg.key,
      Authorization: `Bearer ${this.cfg.key}`,
      'Content-Type': 'application/json',
    }
  }

  async top(mode: Mode, limit: number): Promise<BoardEntry[]> {
    try {
      const q = new URLSearchParams({
        select: 'name,score,combo,at',
        mode: `eq.${mode}`,
        order: 'score.desc',
        limit: String(limit),
      })
      const res = await fetch(`${this.cfg.url}/rest/v1/scores?${q}`, { headers: this.headers() })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const rows: unknown = await res.json()
      if (!Array.isArray(rows)) return []
      return rows as BoardEntry[]
    } catch {
      return this.fallback.top(mode, limit)
    }
  }

  async submit(entry: BoardEntry, mode: Mode, day?: string): Promise<boolean> {
    // Always keep a local copy, so a network failure never loses the run.
    await this.fallback.submit(entry, mode)
    try {
      const res = await fetch(`${this.cfg.url}/rest/v1/scores`, {
        method: 'POST',
        headers: { ...this.headers(), Prefer: 'return=minimal' },
        body: JSON.stringify({ ...entry, mode, day: day ?? null }),
      })
      return res.ok
    } catch {
      return false
    }
  }
}

/** Global board when credentials were supplied at build time, local otherwise. */
export function createLeaderboard(): Leaderboard {
  const cfg = supabaseConfig()
  return cfg ? new GlobalBoard(cfg) : new LocalBoard()
}
