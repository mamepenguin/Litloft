/**
 * SPEC-CORE-138 sending 4, I15: both MCP callers of the Smart Collection route
 * send the host's zone as `tz`; list rows: the file summary carries
 * `modified_at`.
 */

import { afterAll, describe, expect, it, vi } from "vitest";
import { LitloftApiError } from "../client.js";
import { findTool } from "./toolHarness.js";
import { fakeClient, type RecordedCall } from "./testClient.js";

const ORIGINAL_TZ = vi.hoisted(() => {
  const original = process.env.TZ;
  process.env.TZ = "Asia/Tokyo";
  return original;
});

const DRIVE = "media";
const ENDPOINT = "/app-api/smart-collection-members";

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

function file(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    filename: `${id}.mp4`,
    title: id,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    file_size: 10,
    duration: 1.5,
    tags: ["tag"],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    modified_at: "2019-03-04T05:06:07",
    thumbnail_path: "thumbs/a.jpg",
    is_favorite: true,
    likes: 3,
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    ...extra,
  };
}

const SMART = {
  id: "s-1",
  drive: DRIVE,
  name: "Old",
  query: "modified:<2024",
  file_type: null,
  sort_by: "created_at",
  sort_order: "desc",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
  on_home: false,
};

function queryOf(call: RecordedCall): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(call.options?.query ?? {})) {
    if (value !== undefined) out[key] = String(value);
  }
  return out;
}

function backend() {
  const client = fakeClient(async (call) => {
    const { path } = call;
    if (path === `/api/drives/${DRIVE}/collections`) return [];
    if (path === `/api/drives/${DRIVE}/smart-folders`) return [SMART];
    if (path.startsWith(`/api/drives/${DRIVE}/collections/`)) {
      throw new LitloftApiError(404, { detail: "Collection not found" });
    }
    if (path === ENDPOINT) {
      const q = queryOf(call);
      const base = { id: q.id, name: SMART.name, query: SMART.query, file_type: null, complete: true, total: 2 };
      if (q.ids === "1") return { ...base, ids: ["a", "b"] };
      return { ...base, files: [file("a"), file("b")] };
    }
    throw new Error(`unexpected ${call.method} ${path}`);
  });
  client.requestSse = async (method, path, options) => {
    client.sseCalls.push({ method, path, options });
    return [
      { event: "scope", data: { scope: {}, matched_file_count: 2 } },
      { event: "answer_chunk", data: { delta: "ok" } },
      { event: "citations", data: { citations: [] } },
      { event: "done", data: { retrieved_count: 1 } },
    ];
  };
  return client;
}

const endpointCalls = (client: ReturnType<typeof backend>) =>
  client.calls.filter((c) => c.path === ENDPOINT);

describe("SPEC-CORE-138 I15 the MCP callers send the host's zone as tz", () => {
  it("get_collection sends tz on its call to the route", async () => {
    const host = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(host).toBe("Asia/Tokyo");
    const client = backend();

    const result = await findTool("get_collection").handler({ drive: DRIVE, collection_id: "s-1" }, client);

    expect(result.isError).toBeFalsy();
    const calls = endpointCalls(client);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(queryOf(call).tz).toBe(host);
    }
  });

  it("ask sends tz on its call to the route", async () => {
    const client = backend();

    const result = await findTool("ask").handler(
      { drive: DRIVE, query: "q", scope: { collections: ["Old"] } },
      client
    );

    expect(result.isError).toBeFalsy();
    const calls = endpointCalls(client);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(queryOf(call).tz).toBe("Asia/Tokyo");
    }
  });
});

describe("SPEC-CORE-138 list rows the MCP file summary carries modified_at", () => {
  it("get_collection's items keep the core's modified_at", async () => {
    const client = backend();

    const result = await findTool("get_collection").handler({ drive: DRIVE, collection_id: "s-1" }, client);

    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.items[0].file.modified_at).toBe("2019-03-04T05:06:07");
  });

  it("search_files keeps the core's modified_at, null included", async () => {
    const client = fakeClient(async () => ({
      data: [file("a"), file("b", { modified_at: null })],
      meta: { total: 2, page: 1, limit: 50 },
    }));

    const result = await findTool("search_files").handler({ drive: DRIVE, search: "x" }, client);

    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.data.map((row: Record<string, unknown>) => row.modified_at)).toEqual([
      "2019-03-04T05:06:07",
      null,
    ]);
  });
});
