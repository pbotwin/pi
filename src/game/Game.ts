import {
  AdditiveBlending, AmbientLight, BoxGeometry, Color, DirectionalLight, Fog,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, OrthographicCamera,
  RingGeometry, Scene, Vector3, WebGLRenderer,
} from 'three'

import {
  BLOCK_HEIGHT, BASE_SIZE, BUZZ_FAIL, BUZZ_PERFECT, BUZZ_PLACE, CAMERA_VIEW,
  DEBRIS_GRAVITY, DEBRIS_LIFE, MAX_SPEED, MIN_VIEW_WIDTH, SHAKE_DECAY,
  PERFECT_EPS, SHAKE_PERFECT, SHAKE_SLICE, SPEED_STEP, START_SPEED, SWING,
} from './config'
import { backdropColor, blockColor } from './palette'
import { axisForLevel, regrowFor, resolveDrop, type Axis, type Slab } from './tower'
import { Blips } from './audio'
import { Effects, buzz } from './effects'
/** What the game reports outwards. The app shell owns all the UI. */
export interface GameHooks {
  onScore(score: number): void
  onCombo(combo: number): void
  onGameOver(result: RunResult): void
  /** Height, in blocks, of the band to beat. Zero hides it. */
  bestHeight(): number
}

export interface RunResult {
  score: number
  perfects: number
  bestCombo: number
}

export interface Tuning {
  speedScale: number
  swingScale: number
}

type State = 'ready' | 'playing' | 'over'

interface Debris {
  mesh: Mesh
  vel: Vector3
  spin: Vector3
  life: number
}

/** Isometric offset from the camera's look target. */
const CAM_OFFSET = new Vector3(1, 0.82, 1).normalize().multiplyScalar(26)

export class Game {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new OrthographicCamera()
  private light = new DirectionalLight(0xffffff, 2.1)

  private geometry = new BoxGeometry(1, 1, 1)
  private slabMeshes: Mesh[] = []
  private debris: Debris[] = []

  private stack: Slab[] = []
  private moving: Mesh | null = null
  private movingAxis: Axis = 'x'
  private direction = 1
  private speed = START_SPEED

  private state: State = 'ready'
  private score = 0
  private combo = 0
  /** Gates restarts until the game-over panel is actually on screen. */
  private restartArmed = true

  private camTarget = new Vector3()
  private backdrop = new Color()
  private lastTime = 0
  private disposed = false
  private shake = 0
  private demo = false
  private demoCount = 0

  /** Flat ring parked at the player's best height — something to climb towards. */
  private bestMark: Mesh | null = null

  private blips = new Blips()
  private effects: Effects
  private hooks: GameHooks

  private perfects = 0
  private bestCombo = 0
  private tuning: Tuning = { speedScale: 1, swingScale: 1 }
  private allowHaptics = true
  private calmMotion = false

  constructor(canvas: HTMLCanvasElement, hooks: GameHooks) {
    this.hooks = hooks
    this.renderer = new WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true

    this.scene.add(new AmbientLight(0xffffff, 1.15))
    this.light.castShadow = true
    this.light.shadow.mapSize.set(1024, 1024)
    const sc = this.light.shadow.camera
    sc.left = -9
    sc.right = 9
    sc.top = 9
    sc.bottom = -9
    sc.near = 0.5
    sc.far = 60
    this.scene.add(this.light, this.light.target)

    this.backdrop.copy(backdropColor(0))
    this.scene.background = this.backdrop.clone()
    this.scene.fog = new Fog(this.backdrop.getHex(), 28, 70)

    this.effects = new Effects(this.scene)
    this.buildBestMark()

    this.reset()
    this.resize()
  }

  /** A faint band hovering at the height of the player's record run. */
  private buildBestMark(): void {
    const mesh = new Mesh(
      new RingGeometry(BASE_SIZE * 0.82, BASE_SIZE * 0.94, 4, 1),
      new MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: AdditiveBlending, depthWrite: false,
      }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.rotation.z = Math.PI / 4
    mesh.visible = false
    this.scene.add(mesh)
    this.bestMark = mesh
  }

  /** Show the record band only while the player is still below it. */
  private updateBestMark(): void {
    const mark = this.bestMark
    if (!mark) return
    const best = this.hooks.bestHeight()
    if (best <= 0 || this.score >= best) { mark.visible = false; return }
    mark.visible = true
    mark.position.set(0, best * BLOCK_HEIGHT, 0)
    const mat = mark.material as MeshBasicMaterial
    mat.opacity = 0.28
  }

  // ---------------------------------------------------------------- lifecycle

  reset(): void {
    for (const m of this.slabMeshes) this.scene.remove(m)
    for (const d of this.debris) this.scene.remove(d.mesh)
    if (this.moving) this.scene.remove(this.moving)
    this.slabMeshes = []
    this.debris = []
    this.stack = []
    this.moving = null
    this.score = 0
    this.combo = 0
    this.perfects = 0
    this.bestCombo = 0
    this.shake = 0
    this.effects.clear()
    this.speed = START_SPEED
    this.direction = 1

    const base: Slab = { x: 0, z: 0, w: BASE_SIZE, d: BASE_SIZE, y: 0 }
    this.stack.push(base)
    this.slabMeshes.push(this.addSlab(base, 0))

    // Snap straight to the base rather than gliding in from nowhere.
    this.camTarget.set(0, base.y, 0)
    this.camera.position.copy(this.camTarget).add(CAM_OFFSET)
    this.camera.lookAt(this.camTarget)

    this.hooks.onScore(0)
    this.hooks.onCombo(0)
    this.state = 'ready'
  }

  start(): void {
    if (this.state === 'playing') return
    this.reset()
    this.state = 'playing'
    this.spawnMoving()
  }

  // ------------------------------------------------------------------- meshes

  private addSlab(slab: Slab, index: number): Mesh {
    const mesh = new Mesh(this.geometry, new MeshLambertMaterial({ color: blockColor(index) }))
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.applyTransform(mesh, slab)
    this.scene.add(mesh)
    return mesh
  }

  private applyTransform(mesh: Mesh, slab: Slab): void {
    mesh.scale.set(slab.w, BLOCK_HEIGHT, slab.d)
    mesh.position.set(slab.x, slab.y, slab.z)
  }

  private get top(): Slab {
    const t = this.stack[this.stack.length - 1]
    if (!t) throw new Error('tower is empty')
    return t
  }

  private spawnMoving(): void {
    const prev = this.top
    const level = this.stack.length
    this.movingAxis = axisForLevel(level)

    const slab: Slab = { ...prev, y: prev.y + BLOCK_HEIGHT }
    // Alternate the entry side so the rhythm never gets predictable.
    this.direction = level % 4 < 2 ? 1 : -1
    const swing = SWING * this.tuning.swingScale
    if (this.movingAxis === 'x') slab.x = -this.direction * swing
    else slab.z = -this.direction * swing

    this.moving = this.addSlab(slab, level)
    this.speed = Math.min(MAX_SPEED, START_SPEED + level * SPEED_STEP) * this.tuning.speedScale
  }

  private spawnDebris(slab: Slab, index: number, sidewaysSign: number): void {
    const mesh = this.addSlab(slab, index)
    const push = this.movingAxis === 'x'
      ? new Vector3(sidewaysSign * 2.2, 1.5, 0)
      : new Vector3(0, 1.5, sidewaysSign * 2.2)
    this.debris.push({
      mesh,
      vel: push,
      spin: new Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6),
      life: DEBRIS_LIFE,
    })
  }

  // -------------------------------------------------------------------- input

  /** Attract mode: the game plays itself. Also how the loop gets smoke-tested. */
  startDemo(): void {
    this.demo = true
    this.start()
  }

  /**
   * Drop when the slab lines up. Every fourth drop is deliberately sloppy, so
   * the demo shows the slice and the dust as well as clean perfect rings.
   */
  private driveDemo(): void {
    const mesh = this.moving
    if (this.state === 'over') { if (this.restartArmed) this.start(); return }
    if (!mesh || this.state !== 'playing') return

    const prev = this.top
    const pos = this.movingAxis === 'x' ? mesh.position.x : mesh.position.z
    const prevPos = this.movingAxis === 'x' ? prev.x : prev.z
    const off = Math.abs(pos - prevPos)

    const sloppy = this.demoCount % 4 === 3
    const hit = sloppy ? off >= 0.34 && off <= 0.46 : off <= PERFECT_EPS * 0.45
    if (!hit) return
    this.demoCount += 1
    this.drop()
  }

  tap(): void {
    if (this.state === 'over') {
      // Swallow taps still landing from the run that just ended, so the score
      // is actually readable before a restart.
      if (this.restartArmed) this.start()
      return
    }
    if (this.state === 'ready') {
      this.start()
      return
    }
    this.drop()
  }

  private drop(): void {
    const mesh = this.moving
    if (!mesh) return

    const prev = this.top
    const level = this.stack.length
    const pos = this.movingAxis === 'x' ? mesh.position.x : mesh.position.z
    const prevPos = this.movingAxis === 'x' ? prev.x : prev.z
    const sign = Math.sign(pos - prevPos) || 1
    // The streak this drop would extend decides how much size comes back.
    const result = resolveDrop(
      prev, pos, this.movingAxis, prev.y + BLOCK_HEIGHT, regrowFor(this.combo + 1),
    )

    if (result.kind === 'miss') {
      this.scene.remove(mesh)
      this.moving = null
      this.spawnDebris(result.debris, level, sign)
      this.pulse(BUZZ_FAIL)
      this.shake = 1
      this.blips.fail()
      this.gameOver()
      return
    }

    if (result.kind === 'perfect') {
      this.combo += 1
      this.perfects += 1
      this.bestCombo = Math.max(this.bestCombo, this.combo)
      this.blips.perfect(this.combo)
      this.pulse(BUZZ_PERFECT)
      this.shake = Math.min(1, this.shake + SHAKE_PERFECT)
      const slab = result.slab
      // Push the ring towards white so it reads as a flash rather than a halo,
      // and brighten further as the streak climbs.
      const flash = blockColor(level).lerp(
        new Color(1, 1, 1), Math.min(0.85, 0.5 + this.combo * 0.06),
      )
      this.effects.perfectRing(
        slab.x, slab.y + BLOCK_HEIGHT * 0.55, slab.z,
        Math.max(slab.w, slab.d) / BASE_SIZE, flash,
      )
    } else {
      this.combo = 0
      this.blips.place(0)
      this.pulse(BUZZ_PLACE)
      this.shake = Math.min(1, this.shake + SHAKE_SLICE)
      this.spawnDebris(result.debris, level, sign)
      const d = result.debris
      this.effects.sliceDust(
        d.x, d.y, d.z,
        this.movingAxis === 'x' ? sign : 0,
        this.movingAxis === 'z' ? sign : 0,
        blockColor(level),
      )
    }

    this.applyTransform(mesh, result.slab)
    this.stack.push(result.slab)
    this.slabMeshes.push(mesh)
    this.moving = null

    this.score += 1
    this.hooks.onScore(this.score)
    this.hooks.onCombo(this.combo)

    this.spawnMoving()
  }

  private gameOver(): void {
    this.state = 'over'
    this.restartArmed = false
    this.hooks.onCombo(0)
    const result: RunResult = {
      score: this.score,
      perfects: this.perfects,
      bestCombo: this.bestCombo,
    }
    // Let the last slab tumble before the results land.
    window.setTimeout(() => {
      if (this.disposed || this.state !== 'over') return
      this.restartArmed = true
      this.hooks.onGameOver(result)
    }, 700)
  }

  /** Daily runs vary speed and travel; endless always uses the plain tuning. */
  setTuning(tuning: Tuning): void {
    this.tuning = tuning
  }

  setHaptics(on: boolean): void {
    this.allowHaptics = on
  }

  /** Damp the camera punch and shockwaves for motion sensitivity. */
  setReducedMotion(on: boolean): void {
    this.calmMotion = on
  }

  setSound(on: boolean): void {
    this.blips.setEnabled(on)
  }

  private pulse(ms: number): void {
    if (this.allowHaptics) buzz(ms)
  }

  // --------------------------------------------------------------------- loop

  private update(dt: number): void {
    const mesh = this.moving
    if (mesh && this.state === 'playing') {
      const axis = this.movingAxis
      const current = axis === 'x' ? mesh.position.x : mesh.position.z
      let next = current + this.direction * this.speed * dt
      const limit = SWING * this.tuning.swingScale
      if (Math.abs(next) >= limit) {
        next = Math.sign(next) * limit
        this.direction *= -1
      }
      if (axis === 'x') mesh.position.x = next
      else mesh.position.z = next
    }

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]!
      d.vel.y -= DEBRIS_GRAVITY * dt
      d.mesh.position.addScaledVector(d.vel, dt)
      d.mesh.rotation.x += d.spin.x * dt
      d.mesh.rotation.y += d.spin.y * dt
      d.mesh.rotation.z += d.spin.z * dt
      d.life -= dt
      if (d.life <= 0) {
        this.scene.remove(d.mesh)
        this.debris.splice(i, 1)
      }
    }

    if (this.demo) this.driveDemo()

    this.effects.update(dt)
    this.updateBestMark()

    // Camera trails the tower top so the active slab sits high in frame.
    const focus = this.top.y - CAMERA_VIEW * 0.18
    this.camTarget.y += (focus - this.camTarget.y) * Math.min(1, dt * 4)
    this.camera.position.copy(this.camTarget).add(CAM_OFFSET)

    // A short punch on impact, squared so it snaps back instead of wobbling.
    this.shake = Math.max(0, this.shake - dt * SHAKE_DECAY)
    if (this.shake > 0 && !this.calmMotion) {
      const s = this.shake * this.shake * 0.5
      this.camera.position.x += (Math.random() - 0.5) * s
      this.camera.position.y += (Math.random() - 0.5) * s
      this.camera.position.z += (Math.random() - 0.5) * s
    }
    this.camera.lookAt(this.camTarget)

    this.light.position.copy(this.camTarget).add(new Vector3(7, 16, 9))
    this.light.target.position.copy(this.camTarget)
    this.light.target.updateMatrixWorld()

    const want = backdropColor(this.stack.length)
    this.backdrop.lerp(want, Math.min(1, dt * 1.5))
    const bg = this.scene.background
    if (bg instanceof Color) bg.copy(this.backdrop)
    const fog = this.scene.fog
    if (fog instanceof Fog) fog.color.copy(this.backdrop)
  }

  private frame = (time: number): void => {
    if (this.disposed) return
    const dt = this.lastTime === 0 ? 0 : Math.min(0.05, (time - this.lastTime) / 1000)
    this.lastTime = time
    this.update(dt)
    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(this.frame)
  }

  run(): void {
    requestAnimationFrame(this.frame)
  }

  resize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setSize(w, h, false)

    const aspect = w / h
    // Portrait screens are narrow; widen the frustum so the tower never clips.
    let viewH = CAMERA_VIEW
    if (viewH * aspect < MIN_VIEW_WIDTH) viewH = MIN_VIEW_WIDTH / aspect
    const viewW = viewH * aspect

    this.camera.left = -viewW / 2
    this.camera.right = viewW / 2
    this.camera.top = viewH / 2
    this.camera.bottom = -viewH / 2
    this.camera.near = -60
    this.camera.far = 140
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.disposed = true
    this.renderer.dispose()
    this.geometry.dispose()
    this.effects.dispose()
  }
}
