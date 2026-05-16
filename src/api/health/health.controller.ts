import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as os from 'os';
import * as fs from 'fs';

@ApiTags('health')
@Controller()
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'API health check' })
  getHealth() {
    return { message: 'API running.' };
  }

  @Get('health')
  @ApiOperation({ summary: 'Detailed health with uptime' })
  getDetailedHealth() {
    return {
      status: 'ok',
      uptime: process.uptime(),
    };
  }

  @Get('system/stats')
  @ApiOperation({ summary: 'System resource usage' })
  getSystemStats() {
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;

    // CPU usage: compare two snapshots separated by a tick
    const cpus = os.cpus();
    let totalIdle = 0, totalTick = 0;
    for (const cpu of cpus) {
      for (const type of Object.values(cpu.times)) totalTick += type;
      totalIdle += cpu.times.idle;
    }
    const cpuUsed = Math.round((1 - totalIdle / totalTick) * 100);

    // Disk usage of the data directory
    let diskTotal = 0, diskFree = 0;
    try {
      const stat = fs.statfsSync(process.cwd());
      diskTotal = stat.bsize * stat.blocks;
      diskFree  = stat.bsize * stat.bfree;
    } catch { /* statfsSync may not exist on older Node */ }

    const mem = (process.memoryUsage as any)();

    return {
      cpu: { usedPercent: cpuUsed, cores: cpus.length, model: cpus[0]?.model ?? '' },
      memory: {
        totalMb:  Math.round(totalMem / 1024 / 1024),
        usedMb:   Math.round(usedMem  / 1024 / 1024),
        freeMb:   Math.round(freeMem  / 1024 / 1024),
        usedPercent: Math.round((usedMem / totalMem) * 100),
      },
      disk: diskTotal > 0 ? {
        totalGb:  +(diskTotal / 1024 / 1024 / 1024).toFixed(1),
        usedGb:   +((diskTotal - diskFree) / 1024 / 1024 / 1024).toFixed(1),
        freeGb:   +(diskFree / 1024 / 1024 / 1024).toFixed(1),
        usedPercent: Math.round(((diskTotal - diskFree) / diskTotal) * 100),
      } : null,
      process: {
        uptimeSec:  Math.round(process.uptime()),
        heapUsedMb: Math.round((mem.heapUsed ?? 0) / 1024 / 1024),
        rss:        Math.round((mem.rss ?? 0) / 1024 / 1024),
      },
      platform: os.platform(),
      nodeVersion: process.version,
      hostname: os.hostname(),
    };
  }
}
