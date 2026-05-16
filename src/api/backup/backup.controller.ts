import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Logger,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const SNAPSHOT_DIR = path.resolve(process.cwd(), 'config', 'backups');

interface SnapshotMeta {
  id: string;
  label: string;
  createdAt: string;
  sizeBytes: number;
  files: string[];
}

@ApiTags('backup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('backup')
export class BackupController {
  private readonly logger = new Logger(BackupController.name);

  constructor(private readonly configService: ConfigService) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }

  // ── Live DB download (unchanged) ─────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Download live database' })
  downloadBackup(@Res() res: Response): void {
    const dbPath = this.configService.get<string>('database.database', 'ha.db');
    const absPath = path.resolve(dbPath);
    if (!fs.existsSync(absPath)) { res.status(404).json({ error: 'Database file not found' }); return; }
    res.download(absPath, `home-assistant-${new Date().toISOString().slice(0, 10)}.db`);
  }

  // ── Snapshot create ───────────────────────────────────────────────────────

  @Post('snapshot')
  @ApiOperation({ summary: 'Create a named snapshot' })
  createSnapshot(@Body() body: { label?: string }): SnapshotMeta | { error: string } {
    const dbPath = this.configService.get<string>('database.database', 'ha.db');
    const absPath = path.resolve(dbPath);
    if (!fs.existsSync(absPath)) return { error: 'Database not found' };

    const id = `snap_${Date.now()}`;
    const snapDir = path.join(SNAPSHOT_DIR, id);
    fs.mkdirSync(snapDir, { recursive: true });

    const files: string[] = [];

    // Copy DB
    fs.copyFileSync(absPath, path.join(snapDir, 'ha.db'));
    files.push('ha.db');

    // Copy YAML config files
    const configDir = path.resolve(process.cwd(), 'config');
    for (const f of fs.readdirSync(configDir)) {
      if (f.endsWith('.yaml') || f.endsWith('.yml')) {
        try {
          fs.copyFileSync(path.join(configDir, f), path.join(snapDir, f));
          files.push(f);
        } catch {}
      }
    }

    const meta: SnapshotMeta = {
      id, label: (body?.label || new Date().toLocaleString()).slice(0, 80),
      createdAt: new Date().toISOString(),
      sizeBytes: fs.statSync(path.join(snapDir, 'ha.db')).size,
      files,
    };
    fs.writeFileSync(path.join(snapDir, 'meta.json'), JSON.stringify(meta, null, 2));
    this.logger.log(`Snapshot created: ${id} (${files.join(', ')})`);
    return meta;
  }

  // ── Snapshot list ─────────────────────────────────────────────────────────

  @Get('snapshots')
  @ApiOperation({ summary: 'List all snapshots' })
  listSnapshots(): SnapshotMeta[] {
    if (!fs.existsSync(SNAPSHOT_DIR)) return [];
    return fs.readdirSync(SNAPSHOT_DIR)
      .filter(d => d.startsWith('snap_'))
      .map(d => {
        const metaPath = path.join(SNAPSHOT_DIR, d, 'meta.json');
        if (!fs.existsSync(metaPath)) return null;
        return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as SnapshotMeta;
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime()) as SnapshotMeta[];
  }

  // ── Snapshot download ─────────────────────────────────────────────────────

  @Get('snapshots/:id/download')
  @ApiOperation({ summary: 'Download snapshot DB' })
  downloadSnapshot(@Param('id') id: string, @Res() res: Response): void {
    const dbFile = path.join(SNAPSHOT_DIR, id, 'ha.db');
    if (!fs.existsSync(dbFile)) { res.status(404).end(); return; }
    const meta: SnapshotMeta = JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, id, 'meta.json'), 'utf-8'));
    const date = new Date(meta.createdAt).toISOString().slice(0, 10);
    res.download(dbFile, `ha-backup-${date}.db`);
  }

  // ── Snapshot delete ───────────────────────────────────────────────────────

  @Delete('snapshots/:id')
  @ApiOperation({ summary: 'Delete a snapshot' })
  deleteSnapshot(@Param('id') id: string): { ok: boolean } {
    const snapDir = path.join(SNAPSHOT_DIR, id);
    if (!fs.existsSync(snapDir) || !id.startsWith('snap_')) return { ok: false };
    fs.rmSync(snapDir, { recursive: true, force: true });
    this.logger.log(`Snapshot deleted: ${id}`);
    return { ok: true };
  }

  // ── Restore from upload ───────────────────────────────────────────────────

  @Post('restore')
  @UseInterceptors(FileInterceptor('backup'))
  @ApiOperation({ summary: 'Restore database from uploaded file' })
  async restoreBackup(@UploadedFile() file: any, @Res() res: Response): Promise<void> {
    if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    const dbPath = this.configService.get<string>('database.database', 'ha.db');
    const absPath = path.resolve(dbPath);
    const SQLITE_MAGIC = Buffer.from('53514c69746520666f726d61742033', 'hex');
    if (!file.buffer.slice(0, 15).equals(SQLITE_MAGIC)) {
      res.status(400).json({ error: 'Not a valid SQLite database' }); return;
    }
    try {
      if (fs.existsSync(absPath)) fs.copyFileSync(absPath, `${absPath}.pre-restore`);
      fs.writeFileSync(absPath, file.buffer);
      this.logger.log('Database restored from uploaded backup');
      res.json({ ok: true, message: 'Restored. Restarting…' });
      setTimeout(() => process.exit(0), 1000);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ── Restore from snapshot ─────────────────────────────────────────────────

  @Post('snapshots/:id/restore')
  @ApiOperation({ summary: 'Restore from a saved snapshot' })
  async restoreSnapshot(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const dbFile = path.join(SNAPSHOT_DIR, id, 'ha.db');
    if (!fs.existsSync(dbFile) || !id.startsWith('snap_')) {
      res.status(404).json({ error: 'Snapshot not found' }); return;
    }
    const dbPath = this.configService.get<string>('database.database', 'ha.db');
    const absPath = path.resolve(dbPath);
    try {
      if (fs.existsSync(absPath)) fs.copyFileSync(absPath, `${absPath}.pre-restore`);
      fs.copyFileSync(dbFile, absPath);
      // Also restore YAML configs
      const snapDir = path.join(SNAPSHOT_DIR, id);
      const configDir = path.resolve(process.cwd(), 'config');
      for (const f of fs.readdirSync(snapDir)) {
        if (f.endsWith('.yaml') || f.endsWith('.yml')) {
          fs.copyFileSync(path.join(snapDir, f), path.join(configDir, f));
        }
      }
      this.logger.log(`Restored from snapshot: ${id}`);
      res.json({ ok: true, message: 'Restored. Restarting…' });
      setTimeout(() => process.exit(0), 1000);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
