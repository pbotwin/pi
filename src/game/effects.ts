import {
  AdditiveBlending, BoxGeometry, Color, Group, Mesh, MeshBasicMaterial,
  RingGeometry, Scene,
} from 'three'
import {
  MOTE_COUNT, MOTE_GRAVITY, MOTE_LIFE, RING_LIFE, RING_MAX_SCALE,
} from './config'

interface Ring {
  mesh: Mesh
  life: number
}

interface Mote {
  mesh: Mesh
  vx: number
  vy: number
  vz: number
  life: number
}

/**
 * Purely cosmetic feedback: a shockwave ring for perfect drops and a puff of
 * dust where a slab gets sheared. Self-contained so the game loop only has to
 * say *what* happened, never how it looks.
 */
export class Effects {
  private ringGeo = new RingGeometry(0.55, 0.72, 40)
  private moteGeo = new BoxGeometry(1, 1, 1)
  private rings: Ring[] = []
  private motes: Mote[] = []
  private group = new Group()

  constructor(scene: Scene) {
    scene.add(this.group)
  }

  /** Shockwave lying flat on top of the slab that was just landed. */
  perfectRing(x: number, y: number, z: number, size: number, color: Color): void {
    const mesh = new Mesh(this.ringGeo, new MeshBasicMaterial({
      color, transparent: true, opacity: 0.95,
      blending: AdditiveBlending, depthWrite: false,
    }))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, y, z)
    mesh.scale.setScalar(size)
    this.group.add(mesh)
    this.rings.push({ mesh, life: RING_LIFE })
  }

  /** Dust thrown off the cut line, drifting the way the offcut went. */
  sliceDust(x: number, y: number, z: number, dirX: number, dirZ: number, color: Color): void {
    for (let i = 0; i < MOTE_COUNT; i++) {
      const mesh = new Mesh(this.moteGeo, new MeshBasicMaterial({
        color, transparent: true, opacity: 0.9, depthWrite: false,
      }))
      const s = 0.05 + Math.random() * 0.08
      mesh.scale.setScalar(s)
      mesh.position.set(
        x + (Math.random() - 0.5) * 0.5,
        y + (Math.random() - 0.5) * 0.3,
        z + (Math.random() - 0.5) * 0.5,
      )
      this.group.add(mesh)
      this.motes.push({
        mesh,
        vx: dirX * (1.2 + Math.random() * 2.2) + (Math.random() - 0.5) * 0.9,
        vy: 1.4 + Math.random() * 2.4,
        vz: dirZ * (1.2 + Math.random() * 2.2) + (Math.random() - 0.5) * 0.9,
        life: MOTE_LIFE * (0.6 + Math.random() * 0.6),
      })
    }
  }

  update(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!
      r.life -= dt
      const t = 1 - Math.max(0, r.life) / RING_LIFE
      r.mesh.scale.setScalar(r.mesh.scale.x + (RING_MAX_SCALE - 1) * dt * 4)
      ;(r.mesh.material as MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - t))
      if (r.life <= 0) this.retire(r.mesh, this.rings, i)
    }

    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i]!
      m.vy -= MOTE_GRAVITY * dt
      m.mesh.position.x += m.vx * dt
      m.mesh.position.y += m.vy * dt
      m.mesh.position.z += m.vz * dt
      m.life -= dt
      ;(m.mesh.material as MeshBasicMaterial).opacity = Math.max(0, m.life / MOTE_LIFE)
      if (m.life <= 0) this.retire(m.mesh, this.motes, i)
    }
  }

  private retire(mesh: Mesh, list: { mesh: Mesh }[], index: number): void {
    this.group.remove(mesh)
    ;(mesh.material as MeshBasicMaterial).dispose()
    list.splice(index, 1)
  }

  clear(): void {
    for (const r of this.rings) this.group.remove(r.mesh)
    for (const m of this.motes) this.group.remove(m.mesh)
    this.rings = []
    this.motes = []
  }

  dispose(): void {
    this.clear()
    this.ringGeo.dispose()
    this.moteGeo.dispose()
  }
}

/** Short haptic pulse. Silently does nothing where unsupported (iOS Safari). */
export function buzz(ms: number): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(ms)
  }
}
