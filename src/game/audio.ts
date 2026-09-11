/**
 * Tiny WebAudio blip generator. No asset files, no autoplay fight — the context
 * is created lazily on the first tap, which is always a user gesture.
 */
export class Blips {
  private ctx: AudioContext | null = null
  private muted = false
  private enabled = true

  /** Player setting. Muting never tears down the context, so it can resume. */
  setEnabled(on: boolean): void {
    this.enabled = on
  }

  private ensure(): AudioContext | null {
    if (this.muted || !this.enabled) return null
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) { this.muted = true; return null }
      this.ctx = new Ctor()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private tone(freq: number, duration: number, gain: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ensure()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    amp.gain.setValueAtTime(0, ctx.currentTime)
    amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.008)
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
    osc.connect(amp).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration + 0.02)
  }

  /** Pitch climbs with the combo so streaks sound like they're building. */
  place(combo: number): void {
    this.tone(220 * Math.pow(2, Math.min(combo, 12) / 12), 0.16, 0.18, 'triangle')
  }

  perfect(combo: number): void {
    this.tone(330 * Math.pow(2, Math.min(combo, 14) / 12), 0.22, 0.22, 'sine')
  }

  fail(): void {
    this.tone(120, 0.45, 0.2, 'sawtooth')
  }
}
