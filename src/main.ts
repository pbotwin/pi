import './style.css'
import { Game } from './game/Game'
import { Hud } from './ui/hud'

const canvas = document.getElementById('scene')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing <canvas id="scene">')

const hud = new Hud()
const game = new Game(canvas, hud)
game.run()

window.addEventListener('resize', () => game.resize())
window.addEventListener('orientationchange', () => {
  window.setTimeout(() => game.resize(), 120)
})

// Pointer events cover mouse, touch and pen in a single path.
window.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  game.tap()
}, { passive: false })

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault()
    game.tap()
  }
})

// Stop iOS double-tap zoom from swallowing rapid taps.
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false })
