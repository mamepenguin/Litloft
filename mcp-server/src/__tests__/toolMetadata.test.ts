import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLitloftServer } from "../server.js";
import { fakeClient } from "./testClient.js";

const expectedToolNames = [
  "add_comment",
  "add_to_playlist",
  "ask",
  "clip_pasted",
  "clip_url",
  "create_playlist",
  "get_file",
  "get_file_content",
  "get_transcript",
  "get_watch_history",
  "list_comments",
  "list_drives",
  "list_folders",
  "move_file",
  "rename_file",
  "restore_file",
  "search_files",
  "semantic_search",
  "trash_file",
  "update_file_content",
  "update_tags",
  "upload_file",
];

const readOnlyTools = new Set([
  "get_file",
  "get_file_content",
  "get_transcript",
  "get_watch_history",
  "list_comments",
  "list_drives",
  "list_folders",
  "search_files",
  "semantic_search",
]);

const destructiveTools = new Set([
  "move_file",
  "rename_file",
  "trash_file",
  "update_file_content",
  "update_tags",
]);

const idempotentTools = new Set([
  ...readOnlyTools,
  "move_file",
  "rename_file",
  "restore_file",
  "trash_file",
  "update_file_content",
  "update_tags",
]);

const openWorldTools = new Set(["ask", "clip_url"]);

let client: Client;
let tools: Tool[];

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const litloftClient = fakeClient(async () => ({}));
  const server = createLitloftServer(litloftClient);
  client = new Client({ name: "litloft-test", version: "1.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  tools = (await client.listTools()).tools;
});

afterAll(async () => {
  await client.close();
});

describe("advertised tool safety metadata", () => {
  it("lists the complete tool set with all four safety hints", () => {
    expect(tools.map((tool) => tool.name).sort()).toEqual(expectedToolNames);
    for (const tool of tools) {
      expect(tool.annotations, tool.name).toEqual({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        idempotentHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
      });
    }
  });

  it("advertises the exact read-only, destructive, idempotent, and open-world sets", () => {
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(
        readOnlyTools.has(tool.name)
      );
      expect(tool.annotations?.destructiveHint, tool.name).toBe(
        destructiveTools.has(tool.name)
      );
      expect(tool.annotations?.idempotentHint, tool.name).toBe(
        idempotentTools.has(tool.name)
      );
      expect(tool.annotations?.openWorldHint, tool.name).toBe(
        openWorldTools.has(tool.name)
      );
    }
  });

  it("discloses Ask's possible file-excerpt transfer to the configured LLM provider", () => {
    const ask = tools.find((tool) => tool.name === "ask");
    expect(ask?.description).toContain(
      "Retrieved file excerpts may be sent to the LLM provider configured in Litloft Intelligence."
    );
  });
});
