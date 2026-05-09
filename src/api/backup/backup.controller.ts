import {
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Logger,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';

@ApiTags('backup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('backup')
export class BackupController {
  private readonly logger = new Logger(BackupController.name);

  constructor(private readonly configService: ConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Download database backup' })
  downloadBackup(@Res() res: Response): void {
    const dbPath = this.configService.get<string>('database.database', 'ha.db');
    const absPath = path.resolve(dbPath);

    if (!fs.existsSync(absPath)) {
      res.status(404).json({ error: 'Database file not found' });
      return;
    }

    res.download(absPath, `home-assistant-${new Date().toISOString().slice(0, 10)}.db`);
  }

  @Post('restore')
  @UseInterceptors(FileInterceptor('backup'))
  @ApiOperation({ summary: 'Restore database from backup' })
  async restoreBackup(
    @UploadedFile() file: any,
    @Res() res: Response,
  ): Promise<void> {
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const dbPath = this.configService.get<string>('database.database', 'ha.db');
    const absPath = path.resolve(dbPath);

    try {
      // Backup current DB as safety
      if (fs.existsSync(absPath)) {
        fs.copyFileSync(absPath, `${absPath}.pre-restore`);
        this.logger.warn(`Pre-restore backup saved: ${absPath}.pre-restore`);
      }

      // Replace with uploaded file
      fs.writeFileSync(absPath, file.buffer);

      this.logger.log('Database restored from backup');

      res.json({ ok: true, message: 'Database restored. Restarting…' });

      // Restart process after short delay
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`Restore failed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }
}
