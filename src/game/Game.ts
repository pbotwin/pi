import {
  AmbientLight, Color, DirectionalLight, Fog, GridHelper, Group, Mesh,
  MeshLambertMaterial, PerspectiveCamera, PlaneGeometry, PointLight,
  Scene, SphereGeometry, Vector3, WebGLRenderer,
} from 'three'
import * as CANNON from 'cannon-es'

import {
  CAM_FOV, CAM_LOOK, CAM_POS, CORE_IMPULSE, FRACTURE_IMPULSE,
  FRAGMENTS, GRAVITY, KILL_Y, MAX_BODIES, MUZZLE, ORB_MASS, ORB_R,
  PLATFORM_H, PLATFORM_R, SETTLE_TIME, SHOTS_BASE,
} from './config'
import { NEON, NeonBlock, NeonCore, NeonGeometry } from './neon'
import { buildStructure, makeRand, type Piece, type PieceKind } from './structure'
import { aimFromDrag, launchVelocity, samplePath, type Aim } from './trajectory'
import { Blips } from './audio'
import type { Hud } from '../ui/hud'

type State = 'aiming' | 'firing' | 'settling' | 'cleared' | 'over'
type Kind = PieceKind | 'fragment' | 'orb'

interface Entity {
  body: CANNON.Body
  group: Group
  view: NeonBlock | NeonCore
  kind: Kind
  color: Color
  heat: number
  age: number
  alive: boolean
}

const PLATFORM_TOP = PLATFORM_H

export class Game {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(CAM_FOV, 1, 0.1, 400)
  private world: CANNON.World

  private geo = new NeonGeometry()
  private entities: Entity[] = []
  private tracer: Mesh[] = []
  private orbLight = new PointLight(NEON.orb.getHex(), 0, 16, 2)

  private level = 1
  private shots = SHOTS_BASE
  private score = 0
  private state: State = 'aiming'
  private settleFor = 0
  private clock = 0
  private shake = 0

  private dragging = false
  private demo = false
  private demoWait = 0
  private aim: Aim = aimFromDrag(0, 0)

  private camBase = new Vector3(CAM_POS.x, CAM_POS.y, CAM_POS.z)
  private lastTime = 0
  private disposed = false
  private blips = new Blips()
  private hud: Hud

  constructor(canvas: HTMLCanvasElement, hud: Hud) {
    this.hud = hud
    this.renderer = new WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.scene.background = new Color(0x05060e)
    this.scene.fog = new Fog(0x05060e, 28, 68)

    this.scene.add(new AmbientLight(0x4a5a8a, 1.1))
    const key = new DirectionalLight(0x9fd8ff, 1.5)
    key.position.set(6, 16, 10)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    const sc = key.shadow.camera
    sc.left = -12; sc.right = 12; sc.top = 14; sc.bottom = -6
    sc.near = 1; sc.far = 48
    this.scene.add(key)
    this.scene.add(this.orbLight)

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) })
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.allowSleep = true
    this.world.defaultContactMaterial.friction = 0.42
    this.world.defaultContactMaterial.restitution = 0.06

    this.buildArena()
    this.buildTracer()
    this.loadLevel(1)
    this.resize()
  }

  // -------------------------------------------------------------------- arena

  private buildArena(): void {
    const ground = new Mesh(
      new PlaneGeometry(300, 300),
      new MeshLambertMaterial({ color: 0x05060e }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    const grid = new GridHelper(140, 70, NEON.grid.getHex(), NEON.grid.getHex())
    const gm = grid.material as { opacity: number; transparent: boolean }
    gm.transparent = true
    gm.opacity = 0.16
    grid.position.y = 0.012
    this.scene.add(grid)

    const platform = new NeonBlock(this.geo, NEON.grid, PLATFORM_R * 2, PLATFORM_H, 3.2)
    platform.group.position.set(0, PLATFORM_H / 2, 0)
    this.scene.add(platform.group)

    this.world.addBody(new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0),
    }))

    this.world.addBody(new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(PLATFORM_R, PLATFORM_H / 2, 1.6)),
      position: new CANNON.Vec3(0, PLATFORM_H / 2, 0),
    }))
  }

  /** Dots showing where the shot will land. Reused every frame, never reallocated. */
  private buildTracer(): void {
    const dotGeo = new SphereGeometry(0.075, 8, 6)
    for (let i = 0; i < 26; i++) {
      const dot = new Mesh(dotGeo, new MeshLambertMaterial({
        color: 0x000000, emissive: NEON.orb, transparent: true, opacity: 0.75,
      }))
      dot.visible = false
      this.tracer.push(dot)
      this.scene.add(dot)
    }
  }

  // -------------------------------------------------------------------- level

  private loadLevel(level: number): void {
    for (const e of this.entities) this.removeEntity(e)
    this.entities = []

    this.level = level
    this.shots = SHOTS_BASE
    this.state = 'aiming'
    this.settleFor = 0
    this.aim = aimFromDrag(0, 0)

    const pieces = buildStructure(level, PLATFORM_TOP, makeRand(level * 7919 + 13))
    for (const p of pieces) this.spawnPiece(p)

    this.hud.hideOverlay()
    this.hud.setLevel(level)
    this.hud.setShots(this.shots)
    this.hud.setCores(this.coresLeft)
    this.hud.setScore(this.score)
  }

  private spawnPiece(p: Piece): void {
    const color = p.kind === 'core' ? NEON.core : p.kind === 'beam' ? NEON.beam : NEON.pillar
    const mass = p.kind === 'core' ? 1.6 : p.kind === 'beam' ? 3.2 : 2.4

    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Box(new CANNON.Vec3(p.w / 2, p.h / 2, p.d / 2)),
      position: new CANNON.Vec3(p.x, p.y, p.z),
      sleepSpeedLimit: 0.22,
      sleepTimeLimit: 0.4,
    })
    body.allowSleep = true
    this.world.addBody(body)

    const view = p.kind === 'core'
      ? new NeonCore(this.geo, color)
      : new NeonBlock(this.geo, color, p.w, p.h, p.d)
    this.scene.add(view.group)

    const entity: Entity = {
      body, group: view.group, view, kind: p.kind, color, heat: 0, age: 0, alive: true,
    }
    this.entities.push(entity)

    body.addEventListener('collide', (e: { contact: CANNON.ContactEquation }) => {
      this.onCollide(entity, Math.abs(e.contact.getImpactVelocityAlongNormal()))
    })
  }

  private get coresLeft(): number {
    let n = 0
    for (const e of this.entities) if (e.kind === 'core' && e.alive) n++
    return n
  }

  // -------------------------------------------------------------- destruction

  private onCollide(entity: Entity, impact: number): void {
    if (!entity.alive || impact < 2) return
    entity.heat = Math.min(1, entity.heat + impact / 26)

    if (entity.kind === 'core') {
      if (impact >= CORE_IMPULSE) this.destroyCore(entity)
      return
    }
    if (entity.kind === 'fragment' || entity.kind === 'orb') return
    if (impact >= FRACTURE_IMPULSE && this.entities.length < MAX_BODIES) {
      this.fracture(entity)
    }
  }

  private destroyCore(entity: Entity): void {
    if (!entity.alive) return
    const at = entity.body.position.clone()
    this.removeEntity(entity)
    this.score += 500
    this.shake = Math.min(1, this.shake + 0.85)
    this.blips.perfect(10)
    this.burst(at, NEON.core, 9, 0.2)
    this.hud.setCores(this.coresLeft)
    this.hud.setScore(this.score)
  }

  /** Replace a block with a handful of tumbling shards. */
  private fracture(entity: Entity): void {
    const at = entity.body.position.clone()
    const vel = entity.body.velocity.clone()
    const color = entity.color
    this.removeEntity(entity)
    this.score += 25
    this.shake = Math.min(1, this.shake + 0.3)
    this.blips.place(0)
    this.burst(at, color, FRAGMENTS, 0.26, vel)
    this.hud.setScore(this.score)
  }

  /** Spawn small dynamic shards flying out of a point. */
  private burst(
    at: CANNON.Vec3, color: Color, count: number, size: number,
    inherit?: CANNON.Vec3,
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.entities.length >= MAX_BODIES) return
      const s = size * (0.6 + Math.random() * 0.8)
      const body = new CANNON.Body({
        mass: 0.35,
        shape: new CANNON.Box(new CANNON.Vec3(s / 2, s / 2, s / 2)),
        position: new CANNON.Vec3(
          at.x + (Math.random() - 0.5) * 0.5,
          at.y + (Math.random() - 0.5) * 0.5,
          at.z + (Math.random() - 0.5) * 0.5,
        ),
        sleepSpeedLimit: 0.4,
        sleepTimeLimit: 0.5,
      })
      body.velocity.set(
        (inherit?.x ?? 0) * 0.5 + (Math.random() - 0.5) * 9,
        (inherit?.y ?? 0) * 0.5 + Math.random() * 7,
        (inherit?.z ?? 0) * 0.5 + (Math.random() - 0.5) * 9,
      )
      body.angularVelocity.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
      )
      this.world.addBody(body)

      const view = new NeonBlock(this.geo, color, s, s, s)
      this.scene.add(view.group)
      this.entities.push({
        body, group: view.group, view, kind: 'fragment', color, heat: 1, age: 0, alive: true,
      })
    }
  }

  private removeEntity(entity: Entity): void {
    if (!entity.alive) return
    entity.alive = false
    this.world.removeBody(entity.body)
    this.scene.remove(entity.group)
    entity.view.dispose()
  }

  // -------------------------------------------------------------------- input

  beginDrag(): void {
    if (this.state !== 'aiming') return
    this.dragging = true
    this.aim = aimFromDrag(0, 0)
  }

  updateDrag(dx: number, dy: number): void {
    if (!this.dragging || this.state !== 'aiming') return
    this.aim = aimFromDrag(dx, dy)
  }

  endDrag(dx: number, dy: number, travelled: boolean): void {
    const wasDragging = this.dragging
    this.dragging = false
    if (this.state === 'cleared') { this.loadLevel(this.level + 1); return }
    if (this.state === 'over') { this.restart(); return }
    if (this.state !== 'aiming' || !wasDragging) return
    this.aim = aimFromDrag(travelled ? dx : 0, travelled ? dy : 0)
    this.fire()
  }

  /** Attract mode: the game plays itself. Also how the loop gets smoke-tested. */
  startDemo(): void {
    this.demo = true
    this.demoWait = 0.8
  }

  /** Pick a plausible shot and take it, with a beat between attempts. */
  private driveDemo(dt: number): void {
    if (this.state === 'cleared') { this.loadLevel(this.level + 1); return }
    if (this.state === 'over') { this.restart(); return }
    if (this.state !== 'aiming') return
    this.demoWait -= dt
    if (this.demoWait > 0) return
    this.demoWait = 1.4
    this.aim = aimFromDrag((Math.random() - 0.5) * 90, (Math.random() - 0.35) * 110)
    this.fire()
  }

  /** Advance menus from a keyboard, and fire straight with default power. */
  tap(): void {
    if (this.state === 'cleared') { this.loadLevel(this.level + 1); return }
    if (this.state === 'over') { this.restart(); return }
    if (this.state === 'aiming') this.fire()
  }

  private restart(): void {
    this.score = 0
    this.loadLevel(1)
  }

  private fire(): void {
    if (this.shots <= 0) return
    this.shots -= 1
    this.hud.setShots(this.shots)
    this.blips.place(4)

    const v = launchVelocity(this.aim)
    const body = new CANNON.Body({
      mass: ORB_MASS,
      shape: new CANNON.Sphere(ORB_R),
      position: new CANNON.Vec3(MUZZLE.x, MUZZLE.y, MUZZLE.z),
    })
    body.velocity.set(v.x, v.y, v.z)
    body.linearDamping = 0.02
    body.angularDamping = 0.55
    this.world.addBody(body)

    const view = new NeonBlock(this.geo, NEON.orb, ORB_R * 2, ORB_R * 2, ORB_R * 2)
    this.scene.add(view.group)
    this.entities.push({
      body, group: view.group, view, kind: 'orb', color: NEON.orb, heat: 1, age: 0, alive: true,
    })
    body.addEventListener('collide', (e: { contact: CANNON.ContactEquation }) => {
      if (Math.abs(e.contact.getImpactVelocityAlongNormal()) > 6) {
        this.shake = Math.min(1, this.shake + 0.35)
      }
    })

    this.state = 'firing'
    this.settleFor = 0
  }

  // --------------------------------------------------------------------- loop

  private updateTracer(): void {
    if (this.state !== 'aiming') {
      for (const dot of this.tracer) dot.visible = false
      return
    }
    const v = launchVelocity(this.aim)
    const path = samplePath(MUZZLE, v, this.tracer.length, 0.055, 0)
    for (let i = 0; i < this.tracer.length; i++) {
      const dot = this.tracer[i]!
      const p = path[i]
      dot.visible = !!p
      if (p) {
        dot.position.set(p.x, p.y, p.z)
        dot.scale.setScalar(1 - (i / this.tracer.length) * 0.6)
      }
    }
  }

  private syncViews(dt: number): void {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i]!
      if (!e.alive) { this.entities.splice(i, 1); continue }

      e.age += dt
      // Retire a spent orb so it cannot roll around the floor forever, and
      // sweep up shards that have come to rest far from the action.
      if (e.kind === 'orb' && (e.age > 5 || Math.abs(e.body.position.x) > 34 || e.body.position.z > 26)) {
        this.removeEntity(e)
        this.entities.splice(i, 1)
        continue
      }

      e.group.position.set(e.body.position.x, e.body.position.y, e.body.position.z)
      e.group.quaternion.set(
        e.body.quaternion.x, e.body.quaternion.y, e.body.quaternion.z, e.body.quaternion.w,
      )

      if (e.heat > 0) {
        e.heat = Math.max(0, e.heat - dt * 2.2)
        if (e.view instanceof NeonBlock) e.view.setHeat(e.heat, e.color)
      }
      if (e.view instanceof NeonCore) e.view.pulse(this.clock)

      // A core that falls off the world counts as destroyed, not lost.
      if (e.body.position.y < KILL_Y) {
        if (e.kind === 'core') this.destroyCore(e)
        else this.removeEntity(e)
        this.entities.splice(i, 1)
      }
    }
  }

  private orbBody(): CANNON.Body | null {
    for (const e of this.entities) if (e.kind === 'orb') return e.body
    return null
  }

  private isSettled(): boolean {
    for (const e of this.entities) {
      if (e.kind === 'fragment' || e.kind === 'orb') continue
      if (e.body.velocity.lengthSquared() > 0.35) return false
    }
    return true
  }

  private judge(dt: number): void {
    if (this.state !== 'firing' && this.state !== 'settling') return

    if (!this.isSettled()) { this.settleFor = 0; this.state = 'firing'; return }
    this.settleFor += dt
    this.state = 'settling'
    if (this.settleFor < SETTLE_TIME) return

    if (this.coresLeft === 0) {
      const bonus = this.shots * 250
      this.score += bonus
      this.hud.setScore(this.score)
      this.state = 'cleared'
      this.hud.showCleared(this.level, bonus)
      return
    }
    if (this.shots <= 0) {
      this.state = 'over'
      const isRecord = this.hud.recordScore(this.score)
      this.hud.showGameOver(this.score, this.level, isRecord)
      return
    }
    this.state = 'aiming'
  }

  private update(dt: number): void {
    this.clock += dt
    if (this.demo) this.driveDemo(dt)
    this.world.step(1 / 60, dt, 4)

    this.syncViews(dt)
    this.updateTracer()
    this.judge(dt)

    const orb = this.orbBody()
    if (orb) {
      this.orbLight.position.set(orb.position.x, orb.position.y, orb.position.z)
      this.orbLight.intensity = 30
    } else {
      this.orbLight.intensity *= 0.86
    }

    this.shake = Math.max(0, this.shake - dt * 2.4)
    const s = this.shake * this.shake * 0.42
    this.camera.position.set(
      this.camBase.x + (Math.random() - 0.5) * s,
      this.camBase.y + (Math.random() - 0.5) * s,
      this.camBase.z + (Math.random() - 0.5) * s,
    )
    this.camera.lookAt(CAM_LOOK.x, CAM_LOOK.y, CAM_LOOK.z)

    this.hud.setPower(this.state === 'aiming' && this.dragging ? this.aim.power : -1)
  }

  private frame = (time: number): void => {
    if (this.disposed) return
    const dt = this.lastTime === 0 ? 0 : Math.min(0.04, (time - this.lastTime) / 1000)
    this.lastTime = time
    this.update(dt)
    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(this.frame)
  }

  run(): void { requestAnimationFrame(this.frame) }

  resize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setSize(w, h, false)
    const aspect = w / h
    this.camera.aspect = aspect
    // Portrait is narrow; back off so the whole structure stays in frame.
    const fit = Math.min(1.55, Math.max(1, 0.62 / aspect))
    this.camBase.set(CAM_POS.x, CAM_POS.y * (0.7 + fit * 0.3), CAM_POS.z * fit)
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.disposed = true
    this.renderer.dispose()
    this.geo.dispose()
  }
}
