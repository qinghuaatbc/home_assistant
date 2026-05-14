import { useState, useEffect, useContext } from 'react'
import { createPortal } from 'react-dom'
import { useHa } from '../../../context/HaContext'
import {
  type Mode, type Theme, type Lang, type CardSize,
  useTh, useClock, tc1, tc2,
  NAV_BG, NAV_BORDER, CARD_BORDER, CARD_SIZE_ICON, TR, SIDE_W,
} from '../PanelContext'

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

import { LangCtx } from '../PanelContext'

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

export function RightSidebar({ mode, onMode, theme, onTheme, lang, onLang, soundMode, onSound, is3d, cardSize, onSizeChange }: {
  mode: Mode; onMode: (m: Mode) => void
  theme: Theme; onTheme: () => void
  lang: Lang; onLang: () => void
  soundMode: number; onSound: () => void
  is3d: boolean
  cardSize: CardSize; onSizeChange: () => void
}) {
  const time = useClock()
  const { wsConnected } = useHa()
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
      position: 'fixed', right: 0, top: 0, bottom: 0, width: SIDE_W,
      background: sideBg, backdropFilter: 'blur(28px) saturate(1.5)', WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
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
        {soundMode === 0 ? '🔇' : soundMode === 1 ? '🔔' : '🗣'}
      </button>
    </div>
  )
}
