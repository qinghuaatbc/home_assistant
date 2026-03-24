import { HaState } from '../../context/HaContext'

interface Props { state: HaState }

const CONDITION_ICON: Record<string, string> = {
  sunny: '☀️', partlycloudy: '⛅', cloudy: '☁️', fog: '🌫️',
  rainy: '🌧️', pouring: '⛈️', snowy: '❄️', 'snowy-rainy': '🌨️',
  lightning: '⚡', 'lightning-rainy': '⛈️', windy: '🌬️', exceptional: '🌡️',
}

function bearingToCompass(deg: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]
}

export default function WeatherCard({ state }: Props) {
  const a = state.attributes
  const icon = CONDITION_ICON[state.state] ?? '🌡️'
  const tempUnit = (a.temperature_unit as string) ?? '°C'
  const windUnit = (a.wind_speed_unit as string) ?? 'km/h'
  const location = (a.friendly_name as string) ?? state.entity_id
  const desc = (a.description as string) ?? state.state
  const temp = a.temperature as number | undefined
  const feelsLike = a.feels_like as number | undefined
  const humidity = a.humidity as number | undefined
  const windSpeed = a.wind_speed as number | undefined
  const windDir = a.wind_direction as number | undefined
  const precipitation = a.precipitation as number | undefined

  return (
    <div className="weather-card">
      <div className="weather-row">
        <span className="weather-icon">{icon}</span>
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', lineHeight: 1 }}>
            <span className="weather-temp">{temp ?? '--'}</span>
            <span className="weather-unit">{tempUnit}</span>
          </div>
          {feelsLike != null && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
              Feels like {feelsLike}{tempUnit}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div className="weather-location">{location}</div>
          <div className="weather-desc">{desc}</div>
        </div>
      </div>
      <div className="weather-stats">
        {humidity != null && (
          <div className="weather-stat">
            <span className="weather-stat-label">Humidity</span>
            <span className="weather-stat-value">{humidity}%</span>
          </div>
        )}
        {windSpeed != null && (
          <div className="weather-stat">
            <span className="weather-stat-label">Wind</span>
            <span className="weather-stat-value">{windSpeed} {windUnit}</span>
          </div>
        )}
        {windDir != null && (
          <div className="weather-stat">
            <span className="weather-stat-label">Direction</span>
            <span className="weather-stat-value">{bearingToCompass(windDir)}</span>
          </div>
        )}
        {precipitation != null && (
          <div className="weather-stat">
            <span className="weather-stat-label">Precip</span>
            <span className="weather-stat-value">{precipitation} mm</span>
          </div>
        )}
      </div>
    </div>
  )
}
