import { useCallback } from 'react'
import { useHa } from '../../../context/HaContext'
import {
  type Cat, type Theme,
  useT, useTh, useSoundMode,
  CATS, NAV_BG, NAV_BORDER, SIDE_W, TAB_H, TAB_W,
  playDing, playSwitchToggle, speakText,
} from '../PanelContext'

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

export function CategoryNav({ cat, onChange, vertical }: {
  cat: Cat; onChange: (c: Cat) => void; vertical: boolean
}) {
  const t = useT(); const th = useTh()
  const soundMode = useSoundMode()
  const navBg = NAV_BG[th]
  const navBorder = NAV_BORDER[th]

  const handleClick = useCallback((c: Cat) => {
    if (c === cat) return
    if (soundMode === 1) playDing()
    else if (soundMode === 2) { playSwitchToggle(true); speakText(t.cats[c]) }
    onChange(c)
  }, [cat, soundMode, t, onChange])

  if (vertical) {
    return (
      <nav style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: TAB_W, display: 'flex', flexDirection: 'column', background: navBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRight: `1px solid ${navBorder}`, zIndex: 30, overflowY: 'auto' }}>
        <WsStatusDot />
        {CATS.map(c => {
          const active = cat === c.id
          return (
            <button key={c.id} onClick={() => handleClick(c.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '5px 4px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              transition: 'opacity 0.15s',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? 'rgba(240,168,0,0.22)' : 'transparent',
                boxShadow: active ? '0 2px 10px rgba(240,168,0,0.25), inset 0 1px 0 rgba(255,220,80,0.30)' : 'none',
                border: active ? '1px solid rgba(240,168,0,0.40)' : '1px solid transparent',
                transition: 'background 0.2s, box-shadow 0.2s',
              }}>
                <span style={{ fontSize: 20 }}>{c.icon}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? '#d4880a' : th === 'day' ? 'rgba(140,90,0,0.80)' : 'rgba(240,168,0,0.70)', letterSpacing: 0.2 }}>{t.cats[c.id]}</span>
            </button>
          )
        })}
      </nav>
    )
  }

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: SIDE_W, height: TAB_H,
      display: 'flex', background: navBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderTop: `1px solid ${navBorder}`, zIndex: 30, paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {CATS.map(c => {
        const active = cat === c.id
        return (
          <button key={c.id} onClick={() => handleClick(c.id)} style={{
            flex: 1, border: 'none', cursor: 'pointer', background: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 2, padding: '6px 4px', transition: 'opacity 0.15s',
          }}>
            <div style={{
              width: 36, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: active ? 'rgba(240,168,0,0.22)' : 'transparent',
              boxShadow: active ? '0 1px 8px rgba(240,168,0,0.25), inset 0 1px 0 rgba(255,220,80,0.30)' : 'none',
              border: active ? '1px solid rgba(240,168,0,0.40)' : '1px solid transparent',
              transition: 'background 0.2s, box-shadow 0.2s',
            }}>
              <span style={{ fontSize: 18 }}>{c.icon}</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#d4880a' : th === 'day' ? 'rgba(140,90,0,0.80)' : 'rgba(240,168,0,0.70)' }}>{t.cats[c.id]}</span>
          </button>
        )
      })}
    </nav>
  )
}
