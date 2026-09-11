import './style.css'
import { Game } from './game/Game'
import { Hud } from './ui/hud'

const canvas = document.getElementById('scene')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing <canvas id="scene">')

const hud = new Hud()
const game = new Game(canvas, hud)
game.run()

// The title card stays up until the first tap, so the rules get read before
// anything moves — and that first tap never burns a shot.
const overlay = document.getElementById('overlay')
let started = false

// Attract mode: ?demo or #demo makes the game play itself.
if (new URLSearchParams(location.search).has('demo') || location.hash === '#demo') {
  started = true
  game.startDemo()
} else {
  overlay?.classList.add('show')
}

function beginPlay(): boolean {
  if (started) return false
  started = true
  overlay?.classList.remove('show')
  return true
}

window.addEventListener('resize', () => game.resize())
window.addEventListener('orientationchange', () => {
  window.setTimeout(() => game.resize(), 120)
})

/** Drag = aim, release = fire. A stab with no travel fires straight ahead. */
const TRAVEL_PX = 8
let pointerId: number | null = null
let startX = 0
let startY = 0
let travelled = false

window.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  if (pointerId !== null) return
  pointerId = e.pointerId
  startX = e.clientX
  startY = e.clientY
  travelled = false
  if (started) game.beginDrag()
}, { passive: false })

window.addEventListener('pointermove', (e) => {
  if (e.pointerId !== pointerId || !started) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  if (Math.hypot(dx, dy) > TRAVEL_PX) travelled = true
  game.updateDrag(dx, dy)
}, { passive: true })

function endPointer(e: PointerEvent): void {
  if (e.pointerId !== pointerId) return
  pointerId = null
  if (beginPlay()) return
  game.endDrag(e.clientX - startX, e.clientY - startY, travelled)
}

window.addEventListener('pointerup', endPointer)
window.addEventListener('pointercancel', endPointer)

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.code !== 'Enter') return
  e.preventDefault()
  if (beginPlay()) return
  game.tap()
})

// Stop iOS double-tap zoom from eating rapid taps.
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false })
