import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'

const CACHE_TTL = 30 * 60 * 1000  // 30 minutes

interface CacheEntry {
  data: unknown
  ts: number
  lat: number
  lon: number
}

// Single in-memory cache entry — one location at a time is enough
let cache: CacheEntry | null = null

@ApiTags('weather')
@Controller('weather')
export class WeatherController {
  @Get()
  @ApiOperation({ summary: 'Proxy Open-Meteo weather (server-side cached 30 min)' })
  async getWeather(
    @Query('lat') lat = '49.25',
    @Query('lon') lon = '-123.1',
  ) {
    const latN = parseFloat(lat)
    const lonN = parseFloat(lon)

    // Return cached data if fresh and same location (within ~1 degree)
    if (
      cache &&
      Date.now() - cache.ts < CACHE_TTL &&
      Math.abs(cache.lat - latN) < 1 &&
      Math.abs(cache.lon - lonN) < 1
    ) {
      return cache.data
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latN}&longitude=${lonN}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`
    const res = await fetch(url)
    const data = await res.json()

    if (!data.error) {
      cache = { data, ts: Date.now(), lat: latN, lon: lonN }
    }

    return data
  }
}
