import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StateMachineService } from '../../core/state-machine/state-machine.service';
import { ServiceRegistryService } from '../../core/service-registry/service-registry.service';
import { ContextService } from '../../core/context/context.service';

const CALL_SERVICE_TOOL = {
  name: 'call_service',
  description: 'Call a Home Assistant service to control a device',
  input_schema: {
    type: 'object',
    properties: {
      domain: { type: 'string' },
      service: { type: 'string' },
      entity_id: { type: 'string' },
      data: { type: 'object' },
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
          system: `You are a home automation assistant.\nDevices:\n${statesList}\n\nUse the call_service tool to control devices when asked.`,
          messages: [{ role: 'user', content: body.prompt }],
          tools: [CALL_SERVICE_TOOL],
        }),
      });

      if (!res.ok) return { response: `AI error: ${res.status} ${await res.text()}` };

      const data = await res.json();
      const toolUse = data.content?.find((c: any) => c.type === 'tool_use');

      if (toolUse) {
        const { domain, service, entity_id, data: serviceData } = toolUse.input;
        this.logger.log(`AI: ${domain}.${service} ${entity_id}`);

        try {
          await this.serviceRegistry.call({
            domain,
            service,
            service_data: serviceData ?? {},
            target: { entity_id: [entity_id] },
            context: this.contextService.system(),
          });
        } catch (callErr: any) {
          this.logger.error(`AI service call failed: ${callErr.message}`);
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
