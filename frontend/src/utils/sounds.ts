let ctx: AudioContext | null = null
let muted = false
const cache = new Map<string, AudioBuffer>()

export function setSoundMuted(v: boolean) { muted = v }
export function isSoundMuted() { return muted }

function getCtx(): AudioContext {
  if (muted) return null!
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function renderTone(freq: number, dur: number, sr: number, type: OscillatorType = 'sine', vol = 0.15): AudioBuffer {
  const len = Math.max(1, Math.floor(sr * dur))
  const buf = ctx!.createBuffer(1, len, sr)
  const d = buf.getChannelData(0)
  const ramp = Math.floor(len * 0.05)
  for (let i = 0; i < len; i++) {
    const t = i / sr
    const env = i < ramp ? i / ramp : i > len - ramp ? (len - i) / ramp : 1
    let v = 0
    if (type === 'sine') v = Math.sin(2 * Math.PI * freq * t)
    else if (type === 'square') v = Math.sin(2 * Math.PI * freq * t) >= 0 ? 1 : -1
    else if (type === 'sawtooth') v = 2 * ((freq * t) % 1) - 1
    else v = Math.sin(2 * Math.PI * freq * t)
    d[i] = v * vol * env
  }
  return buf
}

function renderNoise(dur: number, sr: number, vol = 0.08): AudioBuffer {
  const len = Math.max(1, Math.floor(sr * dur))
  const buf = ctx!.createBuffer(1, len, sr)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    const env = Math.pow(1 - i / len, 2)
    d[i] = (Math.random() * 2 - 1) * vol * env
  }
  return buf
}

function getBuf(key: string, gen: () => AudioBuffer): AudioBuffer {
  let b = cache.get(key)
  if (!b) { b = gen(); cache.set(key, b) }
  return b
}

function playBuf(buf: AudioBuffer, vol = 1, delay = 0) {
  const c = getCtx()
  if (!c) return
  try {
    const src = c.createBufferSource()
    const g = c.createGain()
    src.buffer = buf
    g.gain.value = vol
    src.connect(g); g.connect(c.destination)
    src.start(c.currentTime + delay)
  } catch {}
}

export function playTone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15) {
  const c = getCtx()
  if (!c) return
  const key = `t_${freq}_${dur}_${type}_${vol}`
  playBuf(getBuf(key, () => renderTone(freq, dur, c.sampleRate, type, vol)))
}

function playNoise(dur: number, vol = 0.08) {
  const c = getCtx()
  if (!c) return
  const key = `n_${dur}_${vol}`
  playBuf(getBuf(key, () => renderNoise(dur, c.sampleRate, vol)))
}

export function playDing() {
  playTone(1000, 0.06, 'sine', 0.08)
}

export function playLightToggle(on: boolean) {
  playTone(on ? 1800 : 1200, 0.06, 'sine', 0.08)
  setTimeout(() => playTone(on ? 1200 : 800, 0.04, 'sine', 0.06), 40)
}

export function playDoorToggle(open: boolean) {
  if (open) {
    playNoise(0.3, 0.05)
    playTone(100, 0.3, 'sawtooth', 0.04)
    setTimeout(() => playTone(600, 0.04, 'sine', 0.04), 250)
  } else {
    playNoise(0.08, 0.1)
    setTimeout(() => playTone(70, 0.1, 'sine', 0.1), 40)
    setTimeout(() => playTone(1200, 0.03, 'sine', 0.06), 180)
  }
}

export function playGarageToggle(open: boolean) {
  playNoise(0.4, 0.05)
  playTone(open ? 80 : 60, 0.4, 'sawtooth', 0.04)
}

export function playCurtainToggle(open: boolean) {
  playNoise(0.3, 0.04)
  playTone(open ? 300 : 250, 0.3, 'sine', 0.03)
}

export function playMediaToggle(on: boolean) {
  playTone(440, 0.1, 'sine', 0.1)
  if (on) setTimeout(() => playTone(880, 0.15, 'sine', 0.08), 100)
}

export function playSwitchToggle(on: boolean) {
  playTone(on ? 1500 : 1000, 0.04, 'sine', 0.05)
}

// ── Music player for media_player entities ────────────────────────────
let musicAudio: HTMLAudioElement | null = null
let musicUrl: string | null = null

export function startMusic() {
  stopMusic()
  const url = '/music.wav?_=' + Date.now()
  const audio = new Audio(url)
  audio.loop = true
  audio.volume = 0.3
  audio.play().catch((e) => console.warn('Music:', e.message))
  musicAudio = audio
}

export function stopMusic() {
  if (musicAudio) { musicAudio.pause(); musicAudio = null }
}

// ── Voice / Speech ───────────────────────────────────────────────────────
let voiceEnabled = true
export function setVoiceEnabled(v: boolean) { voiceEnabled = v }
export function isVoiceEnabled() { return voiceEnabled }

export type Lang = 'en' | 'zh' | 'fa'
const LANG_VOICES: Record<Lang, { lang: string; label: string }> = {
  en: { lang: 'en-US', label: 'EN' },
  zh: { lang: 'zh-CN', label: '中文' },
  fa: { lang: 'fa-IR', label: 'فارسی' },
}
let currentLang: Lang = 'en'
export function setLang(l: Lang) { currentLang = l }
export function getLang() { return currentLang }

let cachedVoices: SpeechSynthesisVoice[] | null = null
function getVoices() {
  if (cachedVoices) return cachedVoices
  cachedVoices = speechSynthesis.getVoices()
  return cachedVoices
}
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.getVoices()
  speechSynthesis.onvoiceschanged = () => { cachedVoices = speechSynthesis.getVoices() }
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = getVoices()
  return voices.find(v => v.lang.startsWith(lang) && v.localService)
    || voices.find(v => v.lang.startsWith(lang))
}

function say(text: string, lang: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const msg = new SpeechSynthesisUtterance(text)
  const voice = pickVoice(lang)
  if (voice) msg.voice = voice
  msg.lang = lang
  msg.rate = 0.9
  msg.pitch = 1.1
  msg.volume = 0.8
  window.speechSynthesis.speak(msg)
}

const STATE_WORDS: Record<Lang, Record<string, string>> = {
  en: { on: 'on', off: 'off', open: 'open', closed: 'closed' },
  zh: { on: '开', off: '关', open: '开', closed: '关' },
  fa: { on: 'روشن', off: 'خاموش', open: 'باز', closed: 'بسته' },
}

const NAME_TRANSLATIONS: Record<Lang, Record<string, string>> = {
  en: {},
  zh: {
    'Living Room Light': '客厅灯', 'Bedroom Light': '卧室灯', 'Kitchen Light': '厨房灯',
    'Kitchen Ceiling': '厨房吊灯', 'Dining Room Light': '餐厅灯', 'Office Light': '办公室灯',
    'Living Room Fan': '客厅风扇', 'TV Switch': '电视开关', 'Alarm Siren': '警报器',
    'Front Door': '前门', 'Back Door': '后门', 'Garage Door': '车库门',
    'Motion Sensor': ' motion 传感器', 'Temperature': '温度', 'Humidity': '湿度',
    'Living Room Speaker': '客厅音箱', 'Bedroom Speaker': '卧室音箱',
  },
  fa: {
    'Living Room Light': 'چراغ پذیرایی', 'Bedroom Light': 'چراغ خواب', 'Kitchen Light': 'چراغ آشپزخانه',
    'Kitchen Ceiling': 'سقفی آشپزخانه', 'Dining Room Light': 'چراغ ناهارخوری', 'Office Light': 'چراغ دفتر',
    'Living Room Fan': 'پنکه پذیرایی', 'TV Switch': 'کلید تلویزیون', 'Alarm Siren': 'آژیر خطر',
    'Front Door': 'در جلو', 'Back Door': 'در عقب', 'Garage Door': 'در گاراژ',
    'Motion Sensor': 'حسگر حرکت', 'Temperature': 'دما', 'Humidity': 'رطوبت',
    'Living Room Speaker': 'بلندگوی پذیرایی', 'Bedroom Speaker': 'بلندگوی خواب',
  },
}

function translateName(name: string, lang: Lang): string {
  return NAME_TRANSLATIONS[lang][name] || name
}

export function speakText(text: string) {
  if (!voiceEnabled) return
  say(text, LANG_VOICES[currentLang].lang)
}

export function speakState(entityName: string, state: string) {
  if (!voiceEnabled) return
  const lang = LANG_VOICES[currentLang].lang
  const label = state === 'on' ? STATE_WORDS[currentLang].on
    : state === 'off' ? STATE_WORDS[currentLang].off
    : state === 'open' ? STATE_WORDS[currentLang].open
    : STATE_WORDS[currentLang].closed
  const tName = translateName(entityName, currentLang)
  if (currentLang === 'fa') {
    say(`${label} ${tName}`, lang)
  } else {
    say(`${tName} ${label}`, lang)
  }
}
