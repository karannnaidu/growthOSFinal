/**
 * Shopify MCP client wrapper.
 *
 * Shopify hosts an MCP server at `https://{shop}/api/mcp` that exposes
 * products/orders/customers as tools. We authenticate with the Admin access
 * token via `X-Shopify-Access-Token`.
 *
 * If Shopify's endpoint path or tool catalog changes, the caller wraps every
 * invocation in try/catch and returns `{ products: [] }` / `{ orders: [] }`
 * on failure, so skills degrade to the brand_data / CSV fallback rather
 * than crashing the request path.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export async function createShopifyMcpClient(opts: {
  shop: string;
  accessToken: string;
}): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(
    new URL(`https://${opts.shop}/api/mcp`),
    {
      requestInit: {
        headers: { 'X-Shopify-Access-Token': opts.accessToken },
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
