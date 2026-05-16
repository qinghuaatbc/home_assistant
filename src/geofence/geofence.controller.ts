import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { GeofenceService } from './geofence.service'

@Controller('geofence')
@UseGuards(JwtAuthGuard)
export class GeofenceController {
  constructor(private readonly svc: GeofenceService) {}

  @Get('zones')
  getZones() { return this.svc.getZones() }

  @Post('zones')
  createZone(@Body() b: { name: string; latitude: number; longitude: number; radiusMeters: number; icon?: string }) {
    return this.svc.createZone(b.name, b.latitude, b.longitude, b.radiusMeters, b.icon)
  }

  @Put('zones/:id')
  updateZone(@Param('id', ParseIntPipe) id: number, @Body() b: any) {
    return this.svc.updateZone(id, b)
  }

  @Delete('zones/:id')
  deleteZone(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteZone(id)
  }

  @Post('location')
  async updateLocation(@Body() b: { deviceId: string; latitude: number; longitude: number; accuracy?: number; displayName?: string }) {
    return this.svc.updateLocation(b.deviceId, b.latitude, b.longitude, b.accuracy ?? 0, b.displayName)
  }

  @Get('locations')
  getLocations() { return this.svc.getDeviceLocations() }
}
