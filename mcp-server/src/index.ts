#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLitloftClient } from "./client.js";
import { createLitloftServer } from "./server.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required (set it in the MCP client's env config for this server)`
    );
  }
  return value;
}

function main() {
  const baseUrl = requireEnv("LITLOFT_BASE_URL");
  const token = requireEnv("LITLOFT_API_TOKEN");
  const viewer = process.env.LITLOFT_VIEWER;
  const client = createLitloftClient({ baseUrl, token, viewer });

  const server = createLitloftServer(client);
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    console.error("Failed to start Litloft MCP server:", err);
    process.exit(1);
  });
}

main();
