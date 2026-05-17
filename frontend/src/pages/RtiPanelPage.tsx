import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useHa } from '../context/HaContext'
import {
  type Mode, type Cat, type Theme, type Lang, type CardSize, type DashboardConfig,
  LANG_LIST, THEMES, CARD_SIZES, CARD_SIZE_COLS, TAB_W, TAB_H, SIDE_W,
  LangCtx, ThemeCtx, SoundCtx, MappedCtx, DashboardCtx, SizeCtx,
  useIsLandscape, useRtiStyles,
  getLang, setLang,
} from '../components/panel/PanelContext'
import { DayParticles, DarkEmbers, AuroraLayer, StarField, FireworksField } from '../components/panel/ThemeBackgrounds'
import { CategoryNav } from '../components/panel/ui/CategoryNav'
import { RightSidebar } from '../components/panel/ui/RightSidebar'
import { SecurityView } from '../components/panel/views/SecurityView'
import { CameraView } from '../components/panel/views/CameraView'
import { LightsView } from '../components/panel/views/LightsView'
import { MusicView } from '../components/panel/views/MusicView'
import { TheaterView } from '../components/panel/views/TheaterView'
import { ClimateView } from '../components/panel/views/ClimateView'
import { GarageView } from '../components/panel/views/GarageView'
import { ScenesView } from '../components/panel/views/ScenesView'

const FloorPlan3D = lazy(() => import('../components/FloorPlan3DScene').then(m => ({ default: m.FloorPlan3DScene })))

interface PanelToast { id: number; icon: string; text: string }

export default function RtiPanelPage({ standaloneToken }: { standaloneToken?: string }) {
  const { wsConnected, states, token } = useHa()
  const [mode, setMode] = useState<Mode>('2d')
  const [toasts, setToasts] = useState<PanelToast[]>([])
  const prevStates = useRef<Map<string, string>>(new Map())
  const toastId = useRef(0)

  const addToast = useCallback((icon: string, text: string) => {
    const id = ++toastId.current
    setToasts(t => [...t.slice(-3), { id, icon, text }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
  }, [])

  useEffect(() => {
    states.forEach((s, eid) => {
      const prev = prevStates.current.get(eid)
      if (prev === undefined) { prevStates.current.set(eid, s.state); return }
      if (prev === s.state) return
      prevStates.current.set(eid, s.state)
      const name = String(s.attributes.friendly_name ?? eid.split('.')[1])
      const domain = eid.split('.')[0]
      if (domain === 'binary_sensor') {
        const dc = String(s.attributes.device_class ?? '')
        if ((dc === 'door' || dc === 'window') && s.state === 'on')  addToast('🚪', `${name} opened`)
        if ((dc === 'motion') && s.state === 'on')                   addToast('🏃', `${name} detected`)
        if ((dc === 'smoke') && s.state === 'on')                    addToast('🚨', `${name} SMOKE ALARM`)
      }
      if (domain === 'alarm_control_panel') {
        if (s.state === 'triggered')  addToast('🚨', `ALARM TRIGGERED: ${name}`)
        if (s.state === 'disarmed')   addToast('✅', `${name} disarmed`)
        if (s.state === 'armed_away') addToast('🔒', `${name} armed away`)
      }
      if (domain === 'lock' && s.state === 'unlocked') addToast('🔓', `${name} unlocked`)
    })
  }, [states, addToast])
  const [cat, setCat] = useState<Cat>('lights')
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('ha_theme')
    return saved === 'dark' ? 'dark' : 'day'
  })
  const [cardSize, setCardSize] = useState<CardSize>('md')
  const cycleSize = useCallback(() => setCardSize(s => CARD_SIZES[(CARD_SIZES.indexOf(s) + 1) % CARD_SIZES.length]), [])
  const [soundMode, setSoundMode] = useState(2)
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('ha_lang') as Lang) || 'en')
  const isLandscape = useIsLandscape()
  useRtiStyles()

  // Sync lang state → sounds module on mount and on change
  useEffect(() => { setLang(lang) }, [lang])

  // Apply light/dark class on mount and theme change
  useEffect(() => {
    if (theme === 'day') document.documentElement.classList.add('light')
    else document.documentElement.classList.remove('light')
  }, [theme])

  // Load 3D mapped entity IDs — fallback filter when no dashboard.yaml view entry
  const [mappedEntityIds, setMappedEntityIds] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (!token) return
    fetch('/api/config/3d-mappings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((data: Record<string, any>) => {
        const ids = new Set(Object.values(data).map((v: any) => typeof v === 'string' ? v : v?.entity).filter(Boolean) as string[])
        setMappedEntityIds(ids)
      })
      .catch(() => setMappedEntityIds(new Set()))
  }, [token])

  // Load dashboard.yaml card configuration
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null)
  useEffect(() => {
    if (!token) return
    fetch('/api/config/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d?.views) return
        setDashboardConfig(d)
        // Navigate to first non-empty view from yaml if current tab is missing
        const firstValid = Object.keys(d.views)[0] as Cat | undefined
        if (firstValid) setCat(c => (d.views[c] !== undefined ? c : firstValid))
      })
      .catch(() => {})
  }, [token])

  const cols = isLandscape ? CARD_SIZE_COLS[cardSize].landscape : CARD_SIZE_COLS[cardSize].portrait

  const cycleLang = useCallback(() => {
    const next = LANG_LIST[(LANG_LIST.indexOf(lang) + 1) % LANG_LIST.length]
    setLangState(next); setLang(next)
    localStorage.setItem('ha_lang', next)
    window.dispatchEvent(new CustomEvent('ha-lang', { detail: next }))
  }, [lang])

  const toggleTheme = useCallback(() => setTheme(t => {
    const next = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]
    if (next === 'day') {
      document.documentElement.classList.add('light')
      localStorage.setItem('ha_theme', 'light')
    } else {
      document.documentElement.classList.remove('light')
      localStorage.setItem('ha_theme', 'dark')
    }
    return next
  }), [])
  const cycleSound = useCallback(() => setSoundMode(m => (m + 1) % 3), [])

  const BG_COLORS: Record<Theme, string> = {
    day:       'radial-gradient(ellipse at 18% 22%, rgba(140,195,255,0.65) 0%, transparent 48%), radial-gradient(ellipse at 82% 80%, rgba(100,170,255,0.45) 0%, transparent 48%), linear-gradient(150deg, #a8c8f0 0%, #9bbfe8 45%, #a4c4ee 100%)',
    dark:      'radial-gradient(ellipse at 22% 28%, rgba(30,55,140,0.38) 0%, transparent 52%), radial-gradient(ellipse at 80% 72%, rgba(80,25,130,0.28) 0%, transparent 52%), linear-gradient(135deg, #07090f 0%, #090d1a 50%, #07090f 100%)',
    aurora:    'linear-gradient(135deg, #001520 0%, #001e30 40%, #001a28 60%, #002038 100%)',
    galaxy:    'radial-gradient(ellipse at 40% 38%, rgba(50,15,100,0.75) 0%, transparent 55%), linear-gradient(135deg, #04000a 0%, #07000f 50%, #030008 100%)',
    fireworks: 'linear-gradient(135deg, #03010a 0%, #060210 45%, #040110 100%)',
  }
  const bgColor = BG_COLORS[theme]

  const sideRight = `calc(${SIDE_W}px + env(safe-area-inset-right, 0px))`
  const sideLeft  = isLandscape ? `calc(${TAB_W}px + env(safe-area-inset-left, 0px))` : '0px'
  const contentStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: sideLeft,
    right: sideRight,
    bottom: isLandscape ? 0 : TAB_H,
    overflowX: 'hidden',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch' as any,
    paddingTop: 'env(safe-area-inset-top, 0px)',
  }

  return (
    <SizeCtx.Provider value={cardSize}>
    <DashboardCtx.Provider value={dashboardConfig}>
    <MappedCtx.Provider value={mappedEntityIds}>
    <ThemeCtx.Provider value={theme}>
      <LangCtx.Provider value={lang}>
        <SoundCtx.Provider value={soundMode}>
          <div style={{ position: 'fixed', inset: 0, background: bgColor, color: theme === 'day' ? '#1c1c1e' : '#fff' }}>

            {/* Disconnection banner */}
            {!wsConnected && (
              <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9980,
                background: 'rgba(255,69,58,0.92)', backdropFilter: 'blur(8px)',
                color: '#fff', fontSize: 12, fontWeight: 700,
                textAlign: 'center', padding: '5px 0', letterSpacing: 0.3,
              }}>
                ⚡ Reconnecting…
              </div>
            )}

            {/* Animated theme layers (behind everything) */}
            {theme === 'day'       && <DayParticles />}
            {theme === 'dark'      && <DarkEmbers />}
            {theme === 'aurora'    && <AuroraLayer />}
            {theme === 'galaxy'    && <StarField />}
            {theme === 'fireworks' && <FireworksField />}

            {/* 3D mode — full width minus sidebar */}
            {mode === '3d' && (
              <div style={{ position: 'fixed', inset: 0, right: sideRight, zIndex: 1 }}>
                <Suspense fallback={<div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading 3D…</div>}>
                  <FloorPlan3D embedded tokenOverride={standaloneToken} soundMode={soundMode} />
                </Suspense>
              </div>
            )}

            {/* 2D mode */}
            {mode === '2d' && (
              <>
                <div style={{ ...contentStyle, zIndex: 1 }}>
                  {cat === 'security' && <SecurityView states={states} cols={cols} />}
                  {cat === 'camera'   && <CameraView   states={states} cols={cols} />}
                  {cat === 'music'    && <MusicView    states={states} cols={cols} />}
                  {cat === 'lights'   && <LightsView   states={states} cols={cols} />}
                  {cat === 'theater'  && <TheaterView  states={states} cols={cols} />}
                  {cat === 'climate'  && <ClimateView  states={states} cols={cols} />}
                  {cat === 'garage'   && <GarageView   states={states} cols={cols} />}
                  {cat === 'scenes'   && <ScenesView   states={states} cols={cols} />}
                </div>
                <CategoryNav cat={cat} onChange={setCat} vertical={isLandscape} cardSize={cardSize} />
              </>
            )}

            {/* Toast notifications */}
            {toasts.length > 0 && (
              <div style={{ position: 'fixed', bottom: isLandscape ? 20 : TAB_H + 12, left: 16, zIndex: 9990, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
                {toasts.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'rgba(20,22,35,0.88)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14,
                    padding: '9px 16px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                    fontSize: 13, color: '#fff', fontWeight: 500,
                    animation: 'slideIn 0.25s ease-out',
                  }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
                    <span>{t.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Right sidebar */}
            <RightSidebar
              mode={mode} onMode={setMode}
              theme={theme} onTheme={toggleTheme}
              lang={lang} onLang={cycleLang}
              soundMode={soundMode} onSound={cycleSound}
              is3d={mode === '3d'}
              cardSize={cardSize} onSizeChange={cycleSize}
            />
          </div>
        </SoundCtx.Provider>
      </LangCtx.Provider>
    </ThemeCtx.Provider>
    </MappedCtx.Provider>
    </DashboardCtx.Provider>
    </SizeCtx.Provider>
  )
}
