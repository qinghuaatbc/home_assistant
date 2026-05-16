import { Controller, Post, Get, Body, Logger, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StateMachineService } from '../../core/state-machine/state-machine.service';
import { ServiceRegistryService } from '../../core/service-registry/service-registry.service';
import { ContextService } from '../../core/context/context.service';
import { VoiceLogService } from '../../voice-log/voice-log.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

const CALL_SERVICE_TOOL = {
  name: 'call_service',
  description: 'Call a Home Assistant service to control one or more devices. Use this when the user asks to control specific devices or all devices of a type (e.g. "all lights", "turn on everything", "open all doors").',
  input_schema: {
    type: 'object',
    properties: {
      domain: { type: 'string', description: 'e.g. light, switch, binary_sensor, media_player' },
      service: { type: 'string', description: 'e.g. turn_on, turn_off, toggle' },
      entity_id: {
        oneOf: [
          { type: 'string', description: 'Single entity like light.living_room' },
          { type: 'array', items: { type: 'string' }, description: 'Multiple entities like ["light.living_room","light.bedroom"]' },
        ],
      },
      data: {
        type: 'object',
        description: 'Optional service data. For lights use brightness_pct (0-100, a percentage). For media_player use volume_level (0.0-1.0).',
        properties: {
          brightness_pct: { type: 'number', description: 'Light brightness 0-100 percent' },
          volume_level: { type: 'number', description: 'Volume 0.0 to 1.0' },
        },
      },
    },
    required: ['domain', 'service', 'entity_id'],
  },
};

@ApiTags('ai')
@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly contextService: ContextService,
    private readonly voiceLog: VoiceLogService,
  ) {}

  @Get('voice/history')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get voice command history' })
  async voiceHistory() {
    return this.voiceLog.getHistory();
  }

  @Post('suggest-automations')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Ask Claude to suggest automations based on current devices' })
  async suggestAutomations() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { suggestions: [] };

    const states = this.stateMachine.getStates();
    const deviceList = states
      .map(s => `${s.entity_id} [${s.state}]${s.attributes?.friendly_name ? ` (${s.attributes.friendly_name})` : ''}`)
      .slice(0, 80)
      .join('\n');

    const prompt = `You are a Home Assistant expert. Based on these devices, suggest 5 useful automations.

Devices:
${deviceList}

Return ONLY valid JSON — an array of exactly 5 objects, each with:
- "name": short human-readable name (≤40 chars)
- "description": one sentence explaining what it does and why it's useful
- "yaml": complete Home Assistant YAML automation snippet (valid YAML, use 2-space indent)

JSON only, no markdown, no explanation outside the array.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) return { suggestions: [] };
      const data: any = await res.json();
      const text = data.content?.[0]?.text ?? '[]';
      // Strip any accidental markdown code fences
      const clean = text.replace(/```[a-z]*\n?/g, '').trim();
      const suggestions = JSON.parse(clean);
      return { suggestions: Array.isArray(suggestions) ? suggestions : [] };
    } catch (err: any) {
      this.logger.error(`suggest-automations error: ${err.message}`);
      return { suggestions: [] };
    }
  }

  private t(lang: string) {
    return (zh: string, en: string, fa: string) =>
      lang === 'zh' ? zh : lang === 'fa' ? fa : en;
  }

  @Post('chat')
  @ApiOperation({ summary: 'AI chat — ask about your home or control devices' })
  async chat(@Body() body: { prompt: string; lang?: string }) {
    const lang = body.lang || 'en';
    if (!body.prompt?.trim()) return { response: this.t(lang)('请输入提示内容', 'Please provide a prompt.', 'لطفاً یک پیام وارد کنید') };
    if (body.prompt.length > 4000) return { response: this.t(lang)('输入内容过长', 'Prompt too long (max 4000 chars)', 'پیام بیش از حد طولانی است') };
    const result = await this.processWithClaude(body.prompt, lang);
    await this.voiceLog.log(body.prompt, result.response, lang, result.action);
    return result;
  }

  @Post('voice')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Voice input — transcribe audio + AI response' })
  async voice(@UploadedFile() file: any, @Body() body: { lang?: string }) {
    const lang = body.lang || 'en';
    if (!file?.buffer) return { response: this.t(lang)('未收到音频', 'No audio received', 'صدایی دریافت نشد') };

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) return { response: this.t(lang)('语音识别未配置，请在 .env 中设置 OPENAI_API_KEY', 'Voice not configured. Set OPENAI_API_KEY in .env', 'تشخیص صدا پیکربندی نشده') };

    try {
      this.logger.log(`Processing voice: ${file.size}b ${file.mimetype}`);

      const whisperLang = lang === 'zh' ? 'zh' : lang === 'fa' ? 'fa' : 'en';
      const ext = file.originalname?.split('.').pop() || 'webm';
      const formData = new FormData();
      formData.append('model', 'whisper-1');
      formData.append('file', new Blob([file.buffer], { type: file.mimetype }), `audio.${ext}`);
      formData.append('response_format', 'json');
      formData.append('language', whisperLang);

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openAiKey}` },
        body: formData,
      });

      if (!whisperRes.ok) {
        const errText = await whisperRes.text();
        this.logger.error(`Whisper error: ${whisperRes.status} ${errText}`);
        return { response: this.t(lang)('语音识别失败：OpenAI 配额不足，请检查账户余额', 'Voice recognition failed: OpenAI quota exceeded', 'تشخیص صدا ناموفق: سهمیه OpenAI تمام شده') };
      }

      const whisperData: any = await whisperRes.json();
      const raw = (whisperData.text || '').trim();
      if (!raw) return { response: this.t(lang)('未能识别语音', 'Could not recognize speech', 'امکان تشخیص صدا وجود نداشت') };

      // Strip leading wake-words (Hello / Hi / Hey / Please / 你好 / 嗨 / سلام)
      const text = raw.replace(/^(hello|hi|hey|please|okay|ok|yo|你好|嗨|哈喽|سلام|لطفاً)[,،.،\s]*/gi, '').trim() || raw;

      this.logger.log(`Transcribed: "${raw}" → "${text}"`);
      const result = await this.processWithClaude(text, lang);
      await this.voiceLog.log(text, result.response, lang, result.action);
      return result;
    } catch (err: any) {
      this.logger.error(`Voice error: ${err.message}`);
      return { response: this.t(lang)('语音处理错误', `Voice error: ${err.message}`, `خطای صدا: ${err.message}`) };
    }
  }

  private async processWithClaude(prompt: string, lang: string): Promise<any> {
    const _t = this.t(lang);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { text: prompt, response: _t('AI 未配置，请在 .env 中设置 ANTHROPIC_API_KEY', 'AI not configured. Set ANTHROPIC_API_KEY in .env', 'AI پیکربندی نشده') };

    const langInstruction = lang === 'zh'
      ? '请用中文回复。\n控制规则："开灯"=打开所有灯，"关灯"=关闭所有灯，"开客厅灯"=只开客厅灯。批量操作一次控制所有匹配设备。\n设备对照：客厅灯=light.demo_living_room, 卧室灯=light.demo_bedroom, 厨房灯=light.demo_kitchen, 餐厅灯=light.demo_dining_light, 办公室灯=light.demo_office_light, 厨房吊灯=light.demo_kitchen_light。\n"开门"=binary_sensor.turn_on front_door, "关门"=binary_sensor.turn_off front_door, "开窗帘"=cover.open_cover demo_living_room_curtain, "关窗帘"=cover.close_cover demo_living_room_curtain, "开车库门"=cover.open_cover demo_garage_door, "关车库门"=cover.close_cover demo_garage_door。'
      : lang === 'fa'
      ? 'لطفاً به فارسی پاسخ دهید. اگر کاربر گفت "همه چراغ‌ها را روشن کن"، همه چراغ‌ها را یکجا کنترل کنید.'
      : 'Respond in English. When the user asks to control multiple devices, call call_service once with entity_id as an array of all matching entities.\n"open the garage" → cover.open_cover cover.demo_garage_door, "close the garage" → cover.close_cover cover.demo_garage_door, "open the curtains" → cover.open_cover cover.demo_living_room_curtain, "close the curtains" → cover.close_cover cover.demo_living_room_curtain.';

    try {
      const allStates = this.stateMachine.getStates();
      const statesList = allStates
        .map(s => `${s.entity_id}: ${s.state}${s.attributes?.friendly_name ? ` (${s.attributes.friendly_name})` : ''}`)
        .slice(0, 100).join('\n');

      const examples: string[] = [];
      const byDomain: Record<string, string[]> = {};
      for (const s of allStates) {
        const domain = s.entity_id.split('.')[0];
        if (!byDomain[domain]) byDomain[domain] = [];
        if (byDomain[domain].length < 3) byDomain[domain].push(s.entity_id);
      }
      for (const [domain, ids] of Object.entries(byDomain)) {
        if (ids.length > 0) examples.push(`- ${domain}: ${ids.join(', ')}`);
      }
      const namingExamples = examples.join('\n');

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: `You are a home automation assistant controlling a smart home.\n\n${langInstruction}\n\nAvailable devices:\n${statesList}\n\nDevice naming convention (examples):\n${namingExamples}`,
          messages: [{ role: 'user', content: prompt }],
          tools: [CALL_SERVICE_TOOL],
        }),
      });

      if (!res.ok) return { text: prompt, response: _t('AI 错误', `AI error: ${res.status}`, `خطای AI: ${res.status}`) };

      const data = await res.json();
      const toolUse = data.content?.find((c: any) => c.type === 'tool_use');

      if (toolUse) {
        const { domain, service, entity_id, data: rawData } = toolUse.input;
        // Convert brightness_pct (0-100) → brightness (0-255)
        const serviceData = rawData ? { ...rawData } : undefined;
        if (serviceData?.brightness_pct != null) {
          serviceData.brightness = Math.round(Number(serviceData.brightness_pct) / 100 * 255);
          delete serviceData.brightness_pct;
        }
        const ids = Array.isArray(entity_id) ? entity_id : [entity_id];
        this.logger.log(`AI: ${domain}.${service} ${ids.join(', ')} data=${JSON.stringify(serviceData)}`);

        let allFailed = true;
        for (const eid of ids) {
          let updated = false;
          try {
            await this.serviceRegistry.call({
              domain, service,
              service_data: serviceData ?? {},
              target: { entity_id: [eid] },
              context: this.contextService.system(),
            });
            updated = true;
          } catch (callErr: any) {
            this.logger.warn(`AI service call failed for ${eid}: ${callErr.message}`);
          }
          if (!updated) {
            const isOn = service === 'turn_on';
            try {
              this.stateMachine.setState(eid, isOn ? 'on' : 'off', {}, this.contextService.system());
              updated = true;
            } catch (setErr: any) {
              this.logger.error(`AI force state failed for ${eid}: ${setErr.message}`);
            }
          }
          if (updated) allFailed = false;
        }

        if (allFailed) {
          return { text: prompt, response: _t('无法控制任何设备，请检查设备名称。', 'Failed to control any devices. Check device names.', 'کنترل هیچ دستگاهی ممکن نشد. نام دستگاه‌ها را بررسی کنید.') };
        }

        const doneMsg = lang === 'zh' ? '完成' : lang === 'fa' ? 'انجام شد' : 'Done'
        return { text: prompt, response: doneMsg, action: { domain, service, entity_id } };
      }

      return { text: prompt, response: data.content?.[0]?.text ?? 'OK' };
    } catch (err: any) {
      this.logger.error(`AI error: ${err.message}`);
      return { text: prompt, response: _t('AI 错误', `Error: ${err.message}`, `خطا: ${err.message}`) };
    }
  }
}
