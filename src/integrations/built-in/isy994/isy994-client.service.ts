import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as xml2js from 'xml2js';

export interface IsyNode {
  /** Insteon address e.g. "1A 2B 3C 1" */
  address: string;
  /** Human-readable name from the ISY */
  name: string;
  /**
   * Type string "category.subcategory.version.extra"
   * e.g. "1.32.65.0" = Dimmable Lighting, subcategory 32
   */
  type: string;
  /** Primary node flag (128 = primary node) */
  flag: number;
  /** Whether the node is enabled */
  enabled: boolean;
  /** Insteon type category (first number of type field) */
  category: number;
}

export interface IsyNodeStatus {
  address: string;
  /** ST value 0-255, or null if unavailable */
  value: number | null;
  formatted: string;
}

/** Shape of each node entry under `nodes:` in configuration.yaml (mock mode) */
export interface MockNodeConfig {
  address: string;
  name: string;
  /** Insteon type string, e.g. "1.32.65.0". First segment is the category. Defaults to "2.0.0.0" (switch). */
  type?: string;
  /** Initial ST value 0–255. Defaults to 0 (off). */
  value?: number;
}

/**
 * HTTP client for the ISY994 REST API.
 *
 * Authentication: HTTP Basic Auth (username:password).
 * All responses are XML; this service parses them to plain objects.
 *
 * API base: http://<host>:<port>/rest
 */
@Injectable()
export class Isy994ClientService {
  private readonly logger = new Logger(Isy994ClientService.name);
  private readonly parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
  private http: AxiosInstance | null = null;
  private baseUrl = '';
  private mockMode = false;
  private mockNodes: IsyNode[] = [];
  private mockStatuses = new Map<string, { value: number | null; formatted: string }>();

  /**
   * Configure the client. Must be called before any other method.
   * Pass mock=true (or host='mock') together with mockNodes to use config-driven sample data.
   */
  configure(
    host: string,
    port: number,
    username: string,
    password: string,
    tls = false,
    mock = false,
    mockNodeConfigs: MockNodeConfig[] = [],
  ): void {
    if (mock || host === 'mock') {
      this.mockMode = true;
      this.mockNodes = mockNodeConfigs.map((n) => {
        const type = n.type ?? '2.0.0.0';
        const category = parseInt(type.split('.')[0], 10);
        return {
          address: n.address,
          name: n.name,
          type,
          flag: 128,
          enabled: true,
          category,
        } satisfies IsyNode;
      });
      this.mockStatuses = new Map(
        mockNodeConfigs.map((n) => [
          n.address,
          { value: n.value ?? 0, formatted: String(n.value ?? 0) },
        ]),
      );
      this.logger.log(
        `ISY994 client running in MOCK mode with ${this.mockNodes.length} configured nodes`,
      );
      return;
    }

    const scheme = tls ? 'https' : 'http';
    this.baseUrl = `${scheme}://${host}:${port}/rest`;

    this.http = axios.create({
      baseURL: this.baseUrl,
      auth: { username, password },
      headers: { Accept: 'text/xml' },
      timeout: 10000,
      // Allow self-signed certs on local network
      httpsAgent: tls
        ? new (require('https').Agent)({ rejectUnauthorized: false })
        : undefined,
    });

    this.logger.log(`ISY994 client configured: ${this.baseUrl}`);
  }

  /**
   * Test connectivity to the ISY994.
   * Returns true if the controller responds successfully.
   */
  async ping(): Promise<boolean> {
    if (this.mockMode) return true;
    try {
      await this.http!.get('/config');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch all nodes from GET /rest/nodes.
   * Returns only primary Insteon nodes (flag & 128).
   */
  async getNodes(): Promise<IsyNode[]> {
    if (this.mockMode) return this.mockNodes;
    const xml = await this.get('/nodes');
    const parsed = await this.parseXml(xml);

    const nodes = parsed?.nodes as Record<string, unknown> | undefined;
    const nodeList = nodes?.['node'];
    if (!nodeList) return [];

    const raw = Array.isArray(nodeList) ? nodeList : [nodeList];

    return raw
      .filter((n: Record<string, unknown>) => {
        const attrs = n['$'] as Record<string, string> | undefined;
        const flag = parseInt(attrs?.flag ?? '0', 10);
        // Primary nodes have bit 7 set (flag & 128 !== 0)
        return (flag & 128) !== 0;
      })
      .map((n: Record<string, unknown>) => {
        const type: string = (n['type'] as string) ?? '0.0.0.0';
        const category = parseInt(type.split('.')[0], 10);
        return {
          address: (n['address'] as string) ?? '',
          name: (n['name'] as string) ?? 'Unknown',
          type,
          flag: parseInt(((n['$'] as Record<string, string>)?.flag ?? '0'), 10),
          enabled: (n['enabled'] as string) !== 'false',
          category,
        } satisfies IsyNode;
      })
      .filter((n) => n.address && n.enabled);
  }

  /**
   * Fetch current status of all nodes from GET /rest/status.
   */
  async getAllStatuses(): Promise<Map<string, IsyNodeStatus>> {
    if (this.mockMode) {
      const result = new Map<string, IsyNodeStatus>();
      for (const [address, s] of this.mockStatuses) {
        result.set(address, { address, value: s.value, formatted: s.formatted });
      }
      return result;
    }

    const xml = await this.get('/status');
    const parsed = await this.parseXml(xml);

    const result = new Map<string, IsyNodeStatus>();
    const statusNodes = parsed?.nodes as Record<string, unknown> | undefined;
    const nodeList = statusNodes?.['node'];
    if (!nodeList) return result;

    const raw = Array.isArray(nodeList) ? nodeList : [nodeList];

    for (const n of raw) {
      const attrs = n['$'] as Record<string, string>;
      const address = attrs?.id ?? '';
      if (!address) continue;

      const prop = n['property'];
      if (!prop) {
        result.set(address, { address, value: null, formatted: 'unknown' });
        continue;
      }

      // May be multiple properties; find ST (status)
      const props = Array.isArray(prop) ? prop : [prop];
      const stProp = props.find(
        (p: Record<string, unknown>) => ((p['$'] as Record<string, string>)?.id) === 'ST',
      );

      if (stProp) {
        const propAttrs = stProp['$'] as Record<string, string>;
        const raw = propAttrs?.value;
        result.set(address, {
          address,
          value: raw !== undefined && raw !== '' ? parseInt(raw, 10) : null,
          formatted: propAttrs?.formatted ?? '',
        });
      }
    }

    return result;
  }

  /**
   * Send a command to a node.
   * GET /rest/nodes/<encoded-address>/cmd/<command>[/<level>]
   */
  async sendCommand(address: string, command: string, level?: number): Promise<void> {
    if (this.mockMode) {
      this.logger.debug(`ISY mock cmd: ${address} → ${command}${level !== undefined ? ` ${level}` : ''}`);
      return;
    }
    // ISY addresses contain spaces — encode as URL path segments
    const encodedAddr = encodeURIComponent(address).replace(/%20/g, '%20');
    const path = level !== undefined
      ? `/nodes/${encodedAddr}/cmd/${command}/${level}`
      : `/nodes/${encodedAddr}/cmd/${command}`;

    await this.get(path);
    this.logger.debug(`ISY cmd: ${address} → ${command}${level !== undefined ? ` ${level}` : ''}`);
  }

  /**
   * Query a single node's current status.
   */
  async getNodeStatus(address: string): Promise<IsyNodeStatus | null> {
    try {
      const encodedAddr = encodeURIComponent(address).replace(/%20/g, '%20');
      const xml = await this.get(`/nodes/${encodedAddr}/properties`);
      const parsed = await this.parseXml(xml);

      const propsContainer = parsed?.properties as Record<string, unknown> | undefined;
      const props = propsContainer?.['property'];
      if (!props) return null;

      const propList = Array.isArray(props) ? props : [props];
      const st = propList.find(
        (p: Record<string, unknown>) => ((p['$'] as Record<string, string>)?.id) === 'ST',
      );

      if (!st) return null;

      const attrs = st['$'] as Record<string, string>;
      const raw = attrs?.value;
      return {
        address,
        value: raw !== undefined && raw !== '' ? parseInt(raw, 10) : null,
        formatted: attrs?.formatted ?? '',
      };
    } catch {
      return null;
    }
  }

  /** Build the WebSocket URL for subscription events */
  getWebSocketUrl(username: string, password: string, host: string, port: number, tls: boolean): string {
    const scheme = tls ? 'wss' : 'ws';
    return `${scheme}://${username}:${password}@${host}:${port}/rest/subscribe`;
  }

  private async get(path: string): Promise<string> {
    const response = await this.http!.get<string>(path, { responseType: 'text' });
    return response.data;
  }

  private parseXml(xml: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      this.parser.parseString(xml, (err: Error | null, result: unknown) => {
        if (err) reject(err);
        else resolve(result as Record<string, unknown>);
      });
    });
  }
}
