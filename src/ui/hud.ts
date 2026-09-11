function need<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id} in index.html`)
  return el as T
}

const BEST_KEY = 'pi.stack.best'

export class Hud {
  private scoreEl = need('score')
  private comboEl = need('combo')
  private overlayEl = need('overlay')
  private bestEl = need('best')
  private panelEl = need<HTMLElement>('overlay').querySelector('.panel') as HTMLElement

  best = 0

  constructor() {
    const stored = Number(localStorage.getItem(BEST_KEY) ?? '0')
    this.best = Number.isFinite(stored) && stored > 0 ? stored : 0
    this.bestEl.textContent = String(this.best)
  }

  setScore(n: number): void {
    this.scoreEl.textContent = String(n)
  }

  setCombo(n: number): void {
    if (n >= 2) {
      this.comboEl.textContent = `PERFECT ×${n}`
      this.comboEl.classList.remove('hidden')
    } else {
      this.comboEl.classList.add('hidden')
    }
  }

  /** Returns true when this run set a new record. */
  recordScore(n: number): boolean {
    if (n <= this.best) return false
    this.best = n
    localStorage.setItem(BEST_KEY, String(n))
    this.bestEl.textContent = String(n)
    return true
  }

  showGameOver(score: number, isRecord: boolean): void {
    this.panelEl.innerHTML = `
      <h1>${isRecord ? 'NEW BEST' : 'GAME OVER'}</h1>
      <p class="sub">You stacked <strong>${score}</strong> block${score === 1 ? '' : 's'}.</p>
      <p class="best">BEST <span id="best">${this.best}</span></p>
      <div class="cue">TAP TO RETRY</div>`
    this.overlayEl.classList.add('show')
  }

  hideOverlay(): void {
    this.overlayEl.classList.remove('show')
  }
}
