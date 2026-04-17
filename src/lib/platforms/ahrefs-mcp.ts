/**
 * Ahrefs MCP client wrapper.
 *
 * Ahrefs hosts a remote MCP server at `https://mcp.ahrefs.com/` and uses
 * `Authorization: Bearer <api-key>` auth. Tool catalog / names may drift —
 * callers wrap in try/catch and fall back to empty data.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export async function createAhrefsMcpClient(apiKey: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(
    new URL('https://mcp.ahrefs.com/'),
    {
      requestInit: {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    },
  );
  const client = new Client(
    { name: 'growth-os', version: '1.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}
