let ctx: AudioContext | null = null
let muted = false

export function setSoundMuted(v: boolean) { muted = v }
export function isSoundMuted() { return muted }

function getCtx(): AudioContext {
  if (muted) return null!
  if (!ctx) ctx = new AudioContext()
  return ctx
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  const c = getCtx()
  if (!c) return
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, c.currentTime)
  g.gain.setValueAtTime(volume, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration)
  o.connect(g).connect(c.destination)
  o.start()
  o.stop(c.currentTime + duration)
}

function playNoise(duration: number, volume = 0.08) {
  const c = getCtx()
  if (!c) return
  const buf = c.createBuffer(1, c.sampleRate * duration, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2)
  const src = c.createBufferSource()
  src.buffer = buf
  const g = c.createGain()
  g.gain.setValueAtTime(volume, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration)
  src.connect(g).connect(c.destination)
  src.start()
}

export function playLightToggle(on: boolean) {
  if (on) {
    playTone(1800, 0.06, 'square', 0.06)
    playTone(1200, 0.04, 'sine', 0.08)
  } else {
    playTone(1200, 0.06, 'square', 0.06)
    playTone(800, 0.04, 'sine', 0.08)
  }
}

export function playDoorToggle(open: boolean) {
  const c = getCtx()
  if (!c) return
  if (open) {
    // Creak open: low groan rising into a squeak
    const dur = 0.5
    const o1 = c.createOscillator()
    const g1 = c.createGain()
    o1.type = 'sawtooth'
    o1.frequency.setValueAtTime(90, c.currentTime)
    o1.frequency.linearRampToValueAtTime(160, c.currentTime + dur * 0.6)
    o1.frequency.linearRampToValueAtTime(200, c.currentTime + dur)
    g1.gain.setValueAtTime(0.08, c.currentTime)
    g1.gain.linearRampToValueAtTime(0.04, c.currentTime + dur * 0.5)
    g1.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur)
    o1.connect(g1).connect(c.destination)
    o1.start(); o1.stop(c.currentTime + dur)
    playNoise(dur * 0.8, 0.05)
    // Latch release click at the end
    setTimeout(() => playTone(800, 0.04, 'square', 0.05), dur * 1000)
  } else {
    // Close: thud + latch click
    const dur = 0.3
    playNoise(0.1, 0.1)  // thud
    setTimeout(() => playTone(1200, 0.03, 'square', 0.06), 150) // latch click
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(60, c.currentTime)
    o.frequency.exponentialRampToValueAtTime(20, c.currentTime + 0.15)
    g.gain.setValueAtTime(0.12, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15)
    o.connect(g).connect(c.destination)
    o.start(); o.stop(c.currentTime + 0.15)
  }
}

export function playGarageToggle(open: boolean) {
  const dur = 0.6
  playNoise(dur, 0.06)
  const c = getCtx()
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(open ? 100 : 80, c.currentTime)
  o.frequency.linearRampToValueAtTime(open ? 50 : 120, c.currentTime + dur)
  g.gain.setValueAtTime(0.05, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur)
  o.connect(g).connect(c.destination)
  o.start()
  o.stop(c.currentTime + dur)
}

export function playCurtainToggle(open: boolean) {
  playNoise(0.4, 0.04)
  playTone(open ? 300 : 250, 0.4, 'sine', 0.03)
}

export function playMediaToggle(on: boolean) {
  playTone(440, 0.1, 'sine', 0.1)
  if (on) {
    setTimeout(() => playTone(880, 0.15, 'sine', 0.08), 100)
  }
}

export function playSwitchToggle(on: boolean) {
  playTone(on ? 1500 : 1000, 0.04, 'square', 0.05)
}
