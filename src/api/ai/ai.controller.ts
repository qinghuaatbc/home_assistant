import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StateMachineService } from '../../core/state-machine/state-machine.service';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly stateMachine: StateMachineService) {}

  @Post('chat')
  @ApiOperation({ summary: 'AI chat — ask about your home or control devices' })
  async chat(@Body() body: { prompt: string }) {
    if (!body.prompt?.trim()) {
      return { response: 'Please provide a prompt.' };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        response: 'AI not configured. Set ANTHROPIC_API_KEY in .env to enable.',
        hint: 'Get a key at https://console.anthropic.com/',
      };
    }

    try {
      // Gather current HA state as context
      const allStates = this.stateMachine.getStates();
      const statesList = Array.from(allStates.entries())
        .map(([id, s]) => `${id}: ${s.state}${s.attributes?.friendly_name ? ` (${s.attributes.friendly_name})` : ''}`)
        .slice(0, 100) // limit context size
        .join('\n');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: `You are a helpful home automation assistant. The user's Home Assistant has these devices:\n\n${statesList}\n\nAnswer questions about device states and help control them. Be concise.`,
          messages: [{ role: 'user', content: body.prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        this.logger.error(`AI API error: ${err}`);
        return { response: `AI service error: ${response.status}` };
      }

      const data = await response.json();
      return { response: data.content[0].text };
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`AI chat error: ${error.message}`);
      return { response: `Error: ${error.message}` };
    }
  }
}
