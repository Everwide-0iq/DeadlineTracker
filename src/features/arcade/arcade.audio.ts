export class ArcadeAudio {
  private context: AudioContext | null = null
  private voices = new Set<OscillatorNode>()
  muted = false

  unlock() {
    if (this.muted) return
    try {
      this.context ??= new AudioContext()
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined)
    } catch { /* Audio is optional when a browser or device denies access. */ }
  }

  play(kind: 'shoot' | 'eat' | 'hit' | 'over' | 'start') {
    const ctx = this.context
    if (this.muted || !ctx || ctx.state !== 'running' || this.voices.size >= 10) return
    const notes = { shoot: [620, 210, .065], eat: [420, 920, .17], hit: [180, 48, .14], over: [220, 32, .5], start: [280, 840, .25] }
    const [from, to, length] = notes[kind]
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = kind === 'hit' || kind === 'over' ? 'sawtooth' : 'triangle'
    oscillator.frequency.setValueAtTime(from, ctx.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + length)
    gain.gain.setValueAtTime(kind === 'shoot' ? .035 : .065, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + length)
    oscillator.connect(gain).connect(ctx.destination)
    this.voices.add(oscillator)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices.delete(oscillator) }
    oscillator.start()
    oscillator.stop(ctx.currentTime + length)
  }

  silence() {
    for (const voice of this.voices) voice.stop()
    this.voices.clear()
  }

  destroy() {
    this.silence()
    if (this.context) void this.context.close().catch(() => undefined)
    this.context = null
  }
}
