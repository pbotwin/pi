function need<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id} in index.html`)
  return el as T
}

const BEST_KEY = 'pi.overload.best'

export class Hud {
  private scoreEl = need('score')
  private levelEl = need('level')
  private shotsEl = need('shots')
  private coresEl = need('cores')
  private powerEl = need('power')
  private powerFill = need('power-fill')
  private overlayEl = need('overlay')
  private panelEl = need('overlay').querySelector('.panel') as HTMLElement

  best = 0

  constructor() {
    const stored = Number(localStorage.getItem(BEST_KEY) ?? '0')
    this.best = Number.isFinite(stored) && stored > 0 ? stored : 0
  }

  setScore(n: number): void { this.scoreEl.textContent = n.toLocaleString('en-US') }
  setLevel(n: number): void { this.levelEl.textContent = String(n) }
  setCores(n: number): void { this.coresEl.textContent = String(n) }

  /** Shots left, drawn as pips so it reads at a glance. */
  setShots(n: number): void {
    this.shotsEl.innerHTML = ''
    for (let i = 0; i < Math.max(n, 0); i++) {
      const pip = document.createElement('span')
      pip.className = 'pip'
      this.shotsEl.appendChild(pip)
    }
    if (n <= 0) this.shotsEl.textContent = 'LAST'
  }

  /** `power` is 0..1 while dragging, or negative to hide the meter. */
  setPower(power: number): void {
    if (power < 0) { this.powerEl.classList.remove('show'); return }
    this.powerEl.classList.add('show')
    this.powerFill.style.transform = `scaleX(${power.toFixed(3)})`
  }

  recordScore(n: number): boolean {
    if (n <= this.best) return false
    this.best = n
    localStorage.setItem(BEST_KEY, String(n))
    return true
  }

  showCleared(level: number, bonus: number): void {
    this.panelEl.innerHTML = `
      <h1>CLEARED</h1>
      <p class="sub">Sector ${level} down.<br>Unused charges banked <strong>+${bonus.toLocaleString('en-US')}</strong></p>
      <div class="cue">TAP FOR SECTOR ${level + 1}</div>`
    this.overlayEl.classList.add('show')
  }

  showGameOver(score: number, level: number, isRecord: boolean): void {
    this.panelEl.innerHTML = `
      <h1>${isRecord ? 'NEW BEST' : 'OUT OF CHARGES'}</h1>
      <p class="sub">Reached sector <strong>${level}</strong><br>Score <strong>${score.toLocaleString('en-US')}</strong></p>
      <p class="best">BEST ${this.best.toLocaleString('en-US')}</p>
      <div class="cue">TAP TO RESTART</div>`
    this.overlayEl.classList.add('show')
  }

  hideOverlay(): void { this.overlayEl.classList.remove('show') }
}
