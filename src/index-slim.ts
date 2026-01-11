import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spotifyPlayback } from './playback.js';
import { spotifyLibrary } from './library.js';
import { spotifyInfo } from './info.js';

const server = new McpServer({
  name: 'spotify-slim',
  version: '2.0.0',
});

// 3 consolidated tools instead of 20+
const tools = [spotifyPlayback, spotifyLibrary, spotifyInfo];

tools.forEach((tool) => {
  server.tool(tool.name, tool.description, tool.schema, tool.handler);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
