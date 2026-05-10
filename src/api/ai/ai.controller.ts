import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StateMachineService } from '../../core/state-machine/state-machine.service';
import { ServiceRegistryService } from '../../core/service-registry/service-registry.service';
import { ContextService } from '../../core/context/context.service';

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
      data: { type: 'object', description: 'Optional service data like brightness, volume_level, etc.' },
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
  ) {}

  @Post('chat')
  @ApiOperation({ summary: 'AI chat — ask about your home or control devices' })
  async chat(@Body() body: { prompt: string }) {
    if (!body.prompt?.trim()) return { response: 'Please provide a prompt.' };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { response: 'AI not configured. Set ANTHROPIC_API_KEY in .env' };

    try {
      const allStates = this.stateMachine.getStates();
      const statesList = Array.from(allStates.entries())
        .map(([id, s]) => `${id}: ${s.state}${s.attributes?.friendly_name ? ` (${s.attributes.friendly_name})` : ''}`)
        .slice(0, 100).join('\n');

      // First call: ask AI
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: `You are a home automation assistant controlling a smart home.\n\nAvailable devices:\n${statesList}\n\nWhen the user asks to control multiple devices (e.g. "turn on all lights", "open every door"), call call_service once with entity_id as an array of all matching entities.\n\nDevice naming convention:\n- Lights: light.living_room, light.bedroom, light.kitchen, light.kitchen_light, light.dining_light, light.office_light\n- Switches: switch.fan, switch.tv\n- Binary sensors: binary_sensor.front_door, binary_sensor.back_door, binary_sensor.garage_door\n- Sensors: sensor.temperature, sensor.humidity\n- Media: media_player.living_room_speaker, media_player.bedroom_speaker`,
          messages: [{ role: 'user', content: body.prompt }],
          tools: [CALL_SERVICE_TOOL],
        }),
      });

      if (!res.ok) return { response: `AI error: ${res.status} ${await res.text()}` };

      const data = await res.json();
      const toolUse = data.content?.find((c: any) => c.type === 'tool_use');

      if (toolUse) {
        const { domain, service, entity_id, data: serviceData } = toolUse.input;
        const ids = Array.isArray(entity_id) ? entity_id : [entity_id];
        this.logger.log(`AI: ${domain}.${service} ${ids.join(', ')}`);

        let allFailed = true;
        for (const eid of ids) {
          let updated = false;
          try {
            await this.serviceRegistry.call({
              domain,
              service,
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
          return { response: 'Failed to control any devices. Check device names.' };
        }

        // Second call: AI confirms
        const res2 = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 256,
            system: 'Confirm what you did concisely.',
            messages: [
              { role: 'user', content: body.prompt },
              { role: 'assistant', content: data.content },
              { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'Done' }] },
            ],
          }),
        });

        if (res2.ok) {
          const d2 = await res2.json();
          return { response: d2.content[0].text, action: { domain, service, entity_id } };
        }
      }

      return { response: data.content?.[0]?.text ?? 'OK' };
    } catch (err: any) {
      this.logger.error(`AI error: ${err.message}`);
      return { response: `Error: ${err.message}` };
    }
  }
}
