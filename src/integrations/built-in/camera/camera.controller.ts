import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { CameraStreamService } from './camera-stream.service';

/**
 * Serves HLS streams for cameras.
 *
 *   GET /api/camera/hls/:entityId/index.m3u8?quality=hd   — HLS manifest
 *   GET /api/camera/hls/:entityId/:segment?quality=hd     — TS segments
 *
 * No auth guard — local-only endpoints loaded by <video> / hls.js.
 */
@Controller('camera')
export class CameraController {
  constructor(private readonly streamService: CameraStreamService) {}

  /** HLS manifest (.m3u8) */
  @Get('hls/:entityId/index.m3u8')
  manifest(
    @Param('entityId') entityId: string,
    @Query('quality') quality: string = '',
    @Res() res: Response,
  ): void {
    if (!this.streamService.hasCamera(entityId)) {
      throw new NotFoundException(`Camera not found: ${entityId}`);
    }

    const manifestPath = this.streamService.getHlsManifestPath(entityId, quality);
    if (!manifestPath || !fs.existsSync(manifestPath)) {
      res.status(503).send('Stream not ready yet');
      return;
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(fs.readFileSync(manifestPath));
  }

  /** HLS segment (.ts) */
  @Get('hls/:entityId/:segment')
  segment(
    @Param('entityId') entityId: string,
    @Param('segment') segment: string,
    @Query('quality') quality: string = '',
    @Res() res: Response,
  ): void {
    if (!this.streamService.hasCamera(entityId)) {
      throw new NotFoundException(`Camera not found: ${entityId}`);
    }

    // Only serve .ts files
    if (!segment.endsWith('.ts')) {
      res.status(400).send('Only .ts segments are served here');
      return;
    }

    const hlsDir = this.streamService.getHlsDir(entityId, quality);
    if (!hlsDir) {
      res.status(404).send('Stream not found');
      return;
    }

    const segPath = path.join(hlsDir, path.basename(segment));
    if (!fs.existsSync(segPath)) {
      res.status(404).send('Segment not found');
      return;
    }

    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(fs.readFileSync(segPath));
  }
}
