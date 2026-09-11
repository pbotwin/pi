import {
  AmbientLight, BoxGeometry, Color, DirectionalLight, Fog, Mesh,
  MeshLambertMaterial, OrthographicCamera, Scene, Vector3, WebGLRenderer,
} from 'three'

import {
  BLOCK_HEIGHT, BASE_SIZE, CAMERA_VIEW, DEBRIS_GRAVITY, DEBRIS_LIFE,
  MAX_SPEED, MIN_VIEW_WIDTH, SPEED_STEP, START_SPEED, SWING,
} from './config'
import { backdropColor, blockColor } from './palette'
import { axisForLevel, resolveDrop, type Axis, type Slab } from './tower'
import { Blips } from './audio'
import type { Hud } from '../ui/hud'

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

  private blips = new Blips()
  private hud: Hud

  constructor(canvas: HTMLCanvasElement, hud: Hud) {
    this.hud = hud
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

    this.reset()
    this.resize()
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
    this.speed = START_SPEED
    this.direction = 1

    const base: Slab = { x: 0, z: 0, w: BASE_SIZE, d: BASE_SIZE, y: 0 }
    this.stack.push(base)
    this.slabMeshes.push(this.addSlab(base, 0))

    // Snap straight to the base rather than gliding in from nowhere.
    this.camTarget.set(0, base.y, 0)
    this.camera.position.copy(this.camTarget).add(CAM_OFFSET)
    this.camera.lookAt(this.camTarget)

    this.hud.setScore(0)
    this.hud.setCombo(0)
    this.state = 'ready'
  }

  start(): void {
    if (this.state === 'playing') return
    this.reset()
    this.state = 'playing'
    this.hud.hideOverlay()
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
    if (this.movingAxis === 'x') slab.x = -this.direction * SWING
    else slab.z = -this.direction * SWING

    this.moving = this.addSlab(slab, level)
    this.speed = Math.min(MAX_SPEED, START_SPEED + level * SPEED_STEP)
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
    const result = resolveDrop(prev, pos, this.movingAxis, prev.y + BLOCK_HEIGHT)

    if (result.kind === 'miss') {
      this.scene.remove(mesh)
      this.moving = null
      this.spawnDebris(result.debris, level, sign)
      this.blips.fail()
      this.gameOver()
      return
    }

    if (result.kind === 'perfect') {
      this.combo += 1
      this.blips.perfect(this.combo)
    } else {
      this.combo = 0
      this.blips.place(0)
      this.spawnDebris(result.debris, level, sign)
    }

    this.applyTransform(mesh, result.slab)
    this.stack.push(result.slab)
    this.slabMeshes.push(mesh)
    this.moving = null

    this.score += 1
    this.hud.setScore(this.score)
    this.hud.setCombo(this.combo)

    this.spawnMoving()
  }

  private gameOver(): void {
    this.state = 'over'
    this.restartArmed = false
    const isRecord = this.hud.recordScore(this.score)
    this.hud.setCombo(0)
    // Let the last slab tumble before the panel lands.
    window.setTimeout(() => {
      if (this.disposed || this.state !== 'over') return
      this.hud.showGameOver(this.score, isRecord)
      this.restartArmed = true
    }, 700)
  }

  // --------------------------------------------------------------------- loop

  private update(dt: number): void {
    const mesh = this.moving
    if (mesh && this.state === 'playing') {
      const axis = this.movingAxis
      const current = axis === 'x' ? mesh.position.x : mesh.position.z
      let next = current + this.direction * this.speed * dt
      if (Math.abs(next) >= SWING) {
        next = Math.sign(next) * SWING
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

    // Camera trails the tower top so the active slab sits high in frame.
    const focus = this.top.y - CAMERA_VIEW * 0.18
    this.camTarget.y += (focus - this.camTarget.y) * Math.min(1, dt * 4)
    this.camera.position.copy(this.camTarget).add(CAM_OFFSET)
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
  }
}
