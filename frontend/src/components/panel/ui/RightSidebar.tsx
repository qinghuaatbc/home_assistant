import { useState, useContext } from 'react'
import { createPortal } from 'react-dom'
import { useHa } from '../../../context/HaContext'
import { usePushSubscription } from '../../../hooks/usePushSubscription'
import {
  type Mode, type Theme, type Lang, type CardSize,
  useTh, useClock, tc1, tc2,
  NAV_BG, NAV_BORDER, CARD_BORDER, CARD_SIZE_ICON, TR, SIDE_W, LangCtx,
} from '../PanelContext'
import { useWeather } from '../useWeather'

// ─── Weather Widget ───────────────────────────────────────────────────────────

function WeatherWidget() {
  const wx = useWeather()
  const th = useTh()
  const lang = useContext(LangCtx)
  const [showForecast, setShowForecast] = useState(false)

  if (!wx) return <span style={{ fontSize: 18, opacity: 0.3 }}>🌡</span>

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

export function RightSidebar({ mode, onMode, theme, onTheme, lang, onLang, soundMode, onSound, is3d, cardSize, onSizeChange }: {
  mode: Mode; onMode: (m: Mode) => void
  theme: Theme; onTheme: () => void
  lang: Lang; onLang: () => void
  soundMode: number; onSound: () => void
  is3d: boolean
  cardSize: CardSize; onSizeChange: () => void
}) {
  const time = useClock()
  const { wsConnected, token } = useHa()
  const { supported: pushSupported, subscribed, loading: pushLoading, error: pushError, toggle: togglePush, test: testPush } = usePushSubscription(token)
  const th = theme
  const sideBg = NAV_BG[th]
  const sideBorder = NAV_BORDER[th]
  const btnStyle = (active: boolean): React.CSSProperties => ({
    border: active ? '1px solid rgba(240,168,0,0.40)' : '1px solid transparent',
    borderRadius: 9, cursor: 'pointer',
    color: active ? '#d4880a' : th === 'day' ? 'rgba(140,90,0,0.80)' : 'rgba(240,168,0,0.70)',
    fontSize: 14, fontWeight: 700,
    padding: '9px 0', width: '100%', transition: 'all 0.15s',
    background: active ? 'rgba(240,168,0,0.22)' : 'transparent',
    boxShadow: active ? '0 1px 8px rgba(240,168,0,0.25), inset 0 1px 0 rgba(255,220,80,0.30)' : 'none',
  })
  const iconBtnStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 16, padding: '6px 0', width: '100%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    transition: 'opacity 0.15s',
  }

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0,
      width: `calc(${SIDE_W}px + env(safe-area-inset-right, 0px))`,
      background: sideBg, backdropFilter: 'blur(28px) saturate(1.5)', WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
      borderLeft: `1px solid ${sideBorder}`,
      zIndex: 40, overflowY: 'auto',
      WebkitOverflowScrolling: 'touch' as any,
      scrollbarWidth: 'none' as any,
      boxSizing: 'border-box' as const,
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '10px 0 90px', gap: 2,
      minHeight: '100%',
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
      <button onClick={() => onMode(mode === '3d' ? '2d' : '3d')} style={{
        ...iconBtnStyle,
        width: 36, margin: '2px auto',
        borderRadius: 10,
        background: mode === '3d'
          ? 'linear-gradient(145deg,rgba(60,20,120,0.55),rgba(20,5,60,0.65))'
          : 'linear-gradient(145deg,rgba(30,60,120,0.55),rgba(10,25,70,0.65))',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        border: CARD_BORDER[th],
        boxShadow: th === 'day'
          ? '0 3px 10px rgba(0,0,0,0.13), inset 0 1px 1px rgba(255,255,255,1)'
          : '0 3px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
        fontSize: 11, fontWeight: 800, color: '#a78bfa',
      }} title={mode === '3d' ? 'Switch to 2D' : 'Switch to 3D'}>
        {mode === '3d' ? '3D' : '2D'}
      </button>

      {/* Divider */}
      <div style={{ width: 28, height: 1, background: th === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

      {/* Card size cycle */}
      <button onClick={onSizeChange} style={{ ...iconBtnStyle, gap: 2 }}>
        <div style={{
          width: 30, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(240,168,0,0.14)', border: '1px solid rgba(240,168,0,0.35)',
        }}>
          <span style={{ fontSize: 14, color: '#d4880a' }}>{CARD_SIZE_ICON[cardSize]}</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: th === 'day' ? 'rgba(140,90,0,0.80)' : 'rgba(240,168,0,0.70)' }}>{cardSize.toUpperCase()}</span>
      </button>

      {/* Divider */}
      <div style={{ width: 28, height: 1, background: th === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

      {/* Language */}
      <button onClick={onLang} style={{ ...iconBtnStyle, fontSize: 11, fontWeight: 700, color: tc1(th) }}>
        {TR[lang].langBtn}
      </button>

      {/* Theme cycle */}
      <button onClick={onTheme} style={{
        ...iconBtnStyle,
        fontSize: 20,
        width: 36, margin: '2px auto',
        borderRadius: 10,
        background: th === 'day'
          ? 'linear-gradient(145deg,rgba(255,255,255,0.92),rgba(210,225,255,0.75))'
          : th === 'aurora'  ? 'linear-gradient(145deg,rgba(0,80,50,0.55),rgba(0,40,80,0.55))'
          : th === 'galaxy'  ? 'linear-gradient(145deg,rgba(60,20,120,0.55),rgba(20,5,60,0.65))'
          : th === 'fireworks' ? 'linear-gradient(145deg,rgba(120,60,0,0.55),rgba(60,20,0,0.65))'
          : 'linear-gradient(145deg,rgba(90,110,180,0.38),rgba(15,20,50,0.60))',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        border: CARD_BORDER[th],
        boxShadow: th === 'day'
          ? '0 3px 10px rgba(0,0,0,0.13), inset 0 1px 1px rgba(255,255,255,1)'
          : '0 3px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
      }} title="Cycle theme">
        {th === 'day' ? '☀️' : th === 'dark' ? '🌙' : th === 'aurora' ? '🌌' : th === 'galaxy' ? '✨' : '🎆'}
      </button>

      {/* Sound mode */}
      <button onClick={onSound} style={{ ...iconBtnStyle, fontSize: 18 }} title={['Silent', 'Sound effects', 'Voice'][soundMode]}>
        {soundMode === 0 ? '🔇' : soundMode === 1 ? '🎵' : '🗣'}
      </button>

      {/* Push notifications */}
      {pushSupported && (
        <>
          <button onClick={togglePush} disabled={pushLoading}
            style={{ ...iconBtnStyle, fontSize: 18, opacity: pushLoading ? 0.5 : 1 }}
            title={subscribed ? 'Tap to disable push' : 'Tap to enable push'}>
            {pushLoading ? '⏳' : subscribed ? '🔔' : '🔕'}
          </button>
          {pushError && (
            <span style={{ fontSize: 8, color: '#ff453a', textAlign: 'center', lineHeight: 1.2, padding: '0 2px' }}>
              {pushError.slice(0, 12)}
            </span>
          )}
        </>
      )}
    </div>
    </div>
  )
}
