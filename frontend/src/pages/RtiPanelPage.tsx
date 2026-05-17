import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react'
import { useHa } from '../context/HaContext'
import {
  type Mode, type Cat, type Theme, type Lang, type CardSize, type DashboardConfig,
  LANG_LIST, THEMES, CATS, CARD_SIZES, CARD_SIZE_COLS, TAB_W, TAB_H, SIDE_W,
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
import { SkeletonGrid } from '../components/panel/ui/CardGrid'

const FloorPlan3D = lazy(() => import('../components/FloorPlan3DScene').then(m => ({ default: m.FloorPlan3DScene })))

interface PanelToast { id: number; icon: string; text: string; cat?: Cat }

export default function RtiPanelPage({ standaloneToken }: { standaloneToken?: string }) {
  const { wsConnected, states, token } = useHa()
  const [mode, setMode] = useState<Mode>('2d')
  const [toasts, setToasts] = useState<PanelToast[]>([])
  const prevStates = useRef<Map<string, string>>(new Map())
  const toastId = useRef(0)

  const addToast = useCallback((icon: string, text: string, cat?: Cat) => {
    const id = ++toastId.current
    setToasts(t => [...t.slice(-3), { id, icon, text, cat }])
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
        if ((dc === 'door' || dc === 'window') && s.state === 'on')  addToast('🚪', `${name} opened`, 'security')
        if ((dc === 'motion') && s.state === 'on')                   addToast('🏃', `${name} detected`, 'security')
        if ((dc === 'smoke') && s.state === 'on')                    addToast('🚨', `${name} SMOKE ALARM`, 'security')
      }
      if (domain === 'alarm_control_panel') {
        if (s.state === 'triggered')  addToast('🚨', `ALARM TRIGGERED: ${name}`, 'security')
        if (s.state === 'disarmed')   addToast('✅', `${name} disarmed`, 'security')
        if (s.state === 'armed_away') addToast('🔒', `${name} armed away`, 'security')
      }
      if (domain === 'lock' && s.state === 'unlocked') addToast('🔓', `${name} unlocked`, 'security')
    })
  }, [states, addToast])
  const [cat, setCat] = useState<Cat>(() => {
    const s = localStorage.getItem('ha_panel_cat') as Cat
    return CATS.some(c => c.id === s) ? s : 'lights'
  })
  const changeCat = useCallback((c: Cat) => { setCat(c); localStorage.setItem('ha_panel_cat', c) }, [])

  const [theme, setTheme] = useState<Theme>(() => {
    const s = localStorage.getItem('ha_panel_theme') as Theme
    return THEMES.includes(s) ? s : 'dark'
  })
  const [cardSize, setCardSize] = useState<CardSize>(() => {
    const s = localStorage.getItem('ha_panel_cardsize') as CardSize
    return CARD_SIZES.includes(s) ? s : 'md'
  })
  const cycleSize = useCallback(() => setCardSize(s => {
    const next = CARD_SIZES[(CARD_SIZES.indexOf(s) + 1) % CARD_SIZES.length]
    localStorage.setItem('ha_panel_cardsize', next); return next
  }), [])
  const [soundMode, setSoundMode] = useState(() => {
    const s = localStorage.getItem('ha_panel_sound'); const n = s !== null ? parseInt(s, 10) : 2
    return isNaN(n) ? 2 : n
  })
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('ha_lang') as Lang) || 'en')
  const isLandscape = useIsLandscape()
  useRtiStyles()

  // Screen wake lock — keep display on while panel is open
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    const acquire = async () => {
      try { lock = await (navigator as any).wakeLock.request('screen') } catch {}
    }
    acquire()
    const onVis = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release() }
  }, [])

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
        if (firstValid) setCat(c => (d.views[c] !== undefined ? c : firstValid))  // do not persist this auto-redirect
      })
      .catch(() => {})
  }, [token])

  const cols = isLandscape ? CARD_SIZE_COLS[cardSize].landscape : CARD_SIZE_COLS[cardSize].portrait

  // Pull-to-refresh
  const ptrRef   = useRef<{ startY: number; triggered: boolean } | null>(null)
  const [ptrActive, setPtrActive] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const onPtrStart = useCallback((e: React.TouchEvent) => {
    const el = scrollRef.current
    if (!el || el.scrollTop > 0) return
    ptrRef.current = { startY: e.touches[0].clientY, triggered: false }
  }, [])
  const onPtrMove = useCallback((e: React.TouchEvent) => {
    if (!ptrRef.current) return
    const dy = e.touches[0].clientY - ptrRef.current.startY
    if (dy > 60 && !ptrRef.current.triggered) { setPtrActive(true) }
  }, [])
  const onPtrEnd = useCallback(() => {
    if (!ptrRef.current) return
    if (ptrActive) { setTimeout(() => window.location.reload(), 600) }
    ptrRef.current = null
  }, [ptrActive])

  // Swipe left/right to change category
  const swipeRef = useRef<{ x: number; y: number } | null>(null)
  const activeCatIds = useMemo<Cat[]>(() => {
    if (!dashboardConfig?.views) return CATS.map(c => c.id)
    const keys = Object.keys(dashboardConfig.views) as Cat[]
    const filt = keys.filter(id => CATS.some(c => c.id === id))
    return filt.length > 0 ? filt : CATS.map(c => c.id)
  }, [dashboardConfig])
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeRef.current) return
    const dx = e.changedTouches[0].clientX - swipeRef.current.x
    const dy = e.changedTouches[0].clientY - swipeRef.current.y
    swipeRef.current = null
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return
    const idx = activeCatIds.indexOf(cat)
    const next = dx < 0
      ? activeCatIds[(idx + 1) % activeCatIds.length]
      : activeCatIds[(idx - 1 + activeCatIds.length) % activeCatIds.length]
    changeCat(next)
  }, [cat, activeCatIds, changeCat])

  const cycleLang = useCallback(() => {
    const next = LANG_LIST[(LANG_LIST.indexOf(lang) + 1) % LANG_LIST.length]
    setLangState(next); setLang(next)
    localStorage.setItem('ha_lang', next)
    window.dispatchEvent(new CustomEvent('ha-lang', { detail: next }))
  }, [lang])

  const toggleTheme = useCallback(() => setTheme(t => {
    const next = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]
    localStorage.setItem('ha_panel_theme', next)
    if (next === 'day') document.documentElement.classList.add('light')
    else document.documentElement.classList.remove('light')
    return next
  }), [])
  const cycleSound = useCallback(() => setSoundMode(m => {
    const next = (m + 1) % 3; localStorage.setItem('ha_panel_sound', String(next)); return next
  }), [])

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
                <div ref={scrollRef} style={{ ...contentStyle, zIndex: 1 }}
                  onTouchStart={(e) => { handleTouchStart(e); onPtrStart(e) }}
                  onTouchMove={onPtrMove}
                  onTouchEnd={(e) => { handleTouchEnd(e); onPtrEnd() }}
                >
                  {/* Pull-to-refresh indicator */}
                  {ptrActive && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #4d8fff, #a78bfa, #4d8fff)', backgroundSize: '200% 100%', animation: 'shimmer 1s linear infinite', zIndex: 10 }} />
                  )}
                  <div key={cat} style={{ animation: 'viewFadeIn 0.22s ease-out', minHeight: '100%' }}>
                    {states.size === 0 ? <SkeletonGrid cols={cols} /> : (
                      <>
                        {cat === 'security' && <SecurityView states={states} cols={cols} />}
                        {cat === 'camera'   && <CameraView   states={states} cols={cols} />}
                        {cat === 'music'    && <MusicView    states={states} cols={cols} />}
                        {cat === 'lights'   && <LightsView   states={states} cols={cols} />}
                        {cat === 'theater'  && <TheaterView  states={states} cols={cols} />}
                        {cat === 'climate'  && <ClimateView  states={states} cols={cols} />}
                        {cat === 'garage'   && <GarageView   states={states} cols={cols} />}
                        {cat === 'scenes'   && <ScenesView   states={states} cols={cols} />}
                      </>
                    )}
                  </div>
                </div>
                <CategoryNav cat={cat} onChange={changeCat} vertical={isLandscape} cardSize={cardSize} />
              </>
            )}

            {/* Toast notifications — right side above sidebar to avoid FloatingMic */}
            {toasts.length > 0 && (
              <div style={{ position: 'fixed', bottom: isLandscape ? 20 : TAB_H + 12, right: `calc(${SIDE_W}px + env(safe-area-inset-right, 0px) + 10px)`, zIndex: 9990, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 260 }}>
                {toasts.map(t => (
                  <div key={t.id}
                    onClick={() => { if (t.cat) { changeCat(t.cat); setMode('2d') } }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: 'rgba(20,22,35,0.88)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                      border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14,
                      padding: '9px 16px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                      fontSize: 13, color: '#fff', fontWeight: 500,
                      animation: 'slideIn 0.25s ease-out',
                      cursor: t.cat ? 'pointer' : 'default',
                    }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
                    <span>{t.text}</span>
                    {t.cat && <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 'auto' }}>→</span>}
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
