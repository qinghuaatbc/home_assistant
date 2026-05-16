import { Controller, Get, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { SunService } from './sun.service'

@Controller('sun')
@UseGuards(JwtAuthGuard)
export class SunController {
  constructor(private readonly svc: SunService) {}

  @Get()
  get() {
    const t = this.svc.getSunTimes()
    const loc = this.svc.getLocation()
    if (!t) return { error: 'polar_day_or_night', ...loc }
    return {
      rise: t.rise.toISOString(),
      set: t.set.toISOString(),
      nextRise: t.nextRise.toISOString(),
      nextSet: t.nextSet.toISOString(),
      elevation: t.elevation,
      isAboveHorizon: t.isAboveHorizon,
      ...loc,
    }
  }
}
