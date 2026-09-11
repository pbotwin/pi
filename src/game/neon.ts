import {
  AdditiveBlending, BoxGeometry, Color, EdgesGeometry, Group, LineBasicMaterial,
  LineSegments, Mesh, MeshLambertMaterial, OctahedronGeometry, SRGBColorSpace,
} from 'three'

/** Neon palette. Bright, saturated, high contrast against a near-black world. */
const hsl = (h: number, s: number, l: number): Color =>
  new Color().setHSL(h / 360, s, l, SRGBColorSpace)

export const NEON = {
  pillar: hsl(190, 0.9, 0.55),
  beam: hsl(272, 0.85, 0.62),
  core: hsl(340, 0.95, 0.6),
  orb: hsl(52, 1.0, 0.62),
  grid: hsl(196, 0.9, 0.45),
  platform: hsl(210, 0.6, 0.1),
}

/**
 * Geometry shared by every destructible piece. A unit cube scaled per body
 * keeps the draw calls cheap and means fragments cost nothing extra to spawn.
 */
export class NeonGeometry {
  readonly box = new BoxGeometry(1, 1, 1)
  readonly edges = new EdgesGeometry(new BoxGeometry(1, 1, 1))
  readonly core = new OctahedronGeometry(0.62, 0)

  dispose(): void {
    this.box.dispose()
    this.edges.dispose()
    this.core.dispose()
  }
}

/**
 * A block: dark body lit from within, wrapped in a bright wireframe. The glow
 * comes from emissive material and additive edges rather than a bloom pass,
 * which keeps it cheap enough for a phone.
 */
export class NeonBlock {
  readonly group = new Group()
  private bodyMat: MeshLambertMaterial
  private edgeMat: LineBasicMaterial

  constructor(geo: NeonGeometry, color: Color, w: number, h: number, d: number) {
    this.bodyMat = new MeshLambertMaterial({
      color: color.clone().multiplyScalar(0.16),
      emissive: color.clone().multiplyScalar(0.32),
      transparent: true,
    })
    this.edgeMat = new LineBasicMaterial({
      color,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    })

    const mesh = new Mesh(geo.box, this.bodyMat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.scale.set(w, h, d)

    const wire = new LineSegments(geo.edges, this.edgeMat)
    wire.scale.set(w, h, d)

    this.group.add(mesh, wire)
  }

  setOpacity(o: number): void {
    this.bodyMat.opacity = o
    this.edgeMat.opacity = o
  }

  /** Flash white on impact, then decay back. */
  setHeat(heat: number, base: Color): void {
    this.bodyMat.emissive.copy(base).multiplyScalar(0.32).lerp(new Color(1, 1, 1), heat)
  }

  dispose(): void {
    this.bodyMat.dispose()
    this.edgeMat.dispose()
  }
}

/** A core: the thing you actually have to destroy. Pulses so it reads as a target. */
export class NeonCore {
  readonly group = new Group()
  private mat: MeshLambertMaterial
  private haloMat: MeshLambertMaterial

  constructor(geo: NeonGeometry, color: Color) {
    this.mat = new MeshLambertMaterial({
      color: color.clone().multiplyScalar(0.3),
      emissive: color,
      transparent: true,
    })
    this.haloMat = new MeshLambertMaterial({
      color: 0x000000,
      emissive: color,
      transparent: true,
      opacity: 0.28,
      blending: AdditiveBlending,
      depthWrite: false,
    })

    const solid = new Mesh(geo.core, this.mat)
    solid.castShadow = true

    const halo = new Mesh(geo.core, this.haloMat)
    halo.scale.setScalar(1.7)

    this.group.add(solid, halo)
  }

  pulse(t: number): void {
    const p = 0.85 + Math.sin(t * 5) * 0.15
    this.group.children[1]?.scale.setScalar(1.5 + p * 0.35)
    this.haloMat.opacity = 0.18 + p * 0.18
  }

  setOpacity(o: number): void {
    this.mat.opacity = o
    this.haloMat.opacity = o * 0.3
  }

  dispose(): void {
    this.mat.dispose()
    this.haloMat.dispose()
  }
}
