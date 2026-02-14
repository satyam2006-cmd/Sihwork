import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { toolRegistry } from './tool-registry';

import { config } from 'dotenv';
config({ path: '.env.local' });

const server = new McpServer({
  name: 'second-opinion-ai',
  version: '1.0.0',
});

// Register all tools from the registry
for (const entry of toolRegistry) {
  server.tool(
    entry.definition.name,
    entry.definition.description,
    entry.definition.inputSchema as Record<string, unknown>,
    async (params) => {
      try {
        const result = await entry.handler(params as Record<string, unknown>);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Second Opinion AI MCP server running on stdio');
}

main().catch(console.error);
