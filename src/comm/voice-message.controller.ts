import { Controller, Post, Get, Param, Body, Res, UploadedFile, UseInterceptors, Logger } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { VoiceMessageService } from './voice-message.service'
import { CommGateway } from './comm.gateway'

@ApiTags('comm')
@Controller('comm')
export class VoiceMessageController {
  private readonly logger = new Logger(VoiceMessageController.name)

  constructor(
    private readonly voiceMsg: VoiceMessageService,
    private readonly gateway: CommGateway,
  ) {}

  @Post('voice-message')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: any,
    @Body() body: { senderId: string; senderName: string; recipientId?: string; durationMs?: string },
  ) {
    if (!file?.buffer) return { error: 'No audio' }
    const ext = (file.originalname?.split('.').pop() ?? 'webm').replace(/[^a-z0-9]/gi, '')
    const recipientId = body.recipientId || null
    const durationMs = Number(body.durationMs ?? 0)
    const entity = await this.voiceMsg.save(
      body.senderId ?? 'unknown',
      body.senderName ?? 'Unknown',
      recipientId,
      file.buffer,
      ext,
      durationMs,
    )

    // Notify recipient via socket if online
    this.gateway.deliverVoiceMessage(entity)

    this.logger.log(`Voice message ${entity.id} from ${body.senderName} → ${recipientId ?? 'all'}`)
    return { id: entity.id, filename: entity.filename }
  }

  @Get('voice-message/:id/audio')
  async stream(@Param('id') id: string, @Res() res: Response) {
    const msg = await this.voiceMsg.findById(Number(id))
    if (!msg) return res.status(404).end()
    const filePath = this.voiceMsg.getFilePath(msg.filename)
    if (!fs.existsSync(filePath)) return res.status(404).end()
    res.setHeader('Content-Type', 'audio/webm')
    res.setHeader('Accept-Ranges', 'bytes')
    fs.createReadStream(filePath).pipe(res)
  }

  @Get('voice-messages')
  async history() {
    return this.voiceMsg.getHistory()
  }

  // ── Media (image / video / file) upload ─────────────────────────────────────

  @Post('media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async uploadMedia(
    @UploadedFile() file: any,
    @Body() body: { senderId?: string; senderName?: string; recipientId?: string },
  ) {
    if (!file?.buffer) return { error: 'No file' }
    const mediaDir = path.join(process.cwd(), 'config', 'media')
    fs.mkdirSync(mediaDir, { recursive: true })
    const origExt = (file.originalname?.split('.').pop() ?? 'bin').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 8)
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${origExt}`
    fs.writeFileSync(path.join(mediaDir, filename), file.buffer)

    const mime: string = file.mimetype ?? ''
    const mediaType = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'file'
    const url = `/api/comm/media/${filename}`

    this.logger.log(`Media upload: ${filename} (${mediaType}) from ${body.senderName ?? 'unknown'}`)
    return { url, mediaType, mediaName: file.originalname ?? filename }
  }

  @Get('media/:filename')
  async serveMedia(@Param('filename') filename: string, @Res() res: Response) {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '')
    const filePath = path.join(process.cwd(), 'config', 'media', safe)
    if (!fs.existsSync(filePath)) return res.status(404).end()
    const ext = safe.split('.').pop()?.toLowerCase() ?? ''
    const mime =
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
      ext === 'png' ? 'image/png' :
      ext === 'gif' ? 'image/gif' :
      ext === 'webp' ? 'image/webp' :
      ext === 'mp4' ? 'video/mp4' :
      ext === 'webm' ? 'video/webm' :
      ext === 'mov' ? 'video/quicktime' :
      ext === 'pdf' ? 'application/pdf' :
      'application/octet-stream'
    res.setHeader('Content-Type', mime)
    res.setHeader('Accept-Ranges', 'bytes')
    fs.createReadStream(filePath).pipe(res)
  }
}
