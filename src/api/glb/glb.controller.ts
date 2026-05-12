import { Controller, Post, Param, UploadedFile, UseGuards, UseInterceptors, Logger, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('glb')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('glb')
export class GlbController {
  private readonly logger = new Logger(GlbController.name);

  @Post('upload/:floorId')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload a GLB file for a floor' })
  async uploadGlb(@Param('floorId') floorId: string, @UploadedFile() file: any, @Res() res: Response) {
    if (!file) return res.status(400).json({ error: 'No file' });
    if (!/^\d+$/.test(floorId)) return res.status(400).json({ error: 'Invalid floorId' });
    const uploadDir = path.resolve(process.cwd(), 'data', 'floors');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const filename = `floor${floorId}.glb`;
    try {
      fs.writeFileSync(path.join(uploadDir, filename), file.buffer);
      this.logger.log(`GLB uploaded: ${filename}`);
      return res.json({ ok: true, filename });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
}
