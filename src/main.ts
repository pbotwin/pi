import './style.css'
import { Game } from './game/Game'
import { Shell } from './ui/shell'

const canvas = document.getElementById('scene')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing <canvas id="scene">')

const shell = new Shell()
const game = new Game(canvas, shell.hooks())
shell.attach(game)
game.run()

// Attract mode: ?demo or #demo makes the game play itself.
if (new URLSearchParams(location.search).has('demo') || location.hash === '#demo') {
  game.startDemo()
}

window.addEventListener('resize', () => game.resize())
window.addEventListener('orientationchange', () => {
  window.setTimeout(() => game.resize(), 120)
})

// Taps only mean "drop" while the game is actually on screen; when a menu is
// open the buttons handle their own clicks.
window.addEventListener('pointerdown', (e) => {
  if (shell.isMenuOpen) return
  e.preventDefault()
  game.tap()
}, { passive: false })

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.code !== 'Enter') return
  if (shell.isMenuOpen) return
  e.preventDefault()
  game.tap()
})

// Stop iOS double-tap zoom from eating rapid taps.
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false })

// Offline play, production only — a cache-first worker against a dev server
// would keep serving a stale shell through every edit.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline support is a bonus; the game works fine without it.
    })
  })
}
