import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  Res,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WebrtcService } from './webrtc.service';

@Controller('webrtc')
export class WebrtcController {
  constructor(private readonly webrtcService: WebrtcService) {}

  /** List all streams with optional HLS URL for integration cameras */
  @Get('streams')
  getStreams() {
    return this.webrtcService.getStreams().map(s => {
      const hlsUrl = s.entityId
        ? `/api/camera/hls/${s.entityId}/index.m3u8`
        : undefined;
      return { name: s.name, source: s.source, entityId: s.entityId, hlsUrl };
    });
  }

  /** Add a manual stream */
  @Post('streams')
  addStream(@Body() body: { name: string; rtsp_url: string }) {
    if (!body.name || !body.rtsp_url) {
      throw new BadRequestException('name and rtsp_url are required');
    }
    this.webrtcService.addStream(body.name, body.rtsp_url);
    return { ok: true };
  }

  /** Remove a manual stream */
  @Delete('streams/:name')
  removeStream(@Param('name') name: string) {
    const removed = this.webrtcService.removeStream(name);
    if (!removed) throw new NotFoundException(`Stream not found: ${name}`);
    return { ok: true };
  }

  /**
   * WHEP endpoint — proxy SDP offer to go2rtc and return SDP answer.
   * Frontend posts Content-Type: application/sdp body.
   */
  @Post('whep/:name')
  async whep(
    @Param('name') name: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.webrtcService.isReady()) {
      throw new ServiceUnavailableException('go2rtc not ready');
    }

    const streams = this.webrtcService.getStreams();
    if (!streams.find(s => s.name === name)) {
      throw new NotFoundException(`Stream not found: ${name}`);
    }

    const chunks: Buffer[] = [];
    req.on('data', (d: Buffer) => chunks.push(d));
    await new Promise<void>(r => req.on('end', r));
    const sdpOffer = Buffer.concat(chunks).toString('utf8');

    try {
      const sdpAnswer = await this.webrtcService.proxyWhep(name, sdpOffer);
      res.setHeader('Content-Type', 'application/sdp');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(sdpAnswer);
    } catch (err) {
      throw new ServiceUnavailableException(`WHEP proxy failed: ${(err as Error).message}`);
    }
  }
}
