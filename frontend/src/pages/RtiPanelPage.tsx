import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useHa } from '../context/HaContext'
import {
  type Mode, type Cat, type Theme, type Lang, type CardSize, type DashboardConfig,
  LANG_LIST, THEMES, CARD_SIZES, CARD_SIZE_COLS, TAB_W, TAB_H, SIDE_W,
  LangCtx, ThemeCtx, SoundCtx, MappedCtx, DashboardCtx,
  useIsLandscape, useRtiStyles,
  getLang, setLang,
} from '../components/panel/PanelContext'
import { DayParticles, DarkEmbers, AuroraLayer, StarField, FireworksField } from '../components/panel/ThemeBackgrounds'
import { CategoryNav } from '../components/panel/ui/CategoryNav'
import { RightSidebar } from '../components/panel/ui/RightSidebar'
import { SecurityView } from '../components/panel/views/SecurityView'
import { LightsView } from '../components/panel/views/LightsView'
import { MusicView } from '../components/panel/views/MusicView'
import { TheaterView } from '../components/panel/views/TheaterView'
import { ClimateView } from '../components/panel/views/ClimateView'
import { GarageView } from '../components/panel/views/GarageView'
import { ScenesView } from '../components/panel/views/ScenesView'

const FloorPlan3D = lazy(() => import('../components/FloorPlan3DScene').then(m => ({ default: m.FloorPlan3DScene })))

export default function RtiPanelPage({ standaloneToken }: { standaloneToken?: string }) {
  const [mode, setMode] = useState<Mode>('3d')
  const [cat, setCat] = useState<Cat>('lights')
  const [theme, setTheme] = useState<Theme>('day')
  const [cardSize, setCardSize] = useState<CardSize>('md')
  const cycleSize = useCallback(() => setCardSize(s => CARD_SIZES[(CARD_SIZES.indexOf(s) + 1) % CARD_SIZES.length]), [])
  const [soundMode, setSoundMode] = useState(0)
  const [lang, setLangState] = useState<Lang>(() => {
    const l = getLang(); return (l === 'zh' || l === 'fa') ? l as Lang : 'en'
  })
  const isLandscape = useIsLandscape()
  const { states, token } = useHa()
  useRtiStyles()

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
      .then((d: any) => { if (d?.views) setDashboardConfig(d) })
      .catch(() => {})
  }, [token])

  const cols = isLandscape ? CARD_SIZE_COLS[cardSize].landscape : CARD_SIZE_COLS[cardSize].portrait

  const cycleLang = useCallback(() => {
    const next = LANG_LIST[(LANG_LIST.indexOf(lang) + 1) % LANG_LIST.length]
    setLangState(next); setLang(next)
  }, [lang])

  const toggleTheme = useCallback(() => setTheme(t => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]), [])
  const cycleSound = useCallback(() => setSoundMode(m => (m + 1) % 3), [])

  const BG_COLORS: Record<Theme, string> = {
    day:       'radial-gradient(ellipse at 18% 22%, rgba(180,210,255,0.55) 0%, transparent 48%), radial-gradient(ellipse at 82% 80%, rgba(160,190,240,0.40) 0%, transparent 48%), linear-gradient(150deg, #b8c8d8 0%, #adbdce 45%, #b4c4d4 100%)',
    dark:      'radial-gradient(ellipse at 22% 28%, rgba(30,55,140,0.38) 0%, transparent 52%), radial-gradient(ellipse at 80% 72%, rgba(80,25,130,0.28) 0%, transparent 52%), linear-gradient(135deg, #07090f 0%, #090d1a 50%, #07090f 100%)',
    aurora:    'linear-gradient(135deg, #001520 0%, #001e30 40%, #001a28 60%, #002038 100%)',
    galaxy:    'radial-gradient(ellipse at 40% 38%, rgba(50,15,100,0.75) 0%, transparent 55%), linear-gradient(135deg, #04000a 0%, #07000f 50%, #030008 100%)',
    fireworks: 'linear-gradient(135deg, #03010a 0%, #060210 45%, #040110 100%)',
  }
  const bgColor = BG_COLORS[theme]

  const contentStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: isLandscape ? TAB_W : 0,
    right: SIDE_W,
    bottom: isLandscape ? 0 : TAB_H,
    overflow: 'hidden',
  }

  return (
    <DashboardCtx.Provider value={dashboardConfig}>
    <MappedCtx.Provider value={mappedEntityIds}>
    <ThemeCtx.Provider value={theme}>
      <LangCtx.Provider value={lang}>
        <SoundCtx.Provider value={soundMode}>
          <div style={{ position: 'fixed', inset: 0, background: bgColor, color: theme === 'day' ? '#1c1c1e' : '#fff' }}>

            {/* Animated theme layers (behind everything) */}
            {theme === 'day'       && <DayParticles />}
            {theme === 'dark'      && <DarkEmbers />}
            {theme === 'aurora'    && <AuroraLayer />}
            {theme === 'galaxy'    && <StarField />}
            {theme === 'fireworks' && <FireworksField />}

            {/* 3D mode — full width minus sidebar */}
            {mode === '3d' && (
              <div style={{ position: 'fixed', inset: 0, right: SIDE_W, zIndex: 1 }}>
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
                  {cat === 'music'    && <MusicView    states={states} cols={cols} />}
                  {cat === 'lights'   && <LightsView   states={states} cols={cols} />}
                  {cat === 'theater'  && <TheaterView  states={states} cols={cols} />}
                  {cat === 'climate'  && <ClimateView  states={states} cols={cols} />}
                  {cat === 'garage'   && <GarageView   states={states} cols={cols} />}
                  {cat === 'scenes'   && <ScenesView   states={states} cols={cols} />}
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
              cardSize={cardSize} onSizeChange={cycleSize}
            />
          </div>
        </SoundCtx.Provider>
      </LangCtx.Provider>
    </ThemeCtx.Provider>
    </MappedCtx.Provider>
    </DashboardCtx.Provider>
  )
}
