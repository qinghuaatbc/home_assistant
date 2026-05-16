import { Controller, Get, Post, Logger, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { StateMachineService } from '../../core/state-machine/state-machine.service';
import { Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const exec = promisify(execFile);
const ROOT = path.resolve(process.cwd());

@ApiTags('ota')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('ota')
export class OtaController {
  private readonly logger = new Logger(OtaController.name);

  constructor(private readonly stateMachine: StateMachineService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get current version and check for server updates' })
  async status() {
    // Read current version from package.json
    let currentVersion = '?';
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
      currentVersion = pkg.version ?? '?';
    } catch {}

    // Check git status
    let hasUpdate = false;
    let gitLog: string[] = [];
    let gitBranch = 'unknown';
    let gitCommit = 'unknown';
    try {
      const { stdout: branch } = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT });
      gitBranch = branch.trim();
      const { stdout: commit } = await exec('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT });
      gitCommit = commit.trim();
      await exec('git', ['fetch', '--quiet'], { cwd: ROOT });
      const { stdout: log } = await exec('git', ['log', 'HEAD..origin/' + gitBranch, '--oneline', '--max-count=20'], { cwd: ROOT });
      gitLog = log.trim().split('\n').filter(Boolean);
      hasUpdate = gitLog.length > 0;
    } catch {}

    // Device update entities
    const updateEntities = this.stateMachine.getStates()
      .filter(s => s.entity_id.startsWith('update.'))
      .map(s => ({
        entity_id: s.entity_id,
        name: String(s.attributes?.friendly_name ?? s.entity_id.replace('update.', '').replace(/_/g, ' ')),
        state: s.state,
        installedVersion: String(s.attributes?.installed_version ?? ''),
        latestVersion: String(s.attributes?.latest_version ?? ''),
        title: String(s.attributes?.title ?? ''),
        releaseNotes: String(s.attributes?.release_notes ?? ''),
      }));

    return { currentVersion, hasUpdate, gitBranch, gitCommit, gitLog, updateEntities };
  }

  @Post('update-server')
  @ApiOperation({ summary: 'Pull latest code and rebuild (self-update)' })
  async updateServer(@Res() res: Response) {
    this.logger.warn('Server self-update initiated');
    res.json({ ok: true, message: 'Update started. Server will restart in ~60s.' });
    // Run in background after response is sent
    setTimeout(async () => {
      try {
        await exec('git', ['pull'], { cwd: ROOT });
        await exec('npm', ['install', '--omit=dev'], { cwd: ROOT });
        await exec('npm', ['run', 'build:backend'], { cwd: ROOT });
        await exec('pm2', ['restart', 'home-assistant'], { cwd: ROOT });
      } catch (err: any) {
        this.logger.error(`Self-update failed: ${err.message}`);
        process.exit(1);
      }
    }, 500);
  }
}
