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
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { WebrtcService } from './webrtc.service';

@Controller('webrtc')
export class WebrtcController {
  constructor(
    private readonly webrtcService: WebrtcService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Return ICE servers (STUN + TURN) for WebRTC clients.
   * TURN credentials use time-limited HMAC so the secret never leaves the server.
   * TTL: 24 hours.
   */
  @Get('ice-servers')
  getIceServers() {
    const turnHost = this.configService.get<string>('turn.host');
    const turnSecret = this.configService.get<string>('turn.secret');
    const stun: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
    if (!turnHost || !turnSecret) return { iceServers: stun };

    // Time-limited HMAC credentials (coturn --use-auth-secret)
    const ttl = 24 * 3600;
    const username = `${Math.floor(Date.now() / 1000) + ttl}:ha`;
    const password = crypto.createHmac('sha1', turnSecret).update(username).digest('base64');
    const turn: RTCIceServer[] = [
      { urls: `turn:${turnHost}:3478`, username, credential: password },
      { urls: `turn:${turnHost}:3478?transport=tcp`, username, credential: password },
    ];
    return { iceServers: [...stun, ...turn] };
  }

  /** List all streams — HLS served by go2rtc at /go2rtc/api/hls/:name/index.m3u8 */
  @Get('streams')
  getStreams() {
    return this.webrtcService.getStreams().map(s => ({
      name: s.name,
      source: s.source,
      entityId: s.entityId,
      hlsUrl: `/go2rtc/api/stream.m3u8?src=${s.name}`,
    }));
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
