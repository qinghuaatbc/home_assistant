#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const HA_URL = process.env.HA_URL || 'http://localhost:8123';
const HA_TOKEN = process.env.HA_TOKEN || '';

if (!HA_TOKEN) {
  console.error('HA_TOKEN environment variable required');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${HA_TOKEN}`,
  'Content-Type': 'application/json',
};

async function api(path, options) {
  const res = await fetch(`${HA_URL}${path}`, { headers, ...options });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

const server = new McpServer({ name: 'home-assistant-mcp', version: '1.0.0' });

server.tool(
  'get_states',
  'List all entity states (lights, switches, sensors, etc.)',
  {},
  async () => {
    const states = await api('/api/states');
    return {
      content: [{
        type: 'text',
        text: states.map((s) =>
          `${s.entity_id}: ${s.state}${s.attributes?.friendly_name ? ` (${s.attributes.friendly_name})` : ''}`
        ).join('\n'),
      }],
    };
  },
);

server.tool(
  'get_state',
  'Get state of a specific entity',
  { entity_id: z.string().describe('e.g. light.living_room') },
  async ({ entity_id }) => {
    const state = await api(`/api/states/${entity_id}`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ entity_id: state.entity_id, state: state.state, attributes: state.attributes }, null, 2),
      }],
    };
  },
);

server.tool(
  'call_service',
  'Call a Home Assistant service (turn on/off, set brightness, etc.)',
  {
    domain: z.string().describe('e.g. light, switch, sensor'),
    service: z.string().describe('e.g. turn_on, turn_off'),
    entity_id: z.string().describe('e.g. light.living_room'),
    data: z.any().optional().describe('Optional service data e.g. {"brightness": 200}'),
  },
  async ({ domain, service, entity_id, data }) => {
    await api(`/api/services/${domain}/${service}`, {
      method: 'POST',
      body: JSON.stringify({ entity_id, ...(data || {}) }),
    });
    return { content: [{ type: 'text', text: `Called ${domain}.${service} on ${entity_id}` }] };
  },
);

server.tool(
  'get_services',
  'List all available services by domain',
  {},
  async () => {
    const services = await api('/api/services');
    const lines = services.map((s) =>
      `${s.domain}: ${s.services.map((svc) => svc.service).join(', ')}`
    );
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

server.tool(
  'get_health',
  'Get Home Assistant server health and uptime',
  {},
  async () => {
    const health = await api('/api/health');
    return { content: [{ type: 'text', text: JSON.stringify(health, null, 2) }] };
  },
);

server.tool(
  'get_history',
  'Get sensor history data',
  {
    entity_id: z.string().describe('e.g. sensor.temperature'),
    hours: z.number().optional().default(24).describe('Hours of history (default: 24)'),
  },
  async ({ entity_id, hours }) => {
    const start = new Date(Date.now() - hours * 3600000).toISOString();
    const history = await api(`/api/history/period/${start}?filter_entity_id=${entity_id}`);
    const data = (history)[0] || [];
    const values = data.map((d) => `${d.last_changed.slice(11, 19)} ${d.state}`);
    return { content: [{ type: 'text', text: values.join('\n') || 'No history data' }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
