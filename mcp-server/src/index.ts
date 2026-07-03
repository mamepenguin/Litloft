#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLitloftClient } from "./client.js";
import { allTools } from "./tools/index.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required (set it in the MCP client's env config for this server)`
    );
  }
  return value;
}

// This is the agent-facing manual for the server as a whole: it goes into
// the MCP `initialize` response and is what an MCP client injects into the
// model's context, before any tool has been called. Cross-cutting facts
// that don't belong to one specific tool's description live here instead
// of being repeated (or omitted) across tools. Per-tool usage notes
// (required args, ETag/conflict behavior, etc.) stay on each tool's own
// `description`, not here.
const SERVER_INSTRUCTIONS = `
Litloft is a personal home-LAN media and file library (videos, images,
documents, markdown notes). This server exposes the same operations the
Litloft web UI has, nothing more.

Key concepts:
- A "drive" is a top-level library (e.g. a mounted folder) and is a hard
  security boundary: there is no cross-drive search or listing. Most tools
  take a \`drive\` argument; call list_drives first if you don't already
  know the drive name.
- A "file_id" is a 12-character id (from search_files or get_file results),
  not a filesystem path.
- Deleting a file only ever moves it to trash (trash_file), recoverable for
  30 days via restore_file. There is no permanent-delete tool.
- To edit a text/markdown file's content: call get_file_content first to
  get the current text and its ETag, then pass that ETag to
  update_file_content. If the write is rejected as a conflict, the file
  changed since you last read it — call get_file_content again and retry.
- search_files only matches filenames/folder paths. For "find files about
  X" style queries, prefer semantic_search, which ranks by transcript/
  caption/embedding relevance and returns the matching excerpt.
- There is no built-in "ask a question, get a synthesized answer" tool,
  but you can build the same result yourself: call semantic_search to
  find relevant files and the time range each match came from, then call
  get_transcript with that time range to read the exact surrounding
  context before answering — this avoids pulling a whole transcript into
  context when only one part of it is relevant.
- upload_file is for small notes/documents/images only (10MB cap on
  base64-decoded content) — not for large video files.
- Not every operation the web UI has is available here yet: there is no
  tool for posting comments.
`.trim();

function main() {
  const baseUrl = requireEnv("LITLOFT_BASE_URL");
  const token = requireEnv("LITLOFT_API_TOKEN");
  const client = createLitloftClient({ baseUrl, token });

  const server = new McpServer(
    { name: "litloft", version: "0.1.0" },
    { instructions: SERVER_INSTRUCTIONS }
  );

  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      (args) => tool.handler(args, client)
    );
  }

  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    console.error("Failed to start Litloft MCP server:", err);
    process.exit(1);
  });
}

main();
