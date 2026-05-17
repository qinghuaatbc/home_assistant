import { useCallback, useMemo } from 'react'
import { useHa } from '../../../context/HaContext'
import type { HaState } from '../../../context/HaContext'
import {
  type Cat, type CardSize,
  useT, useTh, useSoundMode, useDashboard,
  CATS, NAV_BG, NAV_BORDER, SIDE_W, TAB_H, TAB_W,
  playDing, playSwitchToggle, speakText,
} from '../PanelContext'

function getActiveCounts(states: Map<string, HaState>): Partial<Record<Cat, number>> {
  const counts: Partial<Record<Cat, number>> = {}
  states.forEach((s, eid) => {
    const domain = eid.split('.')[0]
    if (domain === 'light' && s.state === 'on')
      counts.lights = (counts.lights ?? 0) + 1
    else if (domain === 'media_player' && s.state === 'playing')
      counts.music = (counts.music ?? 0) + 1
    else if (domain === 'climate' && s.state !== 'off' && s.state !== 'unavailable')
      counts.climate = (counts.climate ?? 0) + 1
    else if (domain === 'cover' && (s.state === 'open' || s.state === 'opening'))
      counts.garage = (counts.garage ?? 0) + 1
    else if (domain === 'alarm_control_panel' && s.state !== 'disarmed')
      counts.security = (counts.security ?? 0) + 1
  })
  return counts
}

const NAV_SCALE: Record<CardSize, { icon: number; label: number; boxW: number; boxH: number }> = {
  sm: { icon: 15, label: 10, boxW: 28, boxH: 22 },
  md: { icon: 18, label: 13, boxW: 36, boxH: 28 },
  lg: { icon: 22, label: 15, boxW: 44, boxH: 34 },
  xl: { icon: 26, label: 17, boxW: 52, boxH: 40 },
}
const NAV_SCALE_V: Record<CardSize, { icon: number; label: number; boxS: number }> = {
  sm: { icon: 16, label:  9, boxS: 30 },
  md: { icon: 20, label: 11, boxS: 36 },
  lg: { icon: 24, label: 13, boxS: 42 },
  xl: { icon: 28, label: 15, boxS: 48 },
}

export function WsStatusDot() {
  const { wsConnected } = useHa()
  const th = useTh()
  const color = wsConnected ? '#30d158' : '#ff453a'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 4px', gap: 2 }}>
      <div style={{
        width: 8, height: 8, borderRadius: 4,
        background: color,
        boxShadow: `0 0 6px ${color}`,
      }} />
      <span style={{ fontSize: 8, color: th === 'day' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.30)', letterSpacing: 0.2 }}>
        {wsConnected ? 'ON' : 'OFF'}
      </span>
    </div>
  )
}

export function CategoryNav({ cat, onChange, vertical, cardSize = 'md' }: {
  cat: Cat; onChange: (c: Cat) => void; vertical: boolean; cardSize?: CardSize
}) {
  const t = useT(); const th = useTh()
  const soundMode = useSoundMode()
  const dashboard = useDashboard()
  const { states } = useHa()
  const navBg = NAV_BG[th]
  const navBorder = NAV_BORDER[th]

  const sc = NAV_SCALE[cardSize]
  const sv = NAV_SCALE_V[cardSize]

  const activeCounts = useMemo(() => getActiveCounts(states), [states])

  // Derive active tabs from dashboard.yaml: show only views that exist, in yaml order
  const activeCats = useMemo(() => {
    if (!dashboard?.views) return CATS
    const yamlKeys = Object.keys(dashboard.views)
    const mapped = yamlKeys.map(id => CATS.find(c => c.id === id)).filter(Boolean) as typeof CATS
    return mapped.length > 0 ? mapped : CATS
  }, [dashboard])

  // Resolve display label: view_labels override → i18n default
  const catLabel = useCallback((id: Cat) =>
    dashboard?.view_labels?.[id] ?? t.cats[id], [dashboard, t])

  // Resolve display icon: view_icons override → CATS default
  const catIcon = useCallback((id: Cat, defaultIcon: string) =>
    dashboard?.view_icons?.[id] ?? defaultIcon, [dashboard])

  const handleClick = useCallback((c: Cat) => {
    if (c === cat) return
    if (soundMode === 1) playDing()
    else if (soundMode === 2) { playSwitchToggle(true); speakText(t.cats[c]) }
    onChange(c)
  }, [cat, soundMode, t, onChange])

  if (vertical) {
    return (
      <nav style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: `calc(${TAB_W}px + env(safe-area-inset-left, 0px))`, display: 'flex', flexDirection: 'column', background: navBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRight: `1px solid ${navBorder}`, zIndex: 30, boxSizing: 'border-box', paddingTop: 'env(safe-area-inset-top, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)' }}>
        <WsStatusDot />
        {/* Scrollable button list — inner div so iOS momentum scroll works */}
        <div style={{ flex: 1, overflowY: 'scroll', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' as any, display: 'flex', flexDirection: 'column', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
          {activeCats.map(c => {
            const active = cat === c.id
            const count = activeCounts[c.id] ?? 0
            return (
              <button key={c.id} onClick={() => handleClick(c.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '5px 4px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                flexShrink: 0,
                transition: 'opacity 0.15s',
              }}>
                <div style={{
                  position: 'relative',
                  width: sv.boxS, height: sv.boxS, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? 'rgba(240,168,0,0.22)' : 'transparent',
                  boxShadow: active ? '0 2px 10px rgba(240,168,0,0.25), inset 0 1px 0 rgba(255,220,80,0.30)' : 'none',
                  border: active ? '1px solid rgba(240,168,0,0.40)' : '1px solid transparent',
                  transition: 'background 0.2s, box-shadow 0.2s',
                }}>
                  <span style={{ fontSize: sv.icon }}>{catIcon(c.id, c.icon)}</span>
                  {count > 0 && (
                    <span style={{
                      position: 'absolute', top: -4, right: -4,
                      background: '#ff9f0a', color: '#fff',
                      fontSize: 8, fontWeight: 800,
                      borderRadius: 7, padding: '1px 4px',
                      minWidth: 13, textAlign: 'center', lineHeight: '1.3',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                    }}>{count}</span>
                  )}
                </div>
                <span style={{ fontSize: sv.label, fontWeight: active ? 700 : 500, color: active ? '#d4880a' : th === 'day' ? 'rgba(140,90,0,0.80)' : 'rgba(240,168,0,0.70)', letterSpacing: 0.2 }}>{catLabel(c.id)}</span>
              </button>
            )
          })}
        </div>
      </nav>
    )
  }

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: `calc(${SIDE_W}px + env(safe-area-inset-right, 0px))`, height: TAB_H,
      display: 'flex', background: navBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderTop: `1px solid ${navBorder}`, zIndex: 30, boxSizing: 'border-box' as const,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      overflowX: 'scroll', overflowY: 'hidden',
      WebkitOverflowScrolling: 'touch' as any,
      scrollbarWidth: 'none' as any,
    }}>
      {activeCats.map(c => {
        const active = cat === c.id
        const count = activeCounts[c.id] ?? 0
        return (
          <button key={c.id} onClick={() => handleClick(c.id)} style={{
            flex: '0 0 auto', minWidth: sc.boxW + 20, border: 'none', cursor: 'pointer', background: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 2, padding: '6px 8px', transition: 'opacity 0.15s',
          }}>
            <div style={{
              position: 'relative',
              width: sc.boxW, height: sc.boxH, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: active ? 'rgba(240,168,0,0.22)' : 'transparent',
              boxShadow: active ? '0 1px 8px rgba(240,168,0,0.25), inset 0 1px 0 rgba(255,220,80,0.30)' : 'none',
              border: active ? '1px solid rgba(240,168,0,0.40)' : '1px solid transparent',
              transition: 'background 0.2s, box-shadow 0.2s',
            }}>
              <span style={{ fontSize: sc.icon }}>{catIcon(c.id, c.icon)}</span>
              {count > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: '#ff9f0a', color: '#fff',
                  fontSize: 8, fontWeight: 800,
                  borderRadius: 7, padding: '1px 4px',
                  minWidth: 13, textAlign: 'center', lineHeight: '1.3',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }}>
                  {count}
                </span>
              )}
            </div>
            <span style={{ fontSize: sc.label, fontWeight: active ? 700 : 500, color: active ? '#d4880a' : th === 'day' ? 'rgba(140,90,0,0.80)' : 'rgba(240,168,0,0.70)' }}>{catLabel(c.id)}</span>
          </button>
        )
      })}
    </nav>
  )
}
