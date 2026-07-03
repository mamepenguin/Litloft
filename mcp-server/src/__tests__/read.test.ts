import { describe, expect, it } from "vitest";
import { fakeClient } from "./testClient.js";
import { readTools } from "../tools/read.js";

function findTool(name: string) {
  const tool = readTools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

describe("list_drives", () => {
  it("calls GET /api/drives", async () => {
    const client = fakeClient(async () => [{ name: "media" }]);
    const result = await findTool("list_drives").handler({}, client);
    expect(client.calls).toEqual([{ method: "GET", path: "/api/drives", options: undefined }]);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("media");
  });
});

describe("search_files", () => {
  it("calls GET /api/drives/{drive}/files with the remaining args as query", async () => {
    const client = fakeClient(async () => ({ data: [], meta: {} }));
    await findTool("search_files").handler(
      { drive: "media", search: "cats", limit: 10 },
      client
    );
    expect(client.calls).toEqual([
      {
        method: "GET",
        path: "/api/drives/media/files",
        options: { query: { search: "cats", limit: 10 } },
      },
    ]);
  });

  it("URL-encodes the drive name in the path", async () => {
    const client = fakeClient(async () => ({ data: [], meta: {} }));
    await findTool("search_files").handler({ drive: "my drive" }, client);
    expect(client.calls[0].path).toBe("/api/drives/my%20drive/files");
  });
});

describe("list_folders", () => {
  it("calls GET /api/drives/{drive}/folders with no query when path is omitted", async () => {
    const client = fakeClient(async () => []);
    await findTool("list_folders").handler({ drive: "media" }, client);
    expect(client.calls).toEqual([
      { method: "GET", path: "/api/drives/media/folders", options: { query: undefined } },
    ]);
  });

  it("passes path as a query param when given", async () => {
    const client = fakeClient(async () => []);
    await findTool("list_folders").handler({ drive: "media", path: "notes/2026" }, client);
    expect(client.calls).toEqual([
      {
        method: "GET",
        path: "/api/drives/media/folders",
        options: { query: { path: "notes/2026" } },
      },
    ]);
  });
});

describe("get_file", () => {
  it("calls GET /api/files/{file_id}", async () => {
    const client = fakeClient(async () => ({ id: "abc123456789" }));
    await findTool("get_file").handler({ file_id: "abc123456789" }, client);
    expect(client.calls).toEqual([
      { method: "GET", path: "/api/files/abc123456789", options: undefined },
    ]);
  });
});

describe("get_file_content", () => {
  it("fetches metadata, then streams body + ETag for a text/markdown file", async () => {
    const client = fakeClient(
      async () => ({ mime_type: "text/markdown", file_size: 10 }),
      async () => ({
        status: 200,
        headers: new Headers({ ETag: '"abc"' }),
        text: "# hello",
      })
    );
    const result = await findTool("get_file_content").handler(
      { file_id: "abc123456789" },
      client
    );
    expect(client.calls).toEqual([
      { method: "GET", path: "/api/files/abc123456789", options: undefined },
    ]);
    expect(client.rawCalls).toEqual([
      { method: "GET", path: "/api/files/abc123456789/stream", options: undefined },
    ]);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual({ content: "# hello", etag: '"abc"' });
    expect(result.isError).toBeUndefined();
  });

  it("refuses to stream a text/markdown file over the size cap without calling requestRaw", async () => {
    const client = fakeClient(async () => ({
      mime_type: "text/markdown",
      file_size: 5 * 1024 * 1024,
    }));
    const result = await findTool("get_file_content").handler(
      { file_id: "abc123456789" },
      client
    );
    expect(client.rawCalls).toEqual([]);
    expect(result.content[0].text).toContain("5242880");
  });

  it("refuses to stream a non-text mime without calling requestRaw", async () => {
    const client = fakeClient(async () => ({ mime_type: "video/mp4", file_size: 999999 }));
    const result = await findTool("get_file_content").handler(
      { file_id: "abc123456789" },
      client
    );
    expect(client.rawCalls).toEqual([]);
    expect(result.content[0].text).toContain("video/mp4");
  });
});

describe("get_watch_history", () => {
  it("calls GET /api/drives/{drive}/watch-history with query args", async () => {
    const client = fakeClient(async () => ({ data: [] }));
    await findTool("get_watch_history").handler(
      { drive: "media", filter: "unfinished" },
      client
    );
    expect(client.calls).toEqual([
      {
        method: "GET",
        path: "/api/drives/media/watch-history",
        options: { query: { filter: "unfinished" } },
      },
    ]);
  });
});

describe("semantic_search", () => {
  it("calls GET /api/addons/intelligence/search with q as query and drive as X-Lit-Drive header", async () => {
    const client = fakeClient(async () => ({ results: [], total: 0 }));
    await findTool("semantic_search").handler(
      { drive: "media", q: "japan trip" },
      client
    );
    expect(client.calls).toEqual([
      {
        method: "GET",
        path: "/api/addons/intelligence/search",
        options: {
          query: { q: "japan trip" },
          headers: { "X-Lit-Drive": "media" },
        },
      },
    ]);
  });

  it("passes through optional args (limit, type, mode, include_scene_clip) as query", async () => {
    const client = fakeClient(async () => ({ results: [], total: 0 }));
    await findTool("semantic_search").handler(
      { drive: "media", q: "cats", limit: 5, type: "video", mode: "recall" },
      client
    );
    expect(client.calls[0].options).toEqual({
      query: { q: "cats", limit: 5, type: "video", mode: "recall" },
      headers: { "X-Lit-Drive": "media" },
    });
  });
});

describe("get_transcript", () => {
  const fullTranscript = {
    file_id: "abc123456789",
    drive: "media",
    language: "en",
    chunks: [
      { index: 0, text: "intro", start: 0, end: 10, text_refined_at: null },
      { index: 1, text: "middle part", start: 10, end: 20, text_refined_at: null },
      { index: 2, text: "outro", start: 20, end: 30, text_refined_at: null },
    ],
  };

  it("calls GET .../transcript with X-Lit-Drive and returns all chunks when no range given", async () => {
    const client = fakeClient(async () => fullTranscript);
    const result = await findTool("get_transcript").handler(
      { drive: "media", file_id: "abc123456789" },
      client
    );
    expect(client.calls).toEqual([
      {
        method: "GET",
        path: "/api/addons/intelligence/files/abc123456789/transcript",
        options: { headers: { "X-Lit-Drive": "media" } },
      },
    ]);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total_chunks).toBe(3);
    expect(parsed.returned_chunks).toBe(3);
    expect(parsed.truncated).toBe(false);
    expect(parsed.chunks.map((c: { index: number }) => c.index)).toEqual([0, 1, 2]);
  });

  it("filters to chunks overlapping [start_time, end_time)", async () => {
    const client = fakeClient(async () => fullTranscript);
    const result = await findTool("get_transcript").handler(
      { drive: "media", file_id: "abc123456789", start_time: 10, end_time: 20 },
      client
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.chunks.map((c: { index: number }) => c.index)).toEqual([1]);
    expect(parsed.total_chunks).toBe(3);
  });

  it("truncates when total text exceeds the cap, but always includes at least one chunk", async () => {
    const hugeChunks = Array.from({ length: 5 }, (_, i) => ({
      index: i,
      text: "x".repeat(15_000),
      start: i * 10,
      end: (i + 1) * 10,
      text_refined_at: null,
    }));
    const client = fakeClient(async () => ({
      file_id: "abc123456789",
      drive: "media",
      language: "en",
      chunks: hugeChunks,
    }));
    const result = await findTool("get_transcript").handler(
      { drive: "media", file_id: "abc123456789" },
      client
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total_chunks).toBe(5);
    expect(parsed.returned_chunks).toBeGreaterThanOrEqual(1);
    expect(parsed.returned_chunks).toBeLessThan(5);
    expect(parsed.truncated).toBe(true);
  });
});

describe("list_comments", () => {
  it("calls GET /api/files/{file_id}/comments", async () => {
    const client = fakeClient(async () => ({ comments: [], total: 0 }));
    await findTool("list_comments").handler({ file_id: "abc123456789" }, client);
    expect(client.calls).toEqual([
      { method: "GET", path: "/api/files/abc123456789/comments", options: undefined },
    ]);
  });
});
