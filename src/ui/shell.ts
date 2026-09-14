import { Game, type RunResult } from '../game/Game'
import { load, save, remove } from '../app/storage'
import { dayKey, dailyTuning } from '../app/daily'
import { createLeaderboard, type BoardEntry, type Leaderboard } from '../app/leaderboard'
import {
  EMPTY_STATS, MILESTONES, TABLE_SIZE, addScore, averageScore, bestOf,
  rankOf, recordRun, unlockedCount,
  type Mode, type ScoreEntry, type Stats,
} from '../app/scores'
import { DEFAULT_SETTINGS, mergeSettings, sanitizeName, type Settings } from '../app/settings'

type Screen = 'menu' | 'scores' | 'stats' | 'settings' | 'howto' | 'over' | 'game'

const KEY_SCORES = 'pi.stack.scores'
const KEY_STATS = 'pi.stack.stats'
const KEY_SETTINGS = 'pi.stack.settings'

/** Player names arrive from other people; never let them become markup. */
function escapeHtml(raw: string): string {
  return raw.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  ))
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id} in index.html`)
  return node as T
}

/**
 * The app around the game: menu, score tables, stats, settings and the results
 * screen. Owns persistence and navigation; the game itself only reports events.
 */
export class Shell {
  private app = el('app')
  private hud = el('hud')
  private scoreEl = el('score')
  private comboEl = el('combo')
  private flashEl = el('flash')
  private flashTimer = 0
  private toastEl = el('toast')

  private screens = new Map<Screen, HTMLElement>()
  private board: Leaderboard = createLeaderboard()

  private table: ScoreEntry[] = load<ScoreEntry[]>(KEY_SCORES, [])
  private stats: Stats = load<Stats>(KEY_STATS, EMPTY_STATS)
  private settings: Settings = mergeSettings(load<unknown>(KEY_SETTINGS, DEFAULT_SETTINGS))

  private mode: Mode = 'endless'
  private boardTab: Mode = 'endless'
  private lastResult: RunResult | null = null
  private demoMode = false
  private game!: Game

  constructor() {
    for (const node of document.querySelectorAll<HTMLElement>('[data-screen]')) {
      this.screens.set(node.dataset.screen as Screen, node)
    }
    this.wireNav()
    this.wireSettings()
    this.wireScoreTabs()
    this.applySettings()
    this.wireRouting()
  }

  /**
   * Screens are addressable by hash, so links are shareable and the phone's
   * back gesture steps back through the menus instead of leaving the game.
   */
  private wireRouting(): void {
    window.addEventListener('hashchange', () => this.routeFromHash())
    this.routeFromHash()
  }

  private routeFromHash(): void {
    const raw = location.hash.replace(/^#/, '')
    // `#demo` is attract mode, handled in main.ts — never a screen.
    if (raw === 'demo') { this.show('menu'); return }
    const routable: Screen[] = ['menu', 'scores', 'stats', 'settings', 'howto']
    const screen = routable.includes(raw as Screen) ? (raw as Screen) : 'menu'
    if (screen === 'scores') void this.renderScores()
    if (screen === 'stats') this.renderStats()
    if (screen === 'settings') this.renderSettings()
    this.show(screen)
  }

  /** Update the address bar without re-entering the router. */
  private setHash(screen: Screen): void {
    const want = screen === 'menu' ? '' : `#${screen}`
    if (location.hash === want) return
    if (location.hash === 'demo') return
    history.replaceState(null, '', want || location.pathname + location.search)
  }

  /** Attract mode: show the result briefly, then play the next run. */
  enableDemo(): void {
    this.demoMode = true
    this.startRun('endless')
  }

  attach(game: Game): void {
    this.game = game
    this.applySettings()
  }

  // ---------------------------------------------------------------- plumbing

  private wireNav(): void {
    document.body.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')
      if (!target) return
      e.stopPropagation()
      this.go(target.dataset.go ?? 'menu')
    })

    el('quit').addEventListener('click', (e) => {
      e.stopPropagation()
      this.show('menu')
    })

    el('share').addEventListener('click', (e) => {
      e.stopPropagation()
      void this.share()
    })

    el('invite').addEventListener('click', (e) => {
      e.stopPropagation()
      void this.invite()
    })
  }

  private go(dest: string): void {
    switch (dest) {
      case 'play': this.startRun('endless'); break
      case 'daily': this.startRun('daily'); break
      case 'again': this.startRun(this.mode); break
      case 'scores': void this.renderScores(); this.show('scores'); break
      case 'stats': this.renderStats(); this.show('stats'); break
      case 'settings': this.renderSettings(); this.show('settings'); break
      case 'howto': this.show('howto'); break
      default: this.show('menu')
    }
  }

  private show(screen: Screen): void {
    if (screen !== 'game' && screen !== 'over') this.setHash(screen)
    const playing = screen === 'game'
    this.app.hidden = playing
    this.hud.hidden = !playing
    for (const [name, node] of this.screens) node.hidden = name !== screen
    if (screen === 'menu') el('menu-best').textContent = String(bestOf(this.table))
  }

  private toast(message: string): void {
    this.toastEl.textContent = message
    this.toastEl.classList.add('show')
    window.setTimeout(() => this.toastEl.classList.remove('show'), 1800)
  }

  // ------------------------------------------------------------------- rounds

  private startRun(mode: Mode): void {
    this.mode = mode
    // The daily challenge hands everyone the same variation for the day.
    this.game.setTuning(mode === 'daily'
      ? dailyTuning(new Date())
      : { speedScale: 1, swingScale: 1 })
    this.show('game')
    this.game.start()
  }

  /** Callbacks handed to the game. */
  hooks() {
    return {
      onScore: (n: number) => { this.scoreEl.textContent = String(n) },
      onCombo: (n: number) => {
        if (n >= 2) {
          this.comboEl.textContent = `PERFECT ×${n}`
          this.comboEl.classList.remove('hidden')
        } else {
          this.comboEl.classList.add('hidden')
        }
      },
      onFlash: (text: string, kind: 'good' | 'zone') => this.flash(text, kind),
      onGameOver: (result: RunResult) => { void this.finish(result) },
      bestHeight: () => bestOf(this.table),
    }
  }

  /** A brief banner over the HUD. A zone lingers longer than a near miss. */
  private flash(text: string, kind: 'good' | 'zone'): void {
    window.clearTimeout(this.flashTimer)
    this.flashEl.textContent = text
    this.flashEl.className = `show ${kind}`
    this.flashTimer = window.setTimeout(
      () => { this.flashEl.className = kind },
      kind === 'zone' ? 1500 : 600,
    )
  }

  private async finish(result: RunResult): Promise<void> {
    this.lastResult = result
    const now = Date.now()
    const entry: ScoreEntry = {
      score: result.score,
      combo: result.bestCombo,
      at: now,
      mode: this.mode,
      ...(this.mode === 'daily' ? { day: dayKey(new Date(now)) } : {}),
    }

    const previousBest = bestOf(this.table)
    const place = rankOf(this.table, entry)
    this.table = addScore(this.table, entry, TABLE_SIZE * 4)
    this.stats = recordRun(this.stats, result.score, result.perfects, result.bestCombo)
    save(KEY_SCORES, this.table)
    save(KEY_STATS, this.stats)

    const name = this.settings.name || 'Player'
    const board: BoardEntry = { name, score: result.score, combo: result.bestCombo, at: now }
    void this.board.submit(board, this.mode, entry.day)

    const beatenBest = result.score > previousBest
    el('over-title').textContent = beatenBest ? 'NEW BEST' : 'GAME OVER'
    el('over-score').textContent = String(result.score)
    el('over-best').textContent = String(bestOf(this.table))

    const bits = [`${result.perfects} perfect`]
    if (result.bestCombo >= 2) bits.push(`best streak ×${result.bestCombo}`)
    if (place) bits.push(`#${place} on this device`)
    el('over-detail').textContent = bits.join(' · ')

    this.show('over')
    if (this.demoMode) {
      window.setTimeout(() => { if (this.demoMode) this.startRun(this.mode) }, 2600)
    }
  }

  /** Hand out the link. Everyone who plays it lands on the same board. */
  private async invite(): Promise<void> {
    const url = location.origin + location.pathname
    const text = 'Play STACK — how high can you get?'
    try {
      if (navigator.share) {
        await navigator.share({ title: 'STACK', text, url })
        return
      }
      await navigator.clipboard.writeText(url)
      this.toast('LINK COPIED')
    } catch {
      // Share sheet dismissed, or clipboard blocked — neither is an error.
    }
  }

  private async share(): Promise<void> {
    const r = this.lastResult
    if (!r) return
    const label = this.mode === 'daily' ? `Daily ${dayKey(new Date())}` : 'Endless'
    const text = `STACK — ${label}: ${r.score} blocks, ${r.perfects} perfect `
      + `(best streak ×${r.bestCombo})`
    const url = location.origin + location.pathname
    try {
      if (navigator.share) {
        await navigator.share({ title: 'STACK', text, url })
        return
      }
      await navigator.clipboard.writeText(`${text}\n${url}`)
      this.toast('SCORE COPIED')
    } catch {
      // Share sheet dismissed, or clipboard blocked — neither is an error.
    }
  }

  // ------------------------------------------------------------------ screens

  private wireScoreTabs(): void {
    for (const tab of document.querySelectorAll<HTMLElement>('.tab')) {
      tab.addEventListener('click', (e) => {
        e.stopPropagation()
        this.boardTab = (tab.dataset.mode as Mode) ?? 'endless'
        for (const t of document.querySelectorAll('.tab')) t.classList.remove('is-on')
        tab.classList.add('is-on')
        void this.renderScores()
      })
    }
  }

  /**
   * The table comes from the leaderboard adapter, so the same screen renders
   * this device's scores or every player's without knowing which it got.
   */
  private async renderScores(): Promise<void> {
    const list = el('score-list')
    const mode = this.boardTab
    const global = this.board.kind === 'global'
    el('board-kind').textContent = global ? 'GLOBAL' : 'LOCAL'

    list.innerHTML = ''
    const loading = document.createElement('li')
    loading.className = 'empty'
    loading.textContent = 'Loading…'
    list.appendChild(loading)

    const today = dayKey(new Date())
    const rows = await this.board.top(mode, TABLE_SIZE, today)
    // A slow board must not overwrite a tab the player has since switched away
    // from, so bail if the selection moved while we were waiting.
    if (this.boardTab !== mode) return

    list.innerHTML = ''
    if (rows.length === 0) {
      const li = document.createElement('li')
      li.className = 'empty'
      li.textContent = mode === 'daily'
        ? 'No runs today yet. Play the daily challenge.'
        : 'No scores yet. Go stack something.'
      list.appendChild(li)
    }

    const mine = this.settings.name || 'Player'
    for (const [i, row] of rows.entries()) {
      const li = document.createElement('li')
      if (row.name === mine) li.classList.add('me')
      const when = new Date(row.at).toLocaleDateString()
      li.innerHTML = `<span class="rank">${i + 1}</span>`
        + `<span><span class="who">${escapeHtml(row.name)}</span>`
        + `<span class="meta">×${row.combo} · ${when}</span></span>`
        + `<span class="val">${row.score}</span>`
      list.appendChild(li)
    }

    el('board-note').textContent = global
      ? 'Global board — everyone who plays this link appears here.'
      : 'Saved on this device. See docs/LEADERBOARD.md to make it global.'
  }

  private renderStats(): void {
    const grid = el('stat-grid')
    const rows: [string, string][] = [
      ['BEST', String(this.stats.best)],
      ['RUNS', String(this.stats.played)],
      ['BLOCKS', String(this.stats.blocks)],
      ['PERFECTS', String(this.stats.perfects)],
      ['BEST STREAK', `×${this.stats.bestCombo}`],
      ['AVERAGE', String(averageScore(this.stats))],
    ]
    grid.innerHTML = rows
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
      .join('')

    el('milestone-count').textContent = `${unlockedCount(this.stats)}/${MILESTONES.length}`
    el('milestone-list').innerHTML = MILESTONES
      .map((m) => {
        const on = m.reached(this.stats)
        return `<li class="${on ? 'on' : ''}">`
          + `<span class="tick">${on ? '✓' : '○'}</span>`
          + `<span>${m.label}</span>`
          + `<span class="hint">${m.hint}</span></li>`
      })
      .join('')
  }

  private wireSettings(): void {
    const name = el<HTMLInputElement>('set-name')
    name.addEventListener('change', () => {
      this.settings.name = sanitizeName(name.value)
      name.value = this.settings.name
      this.persistSettings()
    })

    const bind = (id: string, key: 'sound' | 'haptics' | 'reducedMotion') => {
      const box = el<HTMLInputElement>(id)
      box.addEventListener('change', () => {
        this.settings[key] = box.checked
        this.persistSettings()
        this.applySettings()
      })
    }
    bind('set-sound', 'sound')
    bind('set-haptics', 'haptics')
    bind('set-motion', 'reducedMotion')

    el('wipe').addEventListener('click', (e) => {
      e.stopPropagation()
      // Deliberately not confirmed twice — everything here is local and cheap
      // to rebuild, and a modal on a phone is worse than the mistake.
      remove(KEY_SCORES)
      remove(KEY_STATS)
      this.table = []
      this.stats = EMPTY_STATS
      this.toast('DATA CLEARED')
    })
  }

  private renderSettings(): void {
    el<HTMLInputElement>('set-name').value = this.settings.name
    el<HTMLInputElement>('set-sound').checked = this.settings.sound
    el<HTMLInputElement>('set-haptics').checked = this.settings.haptics
    el<HTMLInputElement>('set-motion').checked = this.settings.reducedMotion
  }

  private persistSettings(): void {
    save(KEY_SETTINGS, this.settings)
  }

  private applySettings(): void {
    if (!this.game) return
    this.game.setSound(this.settings.sound)
    this.game.setHaptics(this.settings.haptics)
    this.game.setReducedMotion(this.settings.reducedMotion)
  }

  /** True while a screen is covering the game, so taps must not reach it. */
  get isMenuOpen(): boolean {
    return !this.app.hidden
  }
}
