import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react'
import { useHa } from '../../context/HaContext'
import {
  playLightToggle, playDoorToggle, playGarageToggle, playMediaToggle,
  playSwitchToggle, playDing, speakState, speakText, getLang, setLang,
} from '../../utils/sounds'

// ─── Types & i18n ─────────────────────────────────────────────────────────────

export type Mode  = '3d' | '2d'
export type Cat   = 'security' | 'camera' | 'music' | 'lights' | 'theater' | 'climate' | 'garage' | 'scenes'
export type Theme = 'day' | 'dark' | 'aurora' | 'galaxy' | 'fireworks'
export type Lang  = 'en' | 'zh' | 'fa'

export const LANG_LIST: Lang[] = ['en', 'zh', 'fa']
export const THEMES: Theme[] = ['day', 'dark', 'aurora', 'galaxy', 'fireworks']
export const THEME_ICON: Record<Theme, string> = { day: '☀️', dark: '🌙', aurora: '🌌', galaxy: '✨', fireworks: '🎆' }

export const CARD_BG: Record<Theme, string> = {
  day:       'rgba(210,220,240,0.52)',
  dark:      'rgba(255,255,255,0.07)',
  aurora:    'rgba(0,28,46,0.52)',
  galaxy:    'rgba(14,5,38,0.58)',
  fireworks: 'rgba(4,2,16,0.62)',
}
export const CARD_BORDER: Record<Theme, string> = {
  day:       '1px solid rgba(255,255,255,0.96)',
  dark:      '1px solid rgba(255,255,255,0.13)',
  aurora:    '1px solid rgba(0,255,160,0.22)',
  galaxy:    '1px solid rgba(180,140,255,0.24)',
  fireworks: '1px solid rgba(255,210,80,0.24)',
}
export const CARD_SHADOW: Record<Theme, string> = {
  day:       '0 2px 12px rgba(80,100,140,0.14), 0 8px 32px rgba(60,80,120,0.10), inset 0 1px 0 rgba(255,255,255,1)',
  dark:      '0 4px 24px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.10)',
  aurora:    '0 4px 28px rgba(0,180,100,0.14), inset 0 1px 0 rgba(0,255,160,0.12)',
  galaxy:    '0 4px 28px rgba(80,30,180,0.24), inset 0 1px 0 rgba(180,140,255,0.14)',
  fireworks: '0 4px 28px rgba(200,100,20,0.22), inset 0 1px 0 rgba(255,210,80,0.14)',
}
export const NAV_BG: Record<Theme, string> = {
  day:       'rgba(255,255,255,0.72)',
  dark:      'rgba(8,10,20,0.62)',
  aurora:    'rgba(0,18,34,0.72)',
  galaxy:    'rgba(8,4,22,0.72)',
  fireworks: 'rgba(4,2,14,0.76)',
}
export const NAV_BORDER: Record<Theme, string> = {
  day:       'rgba(255,255,255,0.90)',
  dark:      'rgba(255,255,255,0.10)',
  aurora:    'rgba(0,255,160,0.16)',
  galaxy:    'rgba(180,140,255,0.18)',
  fireworks: 'rgba(255,210,80,0.18)',
}

export const TR: Record<Lang, {
  cats: Record<Cat, string>
  on: string; off: string; open: string; closed: string
  detected: string; clear: string
  armHome: string; armAway: string; disarm: string
  bri: string; vol: string; langBtn: string
  noDevices: string; heating: string; cooling: string; idle: string
  activate: string; trigger: string; speed: string; allOn: string; allOff: string; other: string; lamp: string
}> = {
  en: {
    cats: { security:'Security', camera:'Camera', music:'Music', lights:'Lights', theater:'Theater', climate:'Climate', garage:'Garage', scenes:'Scenes' },
    on:'ON', off:'OFF', open:'OPEN', closed:'CLOSED', detected:'DETECTED', clear:'CLEAR',
    armHome:'ARM HOME', armAway:'ARM AWAY', disarm:'DISARM', bri:'bri', vol:'vol', langBtn:'EN',
    noDevices:'No devices', heating:'Heating', cooling:'Cooling', idle:'Idle',
    activate:'Activate', trigger:'Trigger', speed:'Speed', allOn:'All On', allOff:'All Off',
    other:'Other', lamp:'lights',
  },
  zh: {
    cats: { security:'安防', camera:'摄像头', music:'音乐', lights:'灯光', theater:'影院', climate:'气候', garage:'车库', scenes:'场景' },
    on:'开', off:'关', open:'开门', closed:'关闭', detected:'已检测', clear:'正常',
    armHome:'在家布防', armAway:'离家布防', disarm:'撤防', bri:'亮', vol:'音量', langBtn:'中文',
    noDevices:'无设备', heating:'加热中', cooling:'制冷中', idle:'待机',
    activate:'激活', trigger:'触发', speed:'风速', allOn:'全开', allOff:'全关',
    other:'其他', lamp:'盏灯',
  },
  fa: {
    cats: { security:'امنیت', camera:'دوربین', music:'موسیقی', lights:'چراغ‌ها', theater:'سینما', climate:'آب‌وهوا', garage:'گاراژ', scenes:'صحنه‌ها' },
    on:'روشن', off:'خاموش', open:'باز', closed:'بسته', detected:'تشخیص', clear:'پاک',
    armHome:'حالت خانه', armAway:'حالت خروج', disarm:'غیرفعال', bri:'روشنایی', vol:'صدا', langBtn:'فارسی',
    noDevices:'دستگاهی نیست', heating:'گرمایش', cooling:'سرمایش', idle:'آماده',
    activate:'فعال', trigger:'اجرا', speed:'سرعت', allOn:'همه روشن', allOff:'همه خاموش',
    other:'سایر', lamp:'چراغ',
  },
}

export const LangCtx   = createContext<Lang>('en')
export const ThemeCtx  = createContext<Theme>('day')
export const SoundCtx  = createContext<number>(0) // 0=mute 1=ding 2=voice
// null = not yet loaded (show all); Set = only show mapped entities
export const MappedCtx = createContext<Set<string> | null>(null)

export interface DashboardCard { entity: string; card_type: string; icon?: string; label?: string }
export interface DashboardConfig {
  views: Partial<Record<string, DashboardCard[]>>
  view_labels?: Record<string, string>
  view_icons?: Record<string, string>
}
export const DashboardCtx = createContext<DashboardConfig | null>(null)

export const useT         = () => TR[useContext(LangCtx)]
export const useTh        = () => useContext(ThemeCtx)
export const useSoundMode = () => useContext(SoundCtx)
export const useMapped    = () => useContext(MappedCtx)
export const useDashboard = () => useContext(DashboardCtx)

export type CardSize = 'sm' | 'md' | 'lg' | 'xl'
export const CARD_SIZES: CardSize[] = ['sm', 'md', 'lg', 'xl']
export const CARD_SIZE_ICON: Record<CardSize, string> = { sm: '⊟', md: '⊡', lg: '⊞', xl: '▣' }
export const CARD_SIZE_COLS: Record<CardSize, { portrait: number; landscape: number }> = {
  sm: { portrait: 5, landscape: 6 },
  md: { portrait: 4, landscape: 5 },
  lg: { portrait: 2, landscape: 3 },
  xl: { portrait: 1, landscape: 2 },
}
export const SizeCtx = createContext<CardSize>('md')
export const useCardSize = () => useContext(SizeCtx)

export const CATS: { id: Cat; icon: string }[] = [
  { id: 'security', icon: '🔒' },
  { id: 'camera',   icon: '📷' },
  { id: 'music',    icon: '🎵' },
  { id: 'lights',   icon: '💡' },
  { id: 'theater',  icon: '🎬' },
  { id: 'climate',  icon: '🌡️' },
  { id: 'garage',   icon: '🚗' },
  { id: 'scenes',   icon: '🎭' },
]

// ─── Layout constants ─────────────────────────────────────────────────────────
export const SIDE_W = 52   // right sidebar
export const TAB_H  = 68   // portrait bottom category nav
export const TAB_W  = 84   // landscape left category nav

// ─── Theme helpers ─────────────────────────────────────────────────────────────

export function cardSt(th: Theme, ov?: React.CSSProperties): React.CSSProperties {
  return {
    background: CARD_BG[th],
    backdropFilter: th === 'day' ? 'blur(28px) saturate(1.6)' : 'blur(22px)',
    WebkitBackdropFilter: th === 'day' ? 'blur(28px) saturate(1.6)' : 'blur(22px)',
    border: CARD_BORDER[th],
    boxShadow: CARD_SHADOW[th],
    borderRadius: 14, padding: '8px 8px', display: 'flex',
    flexDirection: 'column', gap: 4, minHeight: 72,
    ...ov,
  }
}

export function mkBtn(active: boolean, danger = false, th: Theme = 'dark'): React.CSSProperties {
  return {
    border: 'none', borderRadius: 10, padding: '9px 0',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: active
      ? danger ? (th === 'day' ? 'rgba(255,69,58,0.15)' : 'rgba(255,69,58,0.25)') : (th === 'day' ? 'rgba(10,132,255,0.15)' : 'rgba(10,132,255,0.28)')
      : th === 'day' ? 'rgba(130,150,180,0.12)' : 'rgba(255,255,255,0.07)',
    color: active ? (danger ? '#ff453a' : (th === 'aurora' ? '#00ffb3' : th === 'galaxy' ? '#c8a8ff' : th === 'fireworks' ? '#ffd060' : '#4d8fff')) : th === 'day' ? 'rgba(60,80,110,0.55)' : 'rgba(255,255,255,0.45)',
    flex: 1,
  }
}

export const tc1 = (th: Theme) => th === 'day' ? '#6b4400' : 'rgba(240,200,120,0.92)'
export const tc2 = (th: Theme) => th === 'day' ? 'rgba(120,75,0,0.55)' : 'rgba(240,180,80,0.45)'

export function tempColor(v: number, dc: string): string {
  if (dc !== 'temperature') return '#4d8fff'
  if (v < 16) return '#0af3ff'
  if (v < 20) return '#30d158'
  if (v < 24) return '#ffd60a'
  if (v < 28) return '#ff9f0a'
  return '#ff453a'
}

// ─── Hooks ─────────────────────────────────────────────────────────────────────

export function useIsLandscape() {
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

export function useClock() {
  const fmt = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const [t, setT] = useState(fmt)
  useEffect(() => { const id = setInterval(() => setT(fmt()), 10000); return () => clearInterval(id) }, [])
  return t
}

// ─── CSS injection ─────────────────────────────────────────────────────────────

export function useRtiStyles() {
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
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.rti-slider{-webkit-appearance:none;appearance:none;height:10px;border-radius:8px;outline:none;cursor:pointer;width:100%;touch-action:none}
.rti-slider::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;border-radius:50%;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,0.22),0 0 0 2px rgba(255,255,255,0.8);cursor:grab;border:none;transition:transform 0.15s}
.rti-slider::-webkit-slider-thumb:active{cursor:grabbing;transform:scale(1.15)}
.rti-slider::-moz-range-thumb{width:28px;height:28px;border-radius:50%;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,0.22);cursor:grab;border:none}
.rti-scroll::-webkit-scrollbar{width:3px}.rti-scroll::-webkit-scrollbar-track{background:transparent}.rti-scroll::-webkit-scrollbar-thumb{background:rgba(130,150,180,0.25);border-radius:3px}
.rti-card{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.rti-card:active{transform:scale(0.94);transition:transform 0.08s!important}
.rti-aurora-bg{position:fixed;inset:0;z-index:0;pointer-events:none;background:linear-gradient(-45deg,#001122,#002244,#003322,#001133,#003344,#002255);background-size:400% 400%;animation:auroraFlow 14s ease-in-out infinite}
@keyframes auroraFlow{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes auroraGlow{0%{opacity:0.45}100%{opacity:1}}
@keyframes twinkle{0%,100%{opacity:0.10;transform:scale(0.55)}50%{opacity:1;transform:scale(1.45)}}
@keyframes fwSpark{0%{transform:rotate(var(--fw-a,0deg)) translateX(0);opacity:1}80%{opacity:0.7}100%{transform:rotate(var(--fw-a,0deg)) translateX(88px);opacity:0}}
@keyframes fwFlash{0%{transform:translate(-50%,-50%) scale(0);opacity:1}35%{transform:translate(-50%,-50%) scale(1.8);opacity:1}100%{transform:translate(-50%,-50%) scale(3.5);opacity:0}}
@keyframes fwTrail{0%{transform:translateY(0) scaleY(1);opacity:0.9}100%{transform:translateY(-160px) scaleY(0.3);opacity:0}}
@keyframes floatUp{0%{transform:translateY(0) scale(1);opacity:0}10%{opacity:1}85%{opacity:0.6}100%{transform:translateY(-60vh) scale(0.4);opacity:0}}
@keyframes emberFloat{0%{transform:translate(0,0) scale(1);opacity:0}10%{opacity:0.85}90%{opacity:0.2}100%{transform:translate(var(--ex,20px),-55vh) scale(0.3);opacity:0}}
@keyframes viewFadeIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
@keyframes ptrSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    `
    document.head.appendChild(s)
    return () => { document.getElementById(id)?.remove() }
  }, [])
}

// ─── Sound helper ──────────────────────────────────────────────────────────────

export function useSound() {
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

export function useRestCall() {
  const { callService } = useHa()
  return useCallback((domain: string, service: string, data: Record<string, unknown>, entityId: string | string[]) => {
    callService(domain, service, data, entityId).catch(() => {})
  }, [callService])
}

// re-export sound utils so consumers can import from one place
export { playDing, playSwitchToggle, speakText, getLang, setLang }
