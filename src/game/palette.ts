import { Color, SRGBColorSpace } from 'three'

/** Hue drifts steadily with height, so the tower becomes a gradient. */
function hueAt(index: number): number {
  return (204 + index * 6.5) % 360
}

// NB: setHSL defaults to the renderer's *linear* working space. Without an
// explicit sRGB tag these read roughly twice as light as authored.
export function blockColor(index: number): Color {
  return new Color().setHSL(hueAt(index) / 360, 0.55, 0.56, SRGBColorSpace)
}

export function backdropColor(index: number): Color {
  return new Color().setHSL(hueAt(index) / 360, 0.42, 0.09, SRGBColorSpace)
}
