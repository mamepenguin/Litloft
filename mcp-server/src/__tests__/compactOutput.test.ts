import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createLitloftServer } from "../server.js";
import { textBlock, textResult } from "../tools/types.js";
import { fakeClient } from "./testClient.js";
import { FILE_ID, allRequests, findTool, run, schemaOf, type Fake } from "./toolHarness.js";

const NESTED = { a: 1, b: [1, { c: "x y", d: null }], e: { f: true } };

describe("compact JSON output (SPEC-CORE-015)", () => {
  it("SPEC-CORE-015 I9: textResult and textBlock carry JSON.stringify(value) with no indentation, and a string as is", () => {
    expect(textResult(NESTED).content[0]).toEqual({ type: "text", text: JSON.stringify(NESTED) });
    expect(textBlock(NESTED)).toEqual({ type: "text", text: JSON.stringify(NESTED) });
    expect(textResult([1, 2]).content[0].text).toBe("[1,2]");
    expect(textResult("line one\nline two").content[0].text).toBe("line one\nline two");
    expect(textBlock("line one\nline two").text).toBe("line one\nline two");
  });

  it.each([
    ["list_drives", {}],
    ["get_file", { file_id: FILE_ID }],
    ["list_folders", { drive: "media" }],
    ["list_comments", { file_id: FILE_ID }],
    ["get_watch_history", { drive: "media" }],
    ["rename_file", { file_id: FILE_ID, new_filename: "n.md" }],
    ["move_file", { file_id: FILE_ID, target_folder_path: "x" }],
    ["trash_file", { file_id: FILE_ID }],
    ["update_tags", { file_id: FILE_ID, tags: ["a"] }],
  ])("SPEC-CORE-015 I9: %s returns the API value as compact JSON", async (name, args) => {
    const client = fakeClient(async () => NESTED);
    const out = await run(name, args, client);
    expect(out.text).toBe(JSON.stringify(NESTED));
  });

  it("SPEC-CORE-015 I9: get_video_frame's text block is compact JSON", async () => {
    const client = fakeClient(
      async () => ({ id: FILE_ID, mime_type: "video/mp4", duration: 100 }),
      undefined,
      undefined,
      undefined,
      async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" })
    );
    const result = await findTool("get_video_frame").handler(
      { drive: "media", file_id: FILE_ID, t: 1 } as never,
      client
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toBe(JSON.stringify(JSON.parse(text)));
  });
});

describe("search_files fields (SPEC-CORE-015)", () => {
  const SUMMARY_KEYS = [
    "id",
    "filename",
    "title",
    "folder_path",
    "file_type",
    "mime_type",
    "file_size",
    "duration",
    "tags",
    "created_at",
    "updated_at",
    "match_source",
  ];
  const fullItem = {
    id: FILE_ID,
    drive: "media",
    filename: "a.mp4",
    title: null,
    file_path: "v/a.mp4",
    folder_path: "v",
    file_type: "video",
    mime_type: "video/mp4",
    file_size: 123,
    duration: 9.5,
    width: 1920,
    height: 1080,
    thumbnail_path: "thumbs/x.jpg",
    tags: ["t"],
    hash: "deadbeef",
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-02T00:00:00",
    match_source: "filename",
  };
  // An item without match_source, title or duration: the summary must not invent them.
  const sparseItem = {
    id: "def123456789",
    drive: "media",
    filename: "b.md",
    file_path: "b.md",
    folder_path: "",
    file_type: "text",
    mime_type: "text/markdown",
    file_size: 5,
    tags: [],
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
    thumbnail_path: null,
  };
  const meta = { total: 2, page: 1, limit: 50, extra: { nested: true } };
  const apiResponse = { data: [fullItem, sparseItem], meta };

  function pick(item: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(item).filter(([k]) => SUMMARY_KEYS.includes(k)));
  }

  it("SPEC-CORE-015 I10: by default each item keeps exactly the summary keys the API sent, and meta is unchanged", async () => {
    const client = fakeClient(async () => apiResponse);
    const out = await run("search_files", { drive: "media", search: "a" }, client);
    expect(client.calls[0].options).toEqual({ query: { search: "a" } });
    const parsed = JSON.parse(out.text);
    expect(parsed.meta).toEqual(meta);
    expect(parsed.data).toEqual([pick(fullItem), pick(sparseItem)]);
    expect(Object.keys(parsed.data[0]).sort()).toEqual([...SUMMARY_KEYS].sort());
    expect(Object.keys(parsed.data[1])).not.toContain("match_source");
    expect(Object.keys(parsed.data[1])).not.toContain("title");
    expect(Object.keys(parsed.data[1])).not.toContain("duration");
    expect(parsed.data[0].title).toBeNull();
  });

  it("SPEC-CORE-015 I10: fields 'summary' gives the same shape as the default", async () => {
    const client = fakeClient(async () => apiResponse);
    const out = await run("search_files", { drive: "media", fields: "summary" }, client);
    expect(JSON.parse(out.text).data).toEqual([pick(fullItem), pick(sparseItem)]);
  });

  it("SPEC-CORE-015 I10: fields 'full' returns the API response unchanged", async () => {
    const client = fakeClient(async () => apiResponse);
    const out = await run("search_files", { drive: "media", fields: "full" }, client);
    expect(out.text).toBe(JSON.stringify(apiResponse));
  });

  it.each([{ fields: "summary" }, { fields: "full" }])(
    "SPEC-CORE-015 I10: fields is never sent to the API (%o)",
    async (fields) => {
      const client = fakeClient(async () => apiResponse);
      await run("search_files", { drive: "media", search: "cats", limit: 10, ...fields }, client);
      expect(client.calls).toEqual([
        {
          method: "GET",
          path: "/api/drives/media/files",
          options: { query: { search: "cats", limit: 10 } },
        },
      ]);
    }
  );

  it("SPEC-CORE-015: the schema takes fields only as 'summary' or 'full'", () => {
    const schema = schemaOf("search_files");
    expect(schema.safeParse({ drive: "media", fields: "summary" }).success).toBe(true);
    expect(schema.safeParse({ drive: "media", fields: "full" }).success).toBe(true);
    expect(schema.safeParse({ drive: "media", fields: "all" }).success).toBe(false);
  });
});

describe("argument validation over MCP (SPEC-CORE-014)", () => {
  async function callOverMcp(fake: Fake, name: string, args: Record<string, unknown>) {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createLitloftServer(fake);
    const client = new Client({ name: "litloft-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const listed = (await client.listTools()).tools.some((t) => t.name === name);
      expect(listed, `${name} is registered`).toBe(true);
      try {
        return await client.callTool({ name, arguments: args });
      } catch (error) {
        return { rejected: error };
      }
    } finally {
      await client.close();
    }
  }

  it.each([
    ["trash_files", { file_ids: [] }],
    ["restore_files", { file_ids: ["short"] }],
    ["add_tags", { file_ids: ["abc123456789"], tags: [] }],
  ])("SPEC-CORE-014 I7: %s with %o is rejected before any request", async (name, args) => {
    const fake = fakeClient(async () => ({ count: 0, errors: [] }));
    const result = (await callOverMcp(fake, name, args)) as { isError?: boolean; rejected?: unknown };
    expect(result.rejected !== undefined || result.isError === true).toBe(true);
    expect(allRequests(fake)).toEqual([]);
  });

  it("SPEC-CORE-014: the same tool with valid arguments does reach the API over MCP", async () => {
    const fake = fakeClient(async () => ({ count: 1, errors: [] }));
    const result = (await callOverMcp(fake, "trash_files", { file_ids: ["abc123456789"] })) as {
      isError?: boolean;
    };
    expect(result.isError).not.toBe(true);
    expect(allRequests(fake)).toEqual([{ method: "POST", path: "/api/files/batch/delete" }]);
  });
});
