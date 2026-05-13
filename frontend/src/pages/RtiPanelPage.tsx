import { useState, useEffect, useCallback, memo, lazy, Suspense, createContext, useContext, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useHa } from '../context/HaContext'
import type { HaState } from '../context/HaContext'
import {
  playLightToggle, playDoorToggle, playGarageToggle, playMediaToggle,
  playSwitchToggle, playDing, speakState, speakText, getLang, setLang,
} from '../utils/sounds'

const FloorPlan3D = lazy(() => import('./FloorPlanPage'))

// ─── Types & i18n ─────────────────────────────────────────────────────────────

type Mode  = '3d' | '2d'
type Cat   = 'security' | 'music' | 'lights' | 'theater' | 'climate' | 'garage'
type Theme = 'dark' | 'day'
type Lang  = 'en' | 'zh' | 'fa'

const LANG_LIST: Lang[] = ['en', 'zh', 'fa']

const TR: Record<Lang, {
  cats: Record<Cat, string>
  on: string; off: string; open: string; closed: string
  detected: string; clear: string
  armHome: string; armAway: string; disarm: string
  bri: string; vol: string; langBtn: string
  noDevices: string; heating: string; cooling: string; idle: string
}> = {
  en: {
    cats: { security:'Security', music:'Music', lights:'Lights', theater:'Theater', climate:'Climate', garage:'Garage' },
    on:'ON', off:'OFF', open:'OPEN', closed:'CLOSED', detected:'DETECTED', clear:'CLEAR',
    armHome:'ARM HOME', armAway:'ARM AWAY', disarm:'DISARM', bri:'bri', vol:'vol', langBtn:'EN',
    noDevices:'No devices', heating:'Heating', cooling:'Cooling', idle:'Idle',
  },
  zh: {
    cats: { security:'安防', music:'音乐', lights:'灯光', theater:'影院', climate:'气候', garage:'车库' },
    on:'开', off:'关', open:'开门', closed:'关闭', detected:'已检测', clear:'正常',
    armHome:'在家布防', armAway:'离家布防', disarm:'撤防', bri:'亮', vol:'音量', langBtn:'中文',
    noDevices:'无设备', heating:'加热中', cooling:'制冷中', idle:'待机',
  },
  fa: {
    cats: { security:'امنیت', music:'موسیقی', lights:'چراغ‌ها', theater:'سینما', climate:'آب‌وهوا', garage:'گاراژ' },
    on:'روشن', off:'خاموش', open:'باز', closed:'بسته', detected:'تشخیص', clear:'پاک',
    armHome:'حالت خانه', armAway:'حالت خروج', disarm:'غیرفعال', bri:'روشنایی', vol:'صدا', langBtn:'فارسی',
    noDevices:'دستگاهی نیست', heating:'گرمایش', cooling:'سرمایش', idle:'آماده',
  },
}

const LangCtx  = createContext<Lang>('en')
const ThemeCtx = createContext<Theme>('dark')
const SoundCtx = createContext<number>(0) // 0=mute 1=ding 2=voice

const useT  = () => TR[useContext(LangCtx)]
const useTh = () => useContext(ThemeCtx)
const useSoundMode = () => useContext(SoundCtx)

const CATS: { id: Cat; icon: string }[] = [
  { id: 'security', icon: '🔒' },
  { id: 'music',    icon: '🎵' },
  { id: 'lights',   icon: '💡' },
  { id: 'theater',  icon: '🎬' },
  { id: 'climate',  icon: '🌡️' },
  { id: 'garage',   icon: '🚗' },
]

// ─── Layout constants ─────────────────────────────────────────────────────────
const SIDE_W = 52   // right sidebar
const TAB_H  = 68   // portrait bottom category nav
const TAB_W  = 68   // landscape left category nav

// ─── Theme helpers ─────────────────────────────────────────────────────────────

function cardSt(th: Theme, ov?: React.CSSProperties): React.CSSProperties {
  return {
    background: th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)',
    border: `1px solid ${th === 'day' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)'}`,
    boxShadow: th === 'day' ? '0 2px 10px rgba(0,0,0,0.07)' : 'none',
    borderRadius: 18, padding: '14px 12px', display: 'flex',
    flexDirection: 'column', gap: 8, minHeight: 110,
    ...ov,
  }
}

function mkBtn(active: boolean, danger = false, th: Theme = 'dark'): React.CSSProperties {
  return {
    border: 'none', borderRadius: 10, padding: '9px 0',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: active
      ? danger ? 'rgba(255,69,58,0.25)' : 'rgba(10,132,255,0.25)'
      : th === 'day' ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)',
    color: active ? (danger ? '#ff453a' : '#4d8fff') : th === 'day' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)',
    flex: 1,
  }
}

const tc1 = (th: Theme) => th === 'day' ? '#1c1c1e' : 'rgba(255,255,255,0.88)'
const tc2 = (th: Theme) => th === 'day' ? 'rgba(0,0,0,0.38)' : 'rgba(255,255,255,0.32)'

// ─── Hooks ─────────────────────────────────────────────────────────────────────

function useIsLandscape() {
  const get = () => window.innerWidth > window.innerHeight
  const [ls, setLs] = useState(get)
  useEffect(() => {
    const upd = () => setLs(get())
    window.addEventListener('resize', upd)
    window.addEventListener('orientationchange', upd)
    return () => { window.removeEventListener('resize', upd); window.removeEventListener('orientationchange', upd) }
  }, [])
  return ls
}

function useClock() {
  const fmt = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const [t, setT] = useState(fmt)
  useEffect(() => { const id = setInterval(() => setT(fmt()), 10000); return () => clearInterval(id) }, [])
  return t
}

// ─── CSS injection ─────────────────────────────────────────────────────────────

function useRtiStyles() {
  useEffect(() => {
    const id = 'rti-styles'
    if (document.getElementById(id)) return
    const s = document.createElement('style')
    s.id = id
    s.textContent = `
@keyframes bulbFloat{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes eqA{0%{height:3px}100%{height:20px}}
@keyframes eqB{0%{height:14px}100%{height:5px}}
@keyframes eqC{0%{height:7px}100%{height:22px}}
@keyframes eqD{0%{height:17px}100%{height:4px}}
@keyframes alarmRing{0%,100%{box-shadow:0 0 6px rgba(255,69,58,0.2)}50%{box-shadow:0 0 28px rgba(255,69,58,0.65)}}
@keyframes sensorPing{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.35;transform:scale(0.82)}}
@keyframes tempFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes speakerPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.13)}}
@keyframes garageUp{from{transform:translateY(0)}to{transform:translateY(-100%)}}
@keyframes garageDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}
.rti-slider{-webkit-appearance:none;appearance:none;height:10px;border-radius:8px;outline:none;cursor:pointer;width:100%;touch-action:none}
.rti-slider::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.95);box-shadow:0 2px 10px rgba(0,0,0,0.4);cursor:grab;border:none;transition:transform 0.15s}
.rti-slider::-webkit-slider-thumb:active{cursor:grabbing;transform:scale(1.15)}
.rti-slider::-moz-range-thumb{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.95);box-shadow:0 2px 10px rgba(0,0,0,0.4);cursor:grab;border:none}
    `
    document.head.appendChild(s)
    return () => { document.getElementById(id)?.remove() }
  }, [])
}

// ─── Sound helper ──────────────────────────────────────────────────────────────

function useSound() {
  const soundMode = useSoundMode()
  const lang = useContext(LangCtx)
  return useCallback((type: 'light' | 'door' | 'garage' | 'switch' | 'media', on: boolean, name?: string) => {
    if (soundMode === 0) return
    if (soundMode === 1) { playDing(); return }
    if (type === 'light')  playLightToggle(on)
    else if (type === 'door')   playDoorToggle(on)
    else if (type === 'garage') playGarageToggle(on)
    else if (type === 'media')  playMediaToggle(on)
    else playSwitchToggle(on)
    if (name) {
      const stateWord = (type === 'door' || type === 'garage') ? (on ? 'open' : 'closed') : (on ? 'on' : 'off')
      speakState(name, stateWord)
    }
  }, [soundMode, lang])
}

// ─── REST service call (more reliable than WebSocket callService) ──────────────

function useRestCall() {
  const { token } = useHa()
  return useCallback((domain: string, service: string, data: Record<string, unknown>, entityId: string | string[]) => {
    if (!token) return
    fetch(`/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ service_data: data, target: { entity_id: entityId } }),
    }).catch(() => {})
  }, [token])
}

// ─── EQ Bars ───────────────────────────────────────────────────────────────────

function EqBars({ active }: { active: boolean }) {
  const defs = [{ a: 'eqA', d: '0.55s' }, { a: 'eqB', d: '0.42s' }, { a: 'eqC', d: '0.68s' }, { a: 'eqD', d: '0.38s' }]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 18, marginLeft: 4, flexShrink: 0 }}>
      {defs.map((d, i) => (
        <div key={i} style={{
          width: 3, alignSelf: 'flex-end', borderRadius: 2,
          background: active ? '#4d8fff' : 'rgba(128,128,128,0.3)',
          animation: active ? `${d.a} ${d.d} ease-in-out infinite alternate` : 'none',
          height: active ? undefined : 3, transition: 'background 0.3s',
        }} />
      ))}
    </div>
  )
}

function tempColor(v: number, dc: string): string {
  if (dc !== 'temperature') return '#4d8fff'
  if (v < 16) return '#0af3ff'
  if (v < 20) return '#30d158'
  if (v < 24) return '#ffd60a'
  if (v < 28) return '#ff9f0a'
  return '#ff453a'
}

// ─── Fancy Slider ─────────────────────────────────────────────────────────────

interface FancySliderProps {
  value: number; min?: number; max?: number
  onChange: (v: number) => void
  color: string; unit?: string
}

function FancySlider({ value, min = 0, max = 100, onChange, color, unit = '%' }: FancySliderProps) {
  const th = useTh()
  const [dragging, setDragging] = useState(false)
  const [local, setLocal] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!dragging) setLocal(value) }, [value, dragging])

  const pct = Math.round(((local - min) / (max - min)) * 100)
  const inactive = th === 'day' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)'
  const trackBg = `linear-gradient(to right,${color} ${pct}%,${inactive} ${pct}%)`

  useEffect(() => {
    if (ref.current) ref.current.style.background = trackBg
  }, [trackBg])

  const handle = (v: number) => { setLocal(v); onChange(v) }

  return (
    <div style={{ position: 'relative', paddingTop: dragging ? 22 : 0, transition: 'padding 0.1s' }}>
      {dragging && (
        <div style={{
          position: 'absolute', top: 0,
          left: `clamp(14px, calc(${pct}% - 0px), calc(100% - 18px))`,
          transform: 'translateX(-50%)',
          background: color, color: '#fff',
          borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 700,
          pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
        }}>{local}{unit}</div>
      )}
      <input
        ref={ref} type="range" min={min} max={max} value={local}
        className="rti-slider"
        onChange={e => handle(Number(e.target.value))}
        onPointerDown={e => { e.stopPropagation(); setDragging(true) }}
        onPointerUp={e => { e.stopPropagation(); setDragging(false) }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%' }}
      />
    </div>
  )
}

// ─── Bulb ─────────────────────────────────────────────────────────────────────

const BULB_SRC = '/bulb.png'

function BulbImg({ on, bPct }: { on: boolean; bPct: number }) {
  const b = bPct / 100
  const glow = 8 + b * 34
  const warmG = Math.round(155 + b * 80)   // 155 (deep orange) → 235 (bright yellow-white)
  const warmA = 0.35 + b * 0.6
  // sepia: high at low brightness (warm orange tint), fades out at high brightness (natural white)
  const sepia = Math.max(0, 0.78 - b * 0.78)
  const sat   = 1 + b * 2.0    // boosted saturation makes the internal color vivid
  const bri   = 0.38 + b * 0.72 // dim at low, bright at high
  const filter = on
    ? `sepia(${sepia.toFixed(2)}) saturate(${sat.toFixed(2)}) brightness(${bri.toFixed(2)}) drop-shadow(0 0 ${glow}px rgba(255,${warmG},50,${warmA}))`
    : 'grayscale(1) brightness(0.22) opacity(0.45)'
  return (
    <img src={BULB_SRC} alt="bulb" style={{
      width: '100%', maxWidth: 110, height: 'auto', display: 'block', objectFit: 'contain',
      filter, animation: on ? `bulbFloat ${2.8 - b * 0.8}s ease-in-out infinite` : 'none',
      transition: 'filter 0.5s',
    }} />
  )
}

// ─── Light Card ───────────────────────────────────────────────────────────────

const LightRtiCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const t = useT(); const th = useTh(); const sound = useSound()
  const on = s.state === 'on'
  const bPct = Math.round(Number(s.attributes.brightness ?? 0) / 255 * 100)
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const b = bPct / 100
  const warmG = Math.round(160 + b * 75)
  const sliderColor = on ? `rgb(255,${warmG},50)` : '#888'

  const toggle = useCallback(() => {
    callService('light', on ? 'turn_off' : 'turn_on', {}, s.entity_id)
    sound('light', !on, name)
  }, [on, s.entity_id, callService, sound, name])

  const setBrightness = useCallback((v: number) => {
    callService('light', 'turn_on', { brightness: Math.round(v * 255 / 100) }, s.entity_id)
  }, [s.entity_id, callService])

  return (
    <div
      style={{
        ...cardSt(th, {
          padding: '12px 12px 10px', minHeight: 210, gap: 0, cursor: 'pointer',
          background: on ? `rgba(255,${warmG},50,${0.04 + b * 0.07})` : th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)',
          boxShadow: on ? `0 4px ${Math.round(10 + b * 30)}px rgba(255,${warmG},50,${b * 0.5})` : th === 'day' ? '0 2px 10px rgba(0,0,0,0.07)' : 'none',
          transition: 'background 0.4s, box-shadow 0.4s',
          touchAction: 'manipulation',
        })
      }}
      onClick={toggle}
    >
      {/* Name — centered */}
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: on ? `rgb(255,${warmG},50)` : tc1(th), transition: 'color 0.3s' }}>{name}</span>
        <span style={{ fontSize: 11, color: tc2(th), marginLeft: 6 }}>{t.bri} {bPct}%</span>
      </div>
      {/* Bulb */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 0' }}>
        <BulbImg on={on} bPct={bPct} />
      </div>
      {/* Slider */}
      <div style={{ marginTop: 6 }}>
        <FancySlider value={bPct} color={sliderColor} onChange={setBrightness} />
      </div>
    </div>
  )
})

// ─── Speaker ──────────────────────────────────────────────────────────────────

const SPEAKER_SRC = '/speaker.png'

function SpeakerImg({ powered, playing, volume }: { powered: boolean; playing: boolean; volume: number }) {
  const v = volume / 100
  const glow = Math.round(10 + v * 26)
  const hasVol = powered && v > 0.02
  // faster pulse at higher volume: 1.5s (quiet) → 0.4s (loud)
  const period = (0.4 + (1 - v) * 1.1).toFixed(2)
  const filter = !powered
    ? 'grayscale(1) brightness(0.28) opacity(0.55)'
    : playing
      ? `drop-shadow(0 0 ${glow}px rgba(77,143,255,${0.4 + v * 0.5})) brightness(${1 + v * 0.28})`
      : `drop-shadow(0 0 ${Math.round(4 + v * 10)}px rgba(77,143,255,${0.1 + v * 0.3})) brightness(0.95)`
  return (
    // wrapper carries the pulse animation; img carries the volume-based base scale
    <div style={{ animation: hasVol ? `speakerPulse ${period}s ease-in-out infinite` : 'none', display: 'inline-flex', width: '100%', maxWidth: 120, alignItems: 'center', justifyContent: 'center' }}>
      <img src={SPEAKER_SRC} alt="speaker" style={{
        width: '100%', height: 'auto', display: 'block', objectFit: 'contain',
        filter,
        transform: `scale(${(1 + v * 0.14).toFixed(3)})`,
        transition: 'filter 0.4s, transform 0.5s',
      }} />
    </div>
  )
}

// ─── Media Card (no transport buttons) ────────────────────────────────────────

const MediaRtiCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh(); const sound = useSound()
  const playing = s.state === 'playing'
  const vol = Math.round(Number(s.attributes.volume_level ?? 0) * 100)
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const title = String(s.attributes.media_title ?? '')
  const source = String(s.attributes.source ?? '')
  const sources: string[] = (s.attributes.source_list as string[]) ?? []
  const v = vol / 100
  const powered = s.state !== 'off' && s.state !== 'unavailable'

  const call = useCallback((svc: string, data: Record<string, unknown> = {}) => {
    callService('media_player', svc, data, s.entity_id)
  }, [s.entity_id, callService])

  const togglePower = useCallback(() => {
    call(powered ? 'turn_off' : 'turn_on')
    sound('media', !powered, name)
  }, [powered, call, sound, name])

  return (
    <div
      style={{
        ...cardSt(th, {
          padding: '12px 12px 10px', minHeight: 210, gap: 0, cursor: 'pointer',
          background: powered ? `rgba(77,143,255,${0.04 + v * 0.05})` : th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)',
          boxShadow: playing ? `0 4px ${Math.round(10 + v * 28)}px rgba(77,143,255,${v * 0.45})` : th === 'day' ? '0 2px 10px rgba(0,0,0,0.07)' : 'none',
          transition: 'background 0.4s, box-shadow 0.4s',
          touchAction: 'manipulation',
        })
      }}
      onClick={togglePower}
    >
      {/* Name — centered */}
      <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: powered ? '#4d8fff' : tc1(th), transition: 'color 0.3s' }}>{name}</span>
        <span style={{ fontSize: 11, color: tc2(th) }}>{vol}%</span>
        {playing && <EqBars active={true} />}
      </div>
      {/* Speaker image */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 0' }}>
        <SpeakerImg powered={powered} playing={playing} volume={vol} />
      </div>
      {/* Track title */}
      {title && powered && (
        <div style={{
          fontSize: 11, color: playing ? '#4d8fff' : tc2(th),
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          textAlign: 'center', margin: '2px 0', transition: 'color 0.3s',
        }}>♪ {title}</div>
      )}
      {/* Volume slider */}
      <div style={{ marginTop: 4 }}>
        <FancySlider value={vol} color={powered ? '#4d8fff' : '#555'} onChange={v => call('volume_set', { volume_level: v / 100 })} />
      </div>
      {/* Source selector */}
      {sources.length > 0 && powered && (
        <select value={source} onChange={e => call('select_source', { source: e.target.value })}
          onClick={e => e.stopPropagation()}
          style={{
            marginTop: 6, background: th === 'day' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)',
            border: `1px solid ${th === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 8, color: tc1(th), fontSize: 11, padding: '4px 8px', width: '100%',
          }}>
          {sources.map(src => <option key={src} value={src}>{src}</option>)}
        </select>
      )}
    </div>
  )
})

// ─── Sensor / Door Card ───────────────────────────────────────────────────────

const DOOR_CLOSED_SRC = '/door-closed.png'
const DOOR_OPEN_SRC   = '/door-open.png'

const SensorRtiCard = memo(({ s }: { s: HaState }) => {
  const t = useT(); const th = useTh()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const dc = String(s.attributes.device_class ?? '')
  const open = s.state === 'on'
  const label = open ? (dc === 'motion' ? t.detected : t.open) : (dc === 'motion' ? t.clear : t.closed)
  const color = open ? '#ff453a' : '#30d158'
  const isDoor = dc === 'door' || dc === 'garage_door'
  const fallbackIcon = dc === 'window' ? '🪟' : dc === 'motion' ? '🚶' : '🚪'

  return (
    <div style={{
      ...cardSt(th, {
        padding: isDoor ? '12px 12px 10px' : '14px 12px', minHeight: isDoor ? 200 : 100,
        gap: 0, alignItems: 'center', justifyContent: 'center',
        borderLeft: `3px solid ${open ? color : 'transparent'}`,
        boxShadow: open ? `0 2px 20px rgba(255,69,58,0.22)` : th === 'day' ? '0 2px 10px rgba(0,0,0,0.07)' : 'none',
        background: open && isDoor ? 'rgba(255,69,58,0.04)' : th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)',
        transition: 'box-shadow 0.4s, border-color 0.3s, background 0.4s',
      })
    }}>
      <div style={{ width: '100%', textAlign: 'center', marginBottom: isDoor ? 6 : 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: open ? color : tc1(th), transition: 'color 0.3s' }}>{name}</span>
      </div>
      {isDoor ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 0' }}>
          <img src={open ? DOOR_OPEN_SRC : DOOR_CLOSED_SRC} alt={open ? 'open' : 'closed'} style={{
            width: '100%', maxWidth: 100, height: 'auto', display: 'block', objectFit: 'contain',
            filter: open ? 'drop-shadow(0 0 12px rgba(255,69,58,0.7))' : 'drop-shadow(0 0 4px rgba(128,128,128,0.2))',
            animation: open ? 'sensorPing 2.5s ease-in-out infinite' : 'none', transition: 'filter 0.4s',
          }} />
        </div>
      ) : (
        <span style={{
          fontSize: 28, animation: open ? 'sensorPing 2s ease-in-out infinite' : 'none',
          filter: open ? `drop-shadow(0 0 8px ${color}99)` : 'none', transition: 'filter 0.3s', marginBottom: 4,
        }}>{fallbackIcon}</span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: isDoor ? 6 : 0 }}>
        <span style={{
          width: 7, height: 7, borderRadius: 4, background: color,
          boxShadow: open ? `0 0 8px ${color}` : 'none',
          animation: open ? 'sensorPing 1.5s ease-in-out infinite' : 'none',
          display: 'inline-block', flexShrink: 0, transition: 'background 0.3s',
        }} />
        <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}20`, borderRadius: 6, padding: '3px 8px' }}>{label}</span>
      </div>
    </div>
  )
})

// ─── Alarm Card ───────────────────────────────────────────────────────────────

const AlarmCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const t = useT(); const th = useTh()
  const name = String(s.attributes.friendly_name ?? 'Alarm')
  const armed = s.state.startsWith('armed')
  const pending = s.state === 'pending' || s.state === 'arming'
  const triggered = s.state === 'triggered'
  const stateColor = triggered ? '#ff453a' : armed ? '#ff9f0a' : '#30d158'
  return (
    <div style={{ ...cardSt(th, { gridColumn: 'span 2', borderLeft: `3px solid ${stateColor}`, animation: triggered ? 'alarmRing 1.4s ease-in-out infinite' : 'none' }) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22, filter: triggered ? 'drop-shadow(0 0 10px rgba(255,69,58,0.9))' : armed ? 'drop-shadow(0 0 6px rgba(255,159,10,0.7))' : 'none', animation: pending || triggered ? 'sensorPing 1.2s ease-in-out infinite' : 'none' }}>🔒</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: tc1(th) }}>{name}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: stateColor, background: `${stateColor}20`, borderRadius: 6, padding: '3px 8px' }}>{s.state.replace(/_/g, ' ').toUpperCase()}</span>
      </div>
      {!armed && !pending && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => callService('alarm_control_panel', 'alarm_arm_home', {}, s.entity_id)} style={mkBtn(false, false, th)}>{t.armHome}</button>
          <button onClick={() => callService('alarm_control_panel', 'alarm_arm_away', {}, s.entity_id)} style={mkBtn(false, false, th)}>{t.armAway}</button>
        </div>
      )}
      {(armed || pending) && (
        <button onClick={() => callService('alarm_control_panel', 'alarm_disarm', {}, s.entity_id)}
          style={{ ...mkBtn(true, true, th), padding: '11px 0', fontSize: 14 }}>{t.disarm}</button>
      )}
    </div>
  )
})

// ─── Nest Thermostat ──────────────────────────────────────────────────────────

const SVG_S = 200; const CX = 100; const CY = 100; const R_ARC = 74; const ARC_START = 135; const ARC_SPAN = 270

function polar(angle: number, r = R_ARC): [number, number] {
  const a = angle * Math.PI / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

function arcPath(startAngle: number, spanDeg: number, r = R_ARC): string {
  const [sx, sy] = polar(startAngle, r)
  const endAngle = startAngle + spanDeg
  const [ex, ey] = polar(endAngle, r)
  const large = spanDeg > 180 ? 1 : 0
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`
}

function rawAngleToProgress(raw: number): number {
  if (raw >= ARC_START) return Math.min((raw - ARC_START) / ARC_SPAN, 1)
  if (raw <= ARC_START - 360 + ARC_SPAN) return Math.min((raw + 360 - ARC_START) / ARC_SPAN, 1)
  return raw <= 90 ? 1 : 0
}

const NestThermostat = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh(); const t = useT()
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const minT = Number(s.attributes.min_temp ?? 10)
  const maxT = Number(s.attributes.max_temp ?? 35)
  const current = Number(s.attributes.current_temperature ?? 20)
  const setpointRaw = Number(s.attributes.temperature ?? 21)
  const [setpoint, setSetpoint] = useState(setpointRaw)
  useEffect(() => { setSetpoint(setpointRaw) }, [setpointRaw])

  const hvacAction = String(s.attributes.hvac_action ?? 'idle')
  const hvacMode = s.state ?? 'off'
  const modeColor = hvacAction === 'heating' ? '#ff6b3d' : hvacAction === 'cooling' ? '#0af3ff' : th === 'day' ? '#888' : '#555'
  const modeLabel = hvacAction === 'heating' ? t.heating : hvacAction === 'cooling' ? t.cooling : t.idle

  const span = ((setpoint - minT) / (maxT - minT)) * ARC_SPAN
  const [thumbX, thumbY] = polar(ARC_START + span)

  const getNewTemp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return setpoint
    const rect = svgRef.current.getBoundingClientRect()
    const dx = e.clientX - rect.left - CX * (rect.width / SVG_S)
    const dy = e.clientY - rect.top - CY * (rect.height / SVG_S)
    const raw = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360
    const prog = rawAngleToProgress(raw)
    return Math.round(minT + prog * (maxT - minT))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg ref={svgRef} viewBox={`0 0 ${SVG_S} ${SVG_S}`} style={{ width: 180, height: 180, cursor: 'pointer', touchAction: 'none' }}
        onPointerDown={e => { dragging.current = true; svgRef.current?.setPointerCapture(e.pointerId) }}
        onPointerMove={e => { if (!dragging.current) return; setSetpoint(getNewTemp(e)) }}
        onPointerUp={e => {
          if (!dragging.current) return; dragging.current = false
          const nt = getNewTemp(e)
          setSetpoint(nt)
          callService('climate', 'set_temperature', { temperature: nt }, s.entity_id)
        }}
      >
        {/* Background ring */}
        <circle cx={CX} cy={CY} r={R_ARC + 10} fill={th === 'day' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'} />
        {/* Track */}
        <path d={arcPath(ARC_START, ARC_SPAN)} fill="none" stroke={th === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'} strokeWidth={8} strokeLinecap="round" />
        {/* Active arc */}
        {span > 2 && (
          <path d={arcPath(ARC_START, span)} fill="none" stroke={modeColor} strokeWidth={8} strokeLinecap="round" style={{ transition: 'stroke 0.5s' }} />
        )}
        {/* Thumb */}
        <circle cx={thumbX} cy={thumbY} r={12} fill={modeColor} stroke="rgba(255,255,255,0.4)" strokeWidth={2} style={{ filter: `drop-shadow(0 0 6px ${modeColor}88)`, transition: 'fill 0.5s' }} />
        {/* Current temp */}
        <text x={CX} y={CY - 10} textAnchor="middle" fill={tc1(th)} fontSize={32} fontWeight={700} fontFamily="system-ui">{current}°</text>
        {/* Setpoint */}
        <text x={CX} y={CY + 20} textAnchor="middle" fill={modeColor} fontSize={15} fontFamily="system-ui">→ {setpoint}°</text>
        {/* Mode label */}
        <text x={CX} y={CY + 40} textAnchor="middle" fill={tc2(th)} fontSize={11} fontFamily="system-ui">{modeLabel}</text>
      </svg>
      {/* Mode buttons */}
      <div style={{ display: 'flex', gap: 6, width: '100%' }}>
        {['off', 'heat', 'cool'].map(m => (
          <button key={m} onClick={() => callService('climate', 'set_hvac_mode', { hvac_mode: m }, s.entity_id)}
            style={{ ...mkBtn(hvacMode === m, false, th), padding: '6px 0', fontSize: 12, flex: 1 }}>
            {m === 'heat' ? '🔥' : m === 'cool' ? '❄️' : '⏸'}
          </button>
        ))}
      </div>
    </div>
  )
})

// ─── Climate Card (sensor) ─────────────────────────────────────────────────────

const ClimateRtiCard = memo(({ s }: { s: HaState }) => {
  const th = useTh()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const unit = String(s.attributes.unit_of_measurement ?? '')
  const dc = String(s.attributes.device_class ?? '')
  const icon = dc === 'humidity' ? '💧' : dc === 'carbon_dioxide' ? '☁️' : '📊'
  const numVal = Number(s.state)
  const val = isNaN(numVal) ? s.state : numVal.toFixed(1)
  const color = tempColor(numVal, dc)
  const isTemp = dc === 'temperature'

  if (isTemp) {
    return (
      <div style={{
        ...cardSt(th, {
          padding: '12px 12px 10px', minHeight: 100, gap: 0,
          alignItems: 'center', justifyContent: 'center',
          borderLeft: `3px solid ${color}`,
          boxShadow: `0 2px 16px ${color}18`,
          transition: 'box-shadow 0.5s, border-color 0.5s',
        })
      }}>
        <div style={{ width: '100%', textAlign: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color, transition: 'color 0.5s' }}>{name}</span>
        </div>
        <span style={{
          fontSize: 36, fontWeight: 700, color,
          textShadow: `0 0 16px ${color}55`,
          animation: 'tempFloat 3s ease-in-out infinite',
          transition: 'color 0.5s',
        }}>{val}<span style={{ fontSize: 16, fontWeight: 400, opacity: 0.7 }}>{unit}</span></span>
      </div>
    )
  }

  return (
    <div style={{ ...cardSt(th, { alignItems: 'center', justifyContent: 'center', gap: 6 }) }}>
      <span style={{ fontSize: 32 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color, textAlign: 'center' }}>{val}<span style={{ fontSize: 11, opacity: 0.7 }}>{unit}</span></span>
      <span style={{ fontSize: 11, color: tc2(th), textAlign: 'center' }}>{name}</span>
    </div>
  )
})

// ─── Thermostat Card (climate entity) ─────────────────────────────────────────

const ThermostatCard = memo(({ s }: { s: HaState }) => {
  const th = useTh()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  return (
    <div style={{ ...cardSt(th, { padding: '12px 10px', alignItems: 'center', gridColumn: 'span 1' }) }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: tc1(th), textAlign: 'center', marginBottom: 4 }}>{name}</span>
      <NestThermostat s={s} />
    </div>
  )
})

// ─── CSS Garage Door ──────────────────────────────────────────────────────────

function GarageDoorVisual({ open, toggling }: { open: boolean; toggling: boolean }) {
  const PANELS = 4
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 160, margin: '0 auto' }}>
      {/* Frame */}
      <div style={{
        border: '3px solid #555', borderRadius: '6px 6px 0 0',
        background: '#1a1a2a', overflow: 'hidden',
        height: 120, position: 'relative',
      }}>
        {/* Door panels */}
        <div style={{
          position: 'absolute', inset: 0,
          transform: `translateY(${open ? '-100%' : '0'})`,
          transition: toggling ? 'transform 1.4s cubic-bezier(0.4,0,0.2,1)' : 'none',
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg,#4a5568 0%,#374151 100%)',
        }}>
          {Array.from({ length: PANELS }).map((_, i) => (
            <div key={i} style={{
              flex: 1, borderBottom: '2px solid #555',
              display: 'flex', gap: 3, padding: '2px 4px', alignItems: 'center',
            }}>
              <div style={{ flex: 1, height: '60%', background: 'rgba(255,255,255,0.04)', borderRadius: 2 }} />
              <div style={{ flex: 1, height: '60%', background: 'rgba(255,255,255,0.04)', borderRadius: 2 }} />
              <div style={{ flex: 1, height: '60%', background: 'rgba(255,255,255,0.04)', borderRadius: 2 }} />
            </div>
          ))}
        </div>
        {/* Ground line */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: '#333', borderTop: '1px solid #555' }} />
        {/* Open indicator light */}
        {open && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(48,209,88,0.06)',
          }}>
            <span style={{ fontSize: 22, filter: 'drop-shadow(0 0 8px rgba(48,209,88,0.8))' }}>🚗</span>
          </div>
        )}
      </div>
      {/* Ground */}
      <div style={{ height: 6, background: 'linear-gradient(180deg,#444 0%,#333 100%)', borderRadius: '0 0 4px 4px' }} />
    </div>
  )
}

// ─── Garage Cover Card (cover.* entities) ────────────────────────────────────

const GarageCoverCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const t = useT(); const th = useTh(); const sound = useSound()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const isOpen   = s.state === 'open'    || s.state === 'opening'
  const isMoving = s.state === 'opening' || s.state === 'closing'
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (isMoving) { setToggling(true); return }
    const id = setTimeout(() => setToggling(false), 1200)
    return () => clearTimeout(id)
  }, [isMoving])

  const toggle = useCallback(() => {
    let svc = 'open_cover'
    if (isMoving) svc = 'stop_cover'
    else if (isOpen) svc = 'close_cover'
    callService('cover', svc, {}, s.entity_id)
    sound('garage', !isOpen, name)
    setToggling(true)
  }, [isOpen, isMoving, s.entity_id, callService, sound, name])

  const color = isMoving ? '#ff9f0a' : isOpen ? '#ff453a' : '#30d158'
  const statusLabel = s.state === 'opening' ? '⬆ OPENING' : s.state === 'closing' ? '⬇ CLOSING' : isOpen ? t.open : t.closed

  return (
    <div style={{
      ...cardSt(th, {
        padding: '12px 10px 10px', gap: 0,
        background: isOpen ? 'rgba(255,69,58,0.04)' : th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)',
        boxShadow: isOpen ? '0 2px 24px rgba(255,69,58,0.18)' : th === 'day' ? '0 2px 10px rgba(0,0,0,0.07)' : 'none',
        transition: 'background 0.4s, box-shadow 0.4s',
      })
    }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: isOpen ? '#ff453a' : tc1(th), transition: 'color 0.3s' }}>{name}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 12, alignItems: 'flex-end', justifyContent: 'center', marginBottom: 8 }}>
        <GarageDoorVisual open={isOpen} toggling={toggling} />
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          background: th === 'day' ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)',
          borderRadius: 10, padding: '10px 8px',
        }}>
          <span style={{ fontSize: 10, color: tc2(th), fontWeight: 600, letterSpacing: 0.5 }}>CTRL</span>
          <button onClick={toggle} style={{
            width: 36, height: 36, borderRadius: 18, border: 'none', cursor: 'pointer',
            background: isMoving ? 'rgba(255,159,10,0.25)' : isOpen ? 'rgba(255,69,58,0.25)' : 'rgba(48,209,88,0.15)',
            boxShadow: toggling ? `0 0 16px ${color}` : 'none',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.3s, box-shadow 0.3s',
          }}>{isMoving ? '⏸' : '⚡'}</button>
          <div style={{
            width: 8, height: 8, borderRadius: 4, background: color,
            boxShadow: `0 0 6px ${color}`,
            animation: (isOpen || isMoving) ? 'sensorPing 1.5s ease-in-out infinite' : 'none',
            transition: 'background 0.3s',
          }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}20`, borderRadius: 6, padding: '3px 10px' }}>
          {statusLabel}
        </span>
      </div>
    </div>
  )
})

// ─── Switch / Garage Card ─────────────────────────────────────────────────────

const SwitchRtiCard = memo(({ s, icon = '🔌' }: { s: HaState; icon?: string }) => {
  const callService = useRestCall()
  const t = useT(); const th = useTh(); const sound = useSound()
  const on = s.state === 'on'
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const isGarage = s.entity_id.includes('garage') || icon === '🚗'
  const [toggling, setToggling] = useState(false)

  const toggle = useCallback(() => {
    const domain = s.entity_id.split('.')[0]
    callService(domain, on ? 'turn_off' : 'turn_on', {}, s.entity_id)
    if (isGarage) {
      sound('garage', !on, name)
      setToggling(true)
      setTimeout(() => setToggling(false), 1600)
    } else {
      sound('switch', !on, name)
    }
  }, [on, s.entity_id, callService, isGarage, sound, name])

  if (isGarage) {
    const color = on ? '#ff453a' : '#30d158'
    return (
      <div style={{
        ...cardSt(th, {
          padding: '12px 10px 10px', gap: 0,
          background: on ? 'rgba(255,69,58,0.04)' : th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)',
          boxShadow: on ? '0 2px 24px rgba(255,69,58,0.18)' : th === 'day' ? '0 2px 10px rgba(0,0,0,0.07)' : 'none',
          transition: 'background 0.4s, box-shadow 0.4s',
        })
      }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: on ? '#ff453a' : tc1(th), transition: 'color 0.3s' }}>{name}</span>
        </div>
        {/* Garage door visual */}
        <div style={{ flex: 1, display: 'flex', gap: 12, alignItems: 'flex-end', justifyContent: 'center', marginBottom: 8 }}>
          <GarageDoorVisual open={on} toggling={toggling} />
          {/* Controller */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            background: th === 'day' ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '10px 8px',
          }}>
            <span style={{ fontSize: 10, color: tc2(th), fontWeight: 600, letterSpacing: 0.5 }}>CTRL</span>
            <button onClick={toggle} style={{
              width: 36, height: 36, borderRadius: 18, border: 'none', cursor: 'pointer',
              background: on ? 'rgba(255,69,58,0.25)' : 'rgba(48,209,88,0.15)',
              boxShadow: toggling ? `0 0 16px ${color}` : 'none',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'box-shadow 0.3s',
            }}>⚡</button>
            <div style={{
              width: 8, height: 8, borderRadius: 4, background: color,
              boxShadow: `0 0 6px ${color}`, animation: on ? 'sensorPing 1.5s ease-in-out infinite' : 'none',
              transition: 'background 0.3s',
            }} />
          </div>
        </div>
        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}20`, borderRadius: 6, padding: '3px 10px' }}>
            {on ? t.open : t.closed}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...cardSt(th, { alignItems: 'center', justifyContent: 'center', gap: 8 }) }}>
      <span style={{ fontSize: 26, filter: on ? 'drop-shadow(0 0 8px rgba(10,132,255,0.7))' : 'opacity(0.4)', transition: 'filter 0.3s' }}>{icon}</span>
      <span style={{ fontSize: 11, color: tc2(th), textAlign: 'center' }}>{name}</span>
      <button onClick={toggle} style={{ ...mkBtn(on, false, th), width: '100%', padding: '10px 0', fontSize: 13 }}>
        {on ? t.on : t.off}
      </button>
    </div>
  )
})

// ─── Camera Card ──────────────────────────────────────────────────────────────

const CameraRtiCard = memo(({ s }: { s: HaState }) => {
  const { token } = useHa(); const th = useTh()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const streamUrl = `/api/camera/${s.entity_id.split('.')[1]}/stream`
  return (
    <div style={{ ...cardSt(th, { padding: 0, overflow: 'hidden' }) }}>
      <div style={{ background: '#111', borderRadius: 18, overflow: 'hidden', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {token ? (
          <img src={`${streamUrl}?token=${token}&t=${Math.floor(Date.now() / 10000)}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={name}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        ) : <span style={{ fontSize: 28, opacity: 0.3 }}>📷</span>}
      </div>
      <div style={{ padding: '8px 12px 10px', fontSize: 11, color: tc2(th) }}>{name}</div>
    </div>
  )
})

// ─── Category Views ───────────────────────────────────────────────────────────

function filterStates(states: Map<string, HaState>, test: (s: HaState) => boolean) {
  return Array.from(states.values()).filter(test)
}

function CardGrid({ children, cols }: { children: React.ReactNode; cols: number }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10,
      padding: '10px 10px', overflowY: 'auto', height: '100%',
      alignContent: 'start', WebkitOverflowScrolling: 'touch',
    }}>{children}</div>
  )
}

function EmptyState({ icon, cat }: { icon: string; cat: Cat }) {
  const t = useT(); const th = useTh()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, opacity: 0.4 }}>
      <span style={{ fontSize: 40 }}>{icon}</span>
      <span style={{ fontSize: 13, color: tc2(th) }}>{t.cats[cat]}</span>
    </div>
  )
}

function SecurityView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const alarms = filterStates(states, s => s.entity_id.startsWith('alarm_control_panel.'))
  const sensors = filterStates(states, s => s.entity_id.startsWith('binary_sensor.') && ['door', 'window', 'motion', 'garage_door'].includes(String(s.attributes.device_class ?? '')))
  const cameras = filterStates(states, s => s.entity_id.startsWith('camera.'))
  const alarmSwitches = filterStates(states, s => s.entity_id.startsWith('switch.') && (s.entity_id.includes('alarm') || s.entity_id.includes('siren')))
  if (!alarms.length && !sensors.length && !cameras.length && !alarmSwitches.length) return <EmptyState icon="🔒" cat="security" />
  return (
    <CardGrid cols={cols}>
      {alarms.map(s => <AlarmCard key={s.entity_id} s={s} />)}
      {alarmSwitches.map(s => <SwitchRtiCard key={s.entity_id} s={s} icon={s.entity_id.includes('siren') ? '🚨' : '🔒'} />)}
      {cameras.map(s => <CameraRtiCard key={s.entity_id} s={s} />)}
      {sensors.map(s => <SensorRtiCard key={s.entity_id} s={s} />)}
    </CardGrid>
  )
}

function MusicView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const players = filterStates(states, s => s.entity_id.startsWith('media_player.'))
  if (!players.length) return <EmptyState icon="🎵" cat="music" />
  return <CardGrid cols={cols}>{players.map(s => <MediaRtiCard key={s.entity_id} s={s} />)}</CardGrid>
}

function LightsView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const lights = filterStates(states, s => s.entity_id.startsWith('light.'))
  if (!lights.length) return <EmptyState icon="💡" cat="lights" />
  return <CardGrid cols={cols}>{lights.map(s => <LightRtiCard key={s.entity_id} s={s} />)}</CardGrid>
}

function TheaterView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const avr = filterStates(states, s => s.entity_id.startsWith('media_player.') && (s.entity_id.includes('avr') || s.entity_id.includes('receiver') || s.entity_id.includes('theater') || s.entity_id.includes('projector')))
  const players = avr.length ? avr : filterStates(states, s => s.entity_id.startsWith('media_player.'))
  const projectors = filterStates(states, s => s.entity_id.startsWith('switch.') && (s.entity_id.includes('tv') || s.entity_id.includes('projector') || s.entity_id.includes('screen')))
  if (!players.length && !projectors.length) return <EmptyState icon="🎬" cat="theater" />
  return <CardGrid cols={cols}>{projectors.map(s => <SwitchRtiCard key={s.entity_id} s={s} icon="📺" />)}{players.map(s => <MediaRtiCard key={s.entity_id} s={s} />)}</CardGrid>
}

function ClimateView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const sensors = filterStates(states, s => s.entity_id.startsWith('sensor.') && ['temperature', 'humidity', 'carbon_dioxide'].includes(String(s.attributes.device_class ?? '')))
  const thermostats = filterStates(states, s => s.entity_id.startsWith('climate.'))
  if (!sensors.length && !thermostats.length) return <EmptyState icon="🌡️" cat="climate" />
  return (
    <CardGrid cols={cols}>
      {sensors.map(s => <ClimateRtiCard key={s.entity_id} s={s} />)}
      {thermostats.map(s => <ThermostatCard key={s.entity_id} s={s} />)}
    </CardGrid>
  )
}

function GarageView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const covers   = filterStates(states, s => s.entity_id.startsWith('cover.') && (s.entity_id.includes('garage') || String(s.attributes.device_class ?? '').includes('garage')))
  const switches = filterStates(states, s => s.entity_id.startsWith('switch.') && (s.entity_id.includes('garage') || s.entity_id.includes('gate')))
  const sensors  = filterStates(states, s => s.entity_id.startsWith('binary_sensor.') && (s.entity_id.includes('garage') || String(s.attributes.device_class ?? '').includes('garage')))
  if (!covers.length && !switches.length && !sensors.length) return <EmptyState icon="🚗" cat="garage" />
  return (
    <CardGrid cols={cols}>
      {covers.map(s => <GarageCoverCard key={s.entity_id} s={s} />)}
      {switches.map(s => <SwitchRtiCard key={s.entity_id} s={s} icon="🚗" />)}
      {sensors.map(s => <SensorRtiCard key={s.entity_id} s={s} />)}
    </CardGrid>
  )
}

// ─── Category Nav ─────────────────────────────────────────────────────────────

function CategoryNav({ cat, onChange, vertical }: { cat: Cat; onChange: (c: Cat) => void; vertical: boolean }) {
  const t = useT(); const th = useTh()
  const soundMode = useSoundMode()
  const navBg = th === 'day' ? 'rgba(255,255,255,0.97)' : '#18181b'
  const navBorder = th === 'day' ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.07)'

  const handleClick = useCallback((c: Cat) => {
    if (c === cat) return
    if (soundMode === 1) playDing()
    else if (soundMode === 2) { playSwitchToggle(true); speakText(t.cats[c]) }
    onChange(c)
  }, [cat, soundMode, t, onChange])

  if (vertical) {
    return (
      <nav style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: TAB_W, display: 'flex', flexDirection: 'column', background: navBg, borderRight: `1px solid ${navBorder}`, zIndex: 30, overflowY: 'auto' }}>
        {CATS.map(c => {
          const active = cat === c.id
          return (
            <button key={c.id} onClick={() => handleClick(c.id)} style={{
              background: active ? 'rgba(77,143,255,0.18)' : 'none', border: 'none',
              borderLeft: `4px solid ${active ? '#4d8fff' : 'transparent'}`,
              cursor: 'pointer', padding: '14px 0',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              transition: 'background 0.15s, border-color 0.15s',
              boxShadow: active ? 'inset 0 0 18px rgba(77,143,255,0.08)' : 'none',
            }}>
              <span style={{ fontSize: active ? 26 : 22, transition: 'font-size 0.15s', filter: active ? 'drop-shadow(0 0 6px rgba(77,143,255,0.55))' : 'none' }}>{c.icon}</span>
              <span style={{ fontSize: active ? 13 : 12, fontWeight: active ? 700 : 500, color: active ? '#4d8fff' : th === 'day' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)', letterSpacing: 0.2 }}>{t.cats[c.id]}</span>
            </button>
          )
        })}
      </nav>
    )
  }

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: SIDE_W, height: TAB_H,
      display: 'flex', background: navBg, borderTop: `1px solid ${navBorder}`,
      zIndex: 30, paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {CATS.map(c => {
        const active = cat === c.id
        return (
          <button key={c.id} onClick={() => handleClick(c.id)} style={{
            flex: 1, border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, padding: '6px 0',
            borderTop: `3px solid ${active ? '#4d8fff' : 'transparent'}`,
            background: active ? th === 'day' ? 'rgba(77,143,255,0.08)' : 'rgba(77,143,255,0.12)' : 'none',
            transition: 'border-color 0.15s, background 0.15s',
          }}>
            <span style={{ fontSize: active ? 26 : 22, transition: 'font-size 0.15s', filter: active ? 'drop-shadow(0 0 6px rgba(77,143,255,0.6))' : 'grayscale(0.4) opacity(0.65)' }}>{c.icon}</span>
            <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#4d8fff' : th === 'day' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)' }}>{t.cats[c.id]}</span>
          </button>
        )
      })}
    </nav>
  )
}

// ─── Weather Widget ───────────────────────────────────────────────────────────

const WMO_ICON: Record<number, string> = {
  0: '☀️', 1: '🌤', 2: '⛅', 3: '☁️',
  45: '🌫', 48: '🌫', 51: '🌦', 53: '🌧', 55: '🌧', 61: '🌧', 63: '🌧', 65: '🌧',
  71: '❄️', 73: '❄️', 75: '❄️', 77: '🌨', 80: '🌦', 81: '🌧', 82: '⛈', 95: '⛈', 96: '⛈', 99: '⛈',
}
const HA_ICON: Record<string, string> = {
  sunny: '☀️', 'clear-night': '🌙', cloudy: '☁️', fog: '🌫', hail: '🌨', lightning: '⚡',
  'lightning-rainy': '⛈', partlycloudy: '⛅', pouring: '🌧', rainy: '🌦', snowy: '❄️',
  'snowy-rainy': '🌨', windy: '💨', 'windy-variant': '💨', exceptional: '⚠️',
}

function getWmoIcon(code: number): string {
  return WMO_ICON[code] ?? WMO_ICON[Math.floor(code / 10) * 10] ?? '🌡'
}

const DAY_SHORT: Record<Lang, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  zh: ['日', '一', '二', '三', '四', '五', '六'],
  fa: ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'],
}

interface WeatherData {
  icon: string; temp: number | null
  forecast?: { day: string; icon: string; hi: number; lo: number }[]
}

function WeatherWidget() {
  const { states } = useHa()
  const lang = useContext(LangCtx); const th = useTh()
  const [wx, setWx] = useState<WeatherData | null>(null)
  const [showForecast, setShowForecast] = useState(false)

  useEffect(() => {
    // 1. Try HA weather entity
    const haWx = Array.from(states.values()).find(s => s.entity_id.startsWith('weather.'))
    if (haWx) {
      const icon = HA_ICON[haWx.state] ?? '🌡'
      const temp = Number(haWx.attributes.temperature) || null
      const rawFc = (haWx.attributes.forecast as any[]) ?? []
      const forecast = rawFc.slice(0, 7).map(f => ({
        day: DAY_SHORT[lang][new Date(f.datetime).getDay()],
        icon: HA_ICON[f.condition] ?? '🌡',
        hi: Math.round(f.temperature ?? f.temperature_max ?? 0),
        lo: Math.round(f.templow ?? f.temperature_min ?? 0),
      }))
      setWx({ icon, temp, forecast })
      return
    }

    // 2. Fallback: Open-Meteo (free, no key)
    let lat = 49.25, lon = -123.1
    const tryFetch = (la: number, lo2: number) => {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo2}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`)
        .then(r => r.json()).then(d => {
          const icon = getWmoIcon(d.current?.weather_code ?? 0)
          const temp = Math.round(d.current?.temperature_2m ?? 0)
          const fc = (d.daily?.time ?? []).slice(0, 7).map((time: string, i: number) => ({
            day: DAY_SHORT[lang][new Date(time).getDay()],
            icon: getWmoIcon((d.daily.weather_code ?? [])[i] ?? 0),
            hi: Math.round((d.daily.temperature_2m_max ?? [])[i] ?? 0),
            lo: Math.round((d.daily.temperature_2m_min ?? [])[i] ?? 0),
          }))
          setWx({ icon, temp, forecast: fc })
        }).catch(() => {})
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => tryFetch(p.coords.latitude, p.coords.longitude), () => tryFetch(lat, lon), { timeout: 4000 })
    } else {
      tryFetch(lat, lon)
    }
  }, [states, lang])

  if (!wx) return null

  return (
    <>
      <button onClick={() => setShowForecast(s => !s)} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        padding: '6px 0', width: '100%',
      }}>
        <span style={{ fontSize: 20 }}>{wx.icon}</span>
        {wx.temp !== null && <span style={{ fontSize: 11, fontWeight: 600, color: tc1(th) }}>{wx.temp}°</span>}
      </button>

      {showForecast && wx.forecast && createPortal(
        <>
          {/* backdrop to close on outside click */}
          <div onClick={() => setShowForecast(false)} style={{ position: 'fixed', inset: 0, zIndex: 9990 }} />
          <div style={{
            position: 'fixed', right: SIDE_W + 8, top: 56, zIndex: 9991,
            background: th === 'day' ? '#fff' : '#1c1c24',
            border: `1px solid ${th === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: 16, padding: '12px 14px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            minWidth: 220,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: tc2(th), marginBottom: 8, letterSpacing: 0.4 }}>
              {lang === 'zh' ? '7天预报' : lang === 'fa' ? 'پیش‌بینی ۷ روزه' : '7-Day Forecast'}
            </div>
            {wx.forecast.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 0', borderBottom: i < wx.forecast!.length - 1 ? `1px solid ${th === 'day' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)'}` : 'none',
              }}>
                <span style={{ fontSize: 12, color: tc1(th), width: 32, fontWeight: 600 }}>{f.day}</span>
                <span style={{ fontSize: 20 }}>{f.icon}</span>
                <span style={{ fontSize: 13, color: '#ff9f0a', fontWeight: 700, marginLeft: 'auto' }}>{f.hi}°</span>
                <span style={{ fontSize: 13, color: tc2(th), marginLeft: 4 }}>{f.lo}°</span>
              </div>
            ))}
            <button onClick={() => setShowForecast(false)} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: tc2(th), fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

// ─── Right Sidebar ────────────────────────────────────────────────────────────

function RightSidebar({ mode, onMode, theme, onTheme, lang, onLang, soundMode, onSound, is3d }: {
  mode: Mode; onMode: (m: Mode) => void
  theme: Theme; onTheme: () => void
  lang: Lang; onLang: () => void
  soundMode: number; onSound: () => void
  is3d: boolean
}) {
  const time = useClock()
  const { wsConnected } = useHa()
  const th = theme
  const sideBg = is3d ? 'rgba(0,0,0,0.55)' : th === 'day' ? 'rgba(255,255,255,0.97)' : '#18181b'
  const sideBorder = th === 'day' ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.07)'
  const btnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? '#4d8fff' : 'none',
    border: 'none', borderRadius: 8, cursor: 'pointer',
    color: active ? '#fff' : tc2(th), fontSize: 13, fontWeight: 700,
    padding: '7px 0', width: '100%', transition: 'all 0.15s',
  })
  const iconBtnStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 16, padding: '6px 0', width: '100%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    transition: 'opacity 0.15s',
  }

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: SIDE_W,
      background: sideBg, backdropFilter: 'blur(20px)',
      borderLeft: `1px solid ${sideBorder}`,
      zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '10px 0 90px',  // bottom padding to clear the global AI button at bottom:80
      gap: 2, overflowY: 'auto',
    }}>
      {/* WS status */}
      <div style={{ width: 7, height: 7, borderRadius: 4, background: wsConnected ? '#30d158' : '#ff453a', margin: '2px 0 4px' }} />

      {/* Time */}
      <div style={{ fontSize: 10, fontWeight: 600, color: tc2(th), letterSpacing: 0.3, marginBottom: 4, textAlign: 'center', lineHeight: 1.3 }}>
        {time.split(':').join('\n:')}
      </div>

      {/* Weather */}
      <WeatherWidget />

      {/* Divider */}
      <div style={{ width: 28, height: 1, background: th === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

      {/* 3D / 2D toggle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '80%' }}>
        <button onClick={() => onMode('3d')} style={btnStyle(mode === '3d')}>3D</button>
        <button onClick={() => onMode('2d')} style={btnStyle(mode === '2d')}>2D</button>
      </div>

      {/* Divider */}
      <div style={{ width: 28, height: 1, background: th === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

      {/* Language */}
      <button onClick={onLang} style={{ ...iconBtnStyle, fontSize: 11, fontWeight: 700, color: tc1(th) }}>
        {TR[lang].langBtn}
      </button>

      {/* Day / Night */}
      <button onClick={onTheme} style={{ ...iconBtnStyle, fontSize: 18 }} title={th === 'day' ? 'Night mode' : 'Day mode'}>
        {th === 'day' ? '🌙' : '☀️'}
      </button>

      {/* Sound mode */}
      <button onClick={onSound} style={{ ...iconBtnStyle, fontSize: 18 }} title={['Silent', 'Sound effects', 'Voice'][soundMode]}>
        {soundMode === 0 ? '🔇' : soundMode === 1 ? '🔔' : '🗣'}
      </button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RtiPanelPage({ standaloneToken }: { standaloneToken?: string }) {
  const [mode, setMode] = useState<Mode>('3d')
  const [cat, setCat] = useState<Cat>('lights')
  const [theme, setTheme] = useState<Theme>('dark')
  const [soundMode, setSoundMode] = useState(0)
  const [lang, setLangState] = useState<Lang>(() => {
    const l = getLang(); return (l === 'zh' || l === 'fa') ? l as Lang : 'en'
  })
  const isLandscape = useIsLandscape()
  const { states } = useHa()
  useRtiStyles()

  const cols = isLandscape ? 3 : 2

  const cycleLang = useCallback(() => {
    const next = LANG_LIST[(LANG_LIST.indexOf(lang) + 1) % LANG_LIST.length]
    setLangState(next); setLang(next)
  }, [lang])

  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'day' : 'dark'), [])
  const cycleSound = useCallback(() => setSoundMode(m => (m + 1) % 3), [])

  const bgColor = theme === 'day' ? '#f0f0f5' : '#0d0d10'

  const contentStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: isLandscape ? TAB_W : 0,
    right: SIDE_W,
    bottom: isLandscape ? 0 : TAB_H,
    overflow: 'hidden',
  }

  return (
    <ThemeCtx.Provider value={theme}>
      <LangCtx.Provider value={lang}>
        <SoundCtx.Provider value={soundMode}>
          <div style={{ position: 'fixed', inset: 0, background: bgColor, color: theme === 'day' ? '#1c1c1e' : '#fff' }}>

            {/* 3D mode — full width minus sidebar */}
            {mode === '3d' && (
              <div style={{ position: 'fixed', inset: 0, right: SIDE_W }}>
                <Suspense fallback={<div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading 3D…</div>}>
                  <FloorPlan3D fullscreen={true} onFullscreenChange={() => {}} standaloneToken={standaloneToken} soundMode={soundMode} />
                </Suspense>
              </div>
            )}

            {/* 2D mode */}
            {mode === '2d' && (
              <>
                <div style={contentStyle}>
                  {cat === 'security' && <SecurityView states={states} cols={cols} />}
                  {cat === 'music'    && <MusicView    states={states} cols={cols} />}
                  {cat === 'lights'   && <LightsView   states={states} cols={cols} />}
                  {cat === 'theater'  && <TheaterView  states={states} cols={cols} />}
                  {cat === 'climate'  && <ClimateView  states={states} cols={cols} />}
                  {cat === 'garage'   && <GarageView   states={states} cols={cols} />}
                </div>
                <CategoryNav cat={cat} onChange={setCat} vertical={isLandscape} />
              </>
            )}

            {/* Right sidebar — always visible */}
            <RightSidebar
              mode={mode} onMode={setMode}
              theme={theme} onTheme={toggleTheme}
              lang={lang} onLang={cycleLang}
              soundMode={soundMode} onSound={cycleSound}
              is3d={mode === '3d'}
            />
          </div>
        </SoundCtx.Provider>
      </LangCtx.Provider>
    </ThemeCtx.Provider>
  )
}
