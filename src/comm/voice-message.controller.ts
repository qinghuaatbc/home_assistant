import { Controller, Post, Get, Param, Req, Res, Logger } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Request, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Busboy = require('busboy')
import { VoiceMessageService } from './voice-message.service'
import { CommGateway } from './comm.gateway'

// Parse multipart/form-data using busboy directly (multer 2.x breaks NestJS FileInterceptor)
function parseMultipart(req: Request, maxBytes = 100 * 1024 * 1024): Promise<{
  fields: Record<string, string>
  file: { buffer: Buffer; filename: string; mimetype: string } | null
}> {
  return new Promise((resolve, reject) => {
    let bb: any
    try {
      bb = Busboy({ headers: req.headers, limits: { fileSize: maxBytes } })
    } catch (e) {
      return reject(e)
    }
    const fields: Record<string, string> = {}
    let file: { buffer: Buffer; filename: string; mimetype: string } | null = null

    bb.on('file', (_name: string, stream: NodeJS.ReadableStream, info: { filename: string; mimeType: string }) => {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => { file = { buffer: Buffer.concat(chunks), filename: info.filename, mimetype: info.mimeType } })
    })
    bb.on('field', (name: string, val: string) => { fields[name] = val })
    bb.on('close', () => resolve({ fields, file }))
    bb.on('error', reject)
    req.pipe(bb)
  })
}

@ApiTags('comm')
@Controller('comm')
export class VoiceMessageController {
  private readonly logger = new Logger(VoiceMessageController.name)

  constructor(
    private readonly voiceMsg: VoiceMessageService,
    private readonly gateway: CommGateway,
  ) {}

  @Post('voice-message')
  async upload(@Req() req: Request, @Res() res: Response) {
    let parsed: Awaited<ReturnType<typeof parseMultipart>>
    try {
      parsed = await parseMultipart(req, 10 * 1024 * 1024)
    } catch (e) {
      return res.status(400).json({ error: 'Multipart parse failed' })
    }
    const { fields, file } = parsed
    if (!file?.buffer?.length) return res.status(400).json({ error: 'No audio' })

    const ext = (file.filename?.split('.').pop() ?? 'webm').replace(/[^a-z0-9]/gi, '')
    const recipientId = fields.recipientId || null
    const durationMs = Number(fields.durationMs ?? 0)
    const entity = await this.voiceMsg.save(
      fields.senderId ?? 'unknown',
      fields.senderName ?? 'Unknown',
      recipientId,
      file.buffer,
      ext,
      durationMs,
    )
    this.gateway.deliverVoiceMessage(entity)
    this.logger.log(`Voice message ${entity.id} from ${fields.senderName} → ${recipientId ?? 'all'}`)
    res.json({ id: entity.id, filename: entity.filename })
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

  // ── Media (image / video / file) upload ──────────────────────────────────

  @Post('media')
  async uploadMedia(@Req() req: Request, @Res() res: Response) {
    let parsed: Awaited<ReturnType<typeof parseMultipart>>
    try {
      parsed = await parseMultipart(req, 100 * 1024 * 1024)
    } catch (e) {
      return res.status(400).json({ error: 'Multipart parse failed' })
    }
    const { fields, file } = parsed
    if (!file?.buffer?.length) return res.status(400).json({ error: 'No file' })

    const mediaDir = path.join(process.cwd(), 'config', 'media')
    fs.mkdirSync(mediaDir, { recursive: true })
    const origExt = (file.filename?.split('.').pop() ?? 'bin').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 8)
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${origExt}`
    fs.writeFileSync(path.join(mediaDir, filename), file.buffer)

    const mime: string = file.mimetype ?? ''
    const mediaType = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'file'
    const url = `/api/comm/media/${filename}`

    this.logger.log(`Media upload: ${filename} (${mediaType}) from ${fields.senderName ?? 'unknown'}`)
    res.json({ url, mediaType, mediaName: file.filename ?? filename })
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
