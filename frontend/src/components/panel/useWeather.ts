import { useState, useEffect, useContext } from 'react'
import { LangCtx } from './PanelContext'
import type { Lang } from './PanelContext'

export interface ForecastDay {
  day: string
  icon: string
  hi: number
  lo: number
}

export interface WeatherData {
  icon: string
  temp: number | null
  condition: string
  forecast: ForecastDay[]
}

const WMO_ICON: Record<number, string> = {
  0: '☀️', 1: '🌤', 2: '⛅', 3: '☁️',
  45: '🌫', 48: '🌫', 51: '🌦', 53: '🌧', 55: '🌧',
  61: '🌧', 63: '🌧', 65: '🌧', 71: '❄️', 73: '❄️', 75: '❄️',
  77: '🌨', 80: '🌦', 81: '🌧', 82: '⛈', 95: '⛈', 96: '⛈', 99: '⛈',
}
function getWmoIcon(code: number) {
  return WMO_ICON[code] ?? WMO_ICON[Math.floor(code / 10) * 10] ?? '🌡'
}

const DAY_SHORT: Record<Lang, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  zh: ['日', '一', '二', '三', '四', '五', '六'],
  fa: ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'],
}

const DEFAULT_LAT = 49.25
const DEFAULT_LON = -123.1

export function useWeather(): WeatherData | null {
  const lang = useContext(LangCtx)
  const [wx, setWx] = useState<WeatherData | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchWeather = (lat: number, lon: number) => {
      // Use our backend proxy — server caches for 30 min, avoids rate limiting
      fetch(`/api/weather?lat=${lat}&lon=${lon}`)
        .then(r => r.json())
        .then(d => {
          if (cancelled || d.error) return
          const icon = getWmoIcon(d.current?.weather_code ?? 0)
          const temp = d.current?.temperature_2m != null ? Math.round(d.current.temperature_2m) : null
          const condition = String(d.current?.weather_code ?? '')
          const forecast: ForecastDay[] = (d.daily?.time ?? []).slice(0, 7).map((time: string, i: number) => ({
            day: DAY_SHORT[lang][new Date(time).getDay()],
            icon: getWmoIcon((d.daily.weather_code ?? [])[i] ?? 0),
            hi: Math.round((d.daily.temperature_2m_max ?? [])[i] ?? 0),
            lo: Math.round((d.daily.temperature_2m_min ?? [])[i] ?? 0),
          }))
          setWx({ icon, temp, condition, forecast })
        })
        .catch(() => {})
    }

    // Fetch immediately with default location
    fetchWeather(DEFAULT_LAT, DEFAULT_LON)

    // Refine with actual location if available
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => fetchWeather(p.coords.latitude, p.coords.longitude),
        () => {},
        { timeout: 5000 },
      )
    }

    // Refresh every 30 minutes
    const timer = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          p => fetchWeather(p.coords.latitude, p.coords.longitude),
          () => fetchWeather(DEFAULT_LAT, DEFAULT_LON),
          { timeout: 5000 },
        )
      } else {
        fetchWeather(DEFAULT_LAT, DEFAULT_LON)
      }
    }, 30 * 60 * 1000)

    return () => { cancelled = true; clearInterval(timer) }
  }, [lang])

  return wx
}
