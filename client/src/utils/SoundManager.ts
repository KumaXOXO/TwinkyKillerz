let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

function beep(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.18) {
  const c = getCtx()
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.connect(g)
  g.connect(c.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime)
  g.gain.setValueAtTime(gain, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration)
  osc.start(c.currentTime)
  osc.stop(c.currentTime + duration)
}

export const sounds = {
  resume() {
    getCtx().resume()
  },

  pieceMove() {
    beep(440, 0.08, "triangle", 0.12)
  },

  pieceCapture() {
    const c = getCtx()
    beep(220, 0.1, "sawtooth", 0.2)
    const osc2 = c.createOscillator()
    const g2 = c.createGain()
    osc2.connect(g2)
    g2.connect(c.destination)
    osc2.type = "sawtooth"
    osc2.frequency.setValueAtTime(180, c.currentTime + 0.05)
    g2.gain.setValueAtTime(0.15, c.currentTime + 0.05)
    g2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25)
    osc2.start(c.currentTime + 0.05)
    osc2.stop(c.currentTime + 0.25)
  },

  check() {
    beep(880, 0.12, "square", 0.22)
    setTimeout(() => beep(660, 0.1, "square", 0.18), 130)
  },

  roundWin() {
    const notes = [523, 659, 784, 1047]
    notes.forEach((freq, i) => setTimeout(() => beep(freq, 0.2, "triangle", 0.2), i * 120))
  },

  connect4Drop() {
    beep(330, 0.07, "triangle", 0.15)
  },

  connect4Win() {
    const notes = [392, 523, 659, 784]
    notes.forEach((freq, i) => setTimeout(() => beep(freq, 0.18, "triangle", 0.22), i * 100))
  },

  menuNav() {
    beep(500, 0.06, "triangle", 0.1)
  },

  menuConfirm() {
    beep(660, 0.08, "sine", 0.18)
    setTimeout(() => beep(880, 0.12, "sine", 0.18), 80)
  },

  connect4Thunk(detune = 0) {
    const c = getCtx()
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.connect(g)
    g.connect(c.destination)
    osc.type = "square"
    osc.frequency.setValueAtTime(120 + detune * 0.5, c.currentTime)
    g.gain.setValueAtTime(0.28, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18)
    osc.start(c.currentTime)
    osc.stop(c.currentTime + 0.18)
  },

  pieceLand(detune = 0) {
    const c = getCtx()
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.connect(g)
    g.connect(c.destination)
    osc.type = "triangle"
    osc.frequency.setValueAtTime(300 + detune * 0.3, c.currentTime)
    g.gain.setValueAtTime(0.14, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1)
    osc.start(c.currentTime)
    osc.stop(c.currentTime + 0.1)
  },

  wheelTick() {
    beep(900, 0.04, "triangle", 0.09)
  },
}
