import { describe, expect, it } from "vitest";
import { LitloftApiError } from "../client.js";
import { findTool, schemaOf } from "./toolHarness.js";
import { fakeClient, type RecordedCall } from "./testClient.js";
import { createLitloftServer } from "../server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const DRIVE = "media";
const ENDPOINT = "/app-api/smart-collection-members";
const UPDATE_MESSAGE = "This Litloft server has no Smart Collection endpoint; update Litloft.";
const OLD_SERVER_404 = () =>
  new LitloftApiError(404, "<!DOCTYPE html><html><body>404: This page could not be found.</body></html>");

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
    thumbnail_path: "thumbs/a.jpg",
    is_favorite: true,
    likes: 3,
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    ...extra,
  };
}

function summary(id: string): Record<string, unknown> {
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
  };
}

function collectionRow(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name,
    description: null,
    drive: DRIVE,
    item_count: 2,
    first_file_id: "file000000aa",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };
}

function smartRow(id: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    drive: DRIVE,
    name,
    query: `q-${id}`,
    file_type: null,
    sort_by: "created_at",
    sort_order: "desc",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
    on_home: false,
    ...extra,
  };
}

interface Members {
  ids: string[];
  complete?: boolean;
  files?: Record<string, unknown>[];
}

interface Backend {
  collections?: Record<string, unknown>[] | (() => unknown);
  smartFolders?: Record<string, unknown>[] | (() => unknown);
  collectionDetail?: (id: string) => unknown;
  members?: Record<string, Members | (() => unknown)>;
}

function queryOf(call: RecordedCall): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(call.options?.query ?? {})) {
    if (value !== undefined) out[key] = String(value);
  }
  return out;
}

function backend(spec: Backend) {
  return fakeClient(async (call) => {
    const { method, path } = call;
    if (method !== "GET") throw new Error(`unexpected ${method} ${path}`);
    if (path === `/api/drives/${DRIVE}/collections`) {
      const c = spec.collections ?? [];
      return typeof c === "function" ? c() : c;
    }
    if (path === `/api/drives/${DRIVE}/smart-folders`) {
      const s = spec.smartFolders ?? [];
      return typeof s === "function" ? s() : s;
    }
    const detail = new RegExp(`^/api/drives/${DRIVE}/collections/([^/]+)$`).exec(path);
    if (detail) {
      if (spec.collectionDetail) return spec.collectionDetail(decodeURIComponent(detail[1]));
      throw new LitloftApiError(404, { detail: "Collection not found" });
    }
    if (path === ENDPOINT) {
      const q = queryOf(call);
      const m = spec.members?.[q.id];
      if (!m) throw new LitloftApiError(404, { detail: "Smart collection not found" });
      if (typeof m === "function") return m();
      const folder = (Array.isArray(spec.smartFolders) ? spec.smartFolders : []).find((s) => s.id === q.id) ?? {};
      const offset = Number(q.offset ?? 0);
      const end = q.limit === undefined ? undefined : offset + Number(q.limit);
      const base = {
        id: q.id,
        name: folder.name,
        query: folder.query,
        file_type: folder.file_type ?? null,
        complete: m.complete ?? true,
        total: m.ids.length,
      };
      if (q.ids === "1") return { ...base, ids: m.ids.slice(offset, end) };
      const files = m.files ?? m.ids.map((id) => file(id));
      return { ...base, files: files.slice(offset, end) };
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

function textOf(result: { content: unknown[] }): string {
  return (result.content[0] as { text: string }).text;
}

function parsed(result: { content: unknown[] }): any {
  return JSON.parse(textOf(result));
}

const endpointCalls = (client: ReturnType<typeof fakeClient>) =>
  client.calls.filter((c) => c.path === ENDPOINT);

describe("SPEC-CORE-112 I4 list_collections", () => {
  it("returns collections and Smart Collections in one Intl.Collator('ja', numeric) order", async () => {
    const client = backend({
      collections: [collectionRow("c-10", "Item 10"), collectionRow("c-b", "beta"), collectionRow("c-same", "Same")],
      smartFolders: [
        smartRow("s-2", "Item 2"),
        smartRow("s-A", "Alpha"),
        smartRow("s-same", "Same"),
        smartRow("s-a", "Twin"),
        smartRow("s-B", "Twin"),
      ],
    });

    const result = await findTool("list_collections").handler({ drive: DRIVE }, client);

    expect(result.isError).toBeFalsy();
    expect(parsed(result).map((r: { id: string; kind: string }) => [r.kind, r.id])).toEqual([
      ["smart", "s-A"],
      ["collection", "c-b"],
      ["smart", "s-2"],
      ["collection", "c-10"],
      ["collection", "c-same"],
      ["smart", "s-same"],
      ["smart", "s-B"],
      ["smart", "s-a"],
    ]);
  });

  it("keeps a collection row as the core returns it plus kind, and a Smart Collection row as exactly id, name, kind, query, file_type", async () => {
    const coll = collectionRow("c-1", "Album");
    const smart = smartRow("s-1", "Bikes", { query: "tag:bike", file_type: "video" });
    const client = backend({ collections: [coll], smartFolders: [smart] });

    const result = await findTool("list_collections").handler({ drive: DRIVE }, client);

    expect(parsed(result)).toEqual([
      { ...coll, kind: "collection" },
      { id: "s-1", name: "Bikes", kind: "smart", query: "tag:bike", file_type: "video" },
    ]);
  });

  it("reads both lists of the drive", async () => {
    const client = backend({});

    const result = await findTool("list_collections").handler({ drive: DRIVE }, client);

    expect(parsed(result)).toEqual([]);
    expect(client.calls.map((c) => c.path).sort()).toEqual([
      `/api/drives/${DRIVE}/collections`,
      `/api/drives/${DRIVE}/smart-folders`,
    ]);
  });

  it("either list failing is isError with that error and no partial list", async () => {
    const cases: Array<[Backend, number, string]> = [
      [{ collections: () => { throw new LitloftApiError(500, { detail: "collections down" }); }, smartFolders: [smartRow("s-1", "A")] }, 500, "collections down"],
      [{ collections: [collectionRow("c-1", "A")], smartFolders: () => { throw new LitloftApiError(503, { detail: "smart down" }); } }, 503, "smart down"],
    ];
    for (const [spec, status, detail] of cases) {
      const result = await findTool("list_collections").handler({ drive: DRIVE }, backend(spec));

      expect(result.isError, detail).toBe(true);
      expect(textOf(result)).toContain(`Litloft API error (${status})`);
      expect(textOf(result)).toContain(detail);
    }
  });
});

describe("SPEC-CORE-112 I5 get_collection", () => {
  const SMART = smartRow("s-1", "Bikes", { query: "tag:bike", file_type: "video" });
  const MEMBER_IDS = Array.from({ length: 120 }, (_, i) => `m${String(i).padStart(11, "0")}`);

  it("a collection id answers as before plus kind, ignores offset and limit, and reads nothing else", async () => {
    const items = [
      { id: 11, position: 0, file: file("file000000aa") },
      { id: 12, position: 1, file: file("file000000bb", { deleted_at: "2026-02-01T00:00:00Z" }) },
      { id: 13, position: 2, file: file("file000000cc") },
    ];
    const client = backend({
      collectionDetail: (id) => ({
        id,
        name: "Set",
        description: null,
        drive: DRIVE,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        items,
      }),
    });

    const result = await findTool("get_collection").handler(
      { drive: DRIVE, collection_id: "c-1", offset: 1, limit: 1 },
      client
    );

    const body = parsed(result);
    expect(body.kind).toBe("collection");
    expect(body.items).toEqual([
      { item_id: 11, position: 0, file: summary("file000000aa") },
      { item_id: 13, position: 2, file: summary("file000000cc") },
    ]);
    expect(body.inactive_count).toBe(1);
    expect(client.calls.map((c) => c.path)).toEqual([`/api/drives/${DRIVE}/collections/c-1`]);
  });

  it("a Smart Collection id: the first 50 members by default, summarised, positions from 0", async () => {
    const client = backend({ smartFolders: [SMART], members: { "s-1": { ids: MEMBER_IDS } } });

    const result = await findTool("get_collection").handler({ drive: DRIVE, collection_id: "s-1" }, client);

    expect(result.isError).toBeFalsy();
    const body = parsed(result);
    expect(Object.keys(body).sort()).toEqual(
      ["complete", "file_type", "id", "items", "kind", "name", "offset", "query", "total"].sort()
    );
    expect(body).toMatchObject({
      id: "s-1",
      name: "Bikes",
      kind: "smart",
      query: "tag:bike",
      file_type: "video",
      complete: true,
      total: 120,
      offset: 0,
    });
    expect(body.items).toHaveLength(50);
    expect(body.items[0]).toEqual({ position: 0, file: summary(MEMBER_IDS[0]) });
    expect(body.items[49]).toEqual({ position: 49, file: summary(MEMBER_IDS[49]) });
    expect(body).not.toHaveProperty("inactive_count");

    const calls = endpointCalls(client);
    expect(calls).toHaveLength(1);
    expect(queryOf(calls[0])).toEqual({ drive: DRIVE, id: "s-1", offset: "0", limit: "50", tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
  });

  it("asks the smart-folders list only after the collection endpoint's 404; another error is returned as is", async () => {
    const client = backend({ smartFolders: [SMART], members: { "s-1": { ids: MEMBER_IDS.slice(0, 3) } } });

    await findTool("get_collection").handler({ drive: DRIVE, collection_id: "s-1" }, client);

    expect(client.calls.map((c) => c.path)).toEqual([
      `/api/drives/${DRIVE}/collections/s-1`,
      `/api/drives/${DRIVE}/smart-folders`,
      ENDPOINT,
    ]);

    const failing = backend({
      collectionDetail: () => {
        throw new LitloftApiError(500, { detail: "db locked" });
      },
      smartFolders: [SMART],
      members: { "s-1": { ids: MEMBER_IDS.slice(0, 3) } },
    });

    const result = await findTool("get_collection").handler({ drive: DRIVE, collection_id: "s-1" }, failing);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Litloft API error (500)");
    expect(failing.calls.map((c) => c.path)).toEqual([`/api/drives/${DRIVE}/collections/s-1`]);
  });

  it("pages with offset and limit; position is the index in the whole list", async () => {
    const client = backend({ smartFolders: [SMART], members: { "s-1": { ids: MEMBER_IDS } } });

    const result = await findTool("get_collection").handler(
      { drive: DRIVE, collection_id: "s-1", offset: 100, limit: 200 },
      client
    );

    const body = parsed(result);
    expect(queryOf(endpointCalls(client)[0])).toEqual({ drive: DRIVE, id: "s-1", offset: "100", limit: "200", tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    expect(body.offset).toBe(100);
    expect(body.total).toBe(120);
    expect(body.items.map((i: { position: number }) => i.position)).toEqual(
      Array.from({ length: 20 }, (_, i) => 100 + i)
    );
    expect(body.items.map((i: { file: { id: string } }) => i.file.id)).toEqual(MEMBER_IDS.slice(100));
  });

  it("an offset past the end returns no items and the total", async () => {
    const client = backend({ smartFolders: [SMART], members: { "s-1": { ids: MEMBER_IDS.slice(0, 3) } } });

    const result = await findTool("get_collection").handler(
      { drive: DRIVE, collection_id: "s-1", offset: 10 },
      client
    );

    expect(parsed(result)).toMatchObject({ total: 3, offset: 10, items: [] });
  });

  it("fields: full returns the whole file object", async () => {
    const full = file(MEMBER_IDS[0], { extra_field: "kept" });
    const client = backend({ smartFolders: [SMART], members: { "s-1": { ids: [MEMBER_IDS[0]], files: [full] } } });

    const result = await findTool("get_collection").handler(
      { drive: DRIVE, collection_id: "s-1", fields: "full" },
      client
    );

    expect(parsed(result).items).toEqual([{ position: 0, file: full }]);
  });

  it("passes complete: false through", async () => {
    const client = backend({ smartFolders: [SMART], members: { "s-1": { ids: MEMBER_IDS.slice(0, 2), complete: false } } });

    const result = await findTool("get_collection").handler({ drive: DRIVE, collection_id: "s-1" }, client);

    expect(result.isError).toBeFalsy();
    expect(parsed(result).complete).toBe(false);
  });

  it("uses the client's default timeout for the members call", async () => {
    const client = backend({ smartFolders: [SMART], members: { "s-1": { ids: MEMBER_IDS.slice(0, 2) } } });

    await findTool("get_collection").handler({ drive: DRIVE, collection_id: "s-1" }, client);

    expect([undefined, 30_000]).toContain(
      (endpointCalls(client)[0].options as { timeoutMs?: number } | undefined)?.timeoutMs
    );
  });

  it.each([
    ["neither a collection nor a Smart Collection", { smartFolders: [smartRow("s-other", "Other")] }],
    ["a locked drive", { smartFolders: () => { throw new LitloftApiError(404, { detail: "Drive not found" }); } }],
  ] as const)("%s is isError with Litloft API error (404)", async (_label, spec) => {
    const client = backend(spec as Backend);

    const result = await findTool("get_collection").handler({ drive: DRIVE, collection_id: "s-1" }, client);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Litloft API error (404)");
    expect(client.calls.map((c) => c.path)).toEqual([
      `/api/drives/${DRIVE}/collections/s-1`,
      `/api/drives/${DRIVE}/smart-folders`,
    ]);
  });

  it("a non-404 error from the smart-folders list is returned", async () => {
    const client = backend({
      smartFolders: () => {
        throw new LitloftApiError(401, { detail: "Token expired" });
      },
    });

    const result = await findTool("get_collection").handler({ drive: DRIVE, collection_id: "s-1" }, client);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Litloft API error (401)");
    expect(textOf(result)).toContain("Token expired");
  });

  it.each([
    [502, { detail: "Smart collection listing failed" }],
    [404, { detail: "Smart collection listing failed" }],
    [500, { detail: "Smart collection evaluation failed" }],
  ] as const)("a members answer of %i is reported as the client does", async (status, body) => {
    const client = backend({
      smartFolders: [SMART],
      members: {
        "s-1": () => {
          throw new LitloftApiError(status, body);
        },
      },
    });

    const result = await findTool("get_collection").handler({ drive: DRIVE, collection_id: "s-1" }, client);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(`Litloft API error (${status})`);
    expect(textOf(result)).toContain(body.detail);
  });

  it("a Litloft without the endpoint (a non-JSON 404) asks for an update", async () => {
    const client = backend({
      smartFolders: [SMART],
      members: {
        "s-1": () => {
          throw OLD_SERVER_404();
        },
      },
    });

    const result = await findTool("get_collection").handler({ drive: DRIVE, collection_id: "s-1" }, client);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(UPDATE_MESSAGE);
  });

  describe("schema", () => {
    const base = { drive: DRIVE, collection_id: "s-1" };

    it.each([
      ["offset 0", { offset: 0 }],
      ["offset 5000", { offset: 5000 }],
      ["limit 1", { limit: 1 }],
      ["limit 200", { limit: 200 }],
    ])("accepts %s", (_label, extra) => {
      expect(schemaOf("get_collection").parse({ ...base, ...extra })).toMatchObject(extra);
    });

    it.each([
      ["offset -1", { offset: -1 }],
      ["offset 1.5", { offset: 1.5 }],
      ["limit 0", { limit: 0 }],
      ["limit 201", { limit: 201 }],
      ["limit 1.5", { limit: 1.5 }],
    ])("rejects %s", (_label, extra) => {
      expect(() => schemaOf("get_collection").parse({ ...base, ...extra })).toThrow();
    });
  });
});

function askTool() {
  return findTool("ask");
}

type SseCalls = ReturnType<typeof fakeClient>["sseCalls"];

const ANSWER_EVENTS = [
  { event: "scope", data: { scope: {}, matched_file_count: 1 } },
  { event: "answer_chunk", data: { delta: "ok" } },
  { event: "citations", data: { citations: [] } },
  { event: "done", data: { retrieved_count: 1 } },
];

function askBackend(spec: Backend) {
  const client = backend(spec);
  const original = client.requestSse;
  client.requestSse = async (method, path, options) => {
    client.sseCalls.push({ method, path, options });
    return ANSWER_EVENTS;
  };
  void original;
  return client;
}

const sentScope = (calls: SseCalls) =>
  (calls[0].options?.json as { scope?: Record<string, unknown> }).scope;

describe("SPEC-CORE-112 I6 ask's scope.collections with Smart Collections", () => {
  const COLLECTIONS = [collectionRow("c-1", "Album"), collectionRow("c-2", "Shared")];
  const SMARTS = [smartRow("s-1", "Bikes"), smartRow("s-2", "Trips"), smartRow("s-3", "Shared"), smartRow("s-4", "Empty")];
  const MEMBERS: Record<string, Members> = {
    "s-1": { ids: ["a", "b", "c"] },
    "s-2": { ids: ["c", "d", "a"] },
    "s-3": { ids: ["never"] },
    "s-4": { ids: [] },
  };

  it("a collection name stays in collections, with both lists read and nothing evaluated", async () => {
    const client = askBackend({ collections: COLLECTIONS, smartFolders: SMARTS, members: MEMBERS });
    const scope = { collections: ["Album"], tags: ["t"] };

    const result = await askTool().handler({ drive: DRIVE, query: "q", scope }, client);

    expect(result.isError).toBeFalsy();
    expect(client.calls.map((c) => c.path).sort()).toEqual([
      `/api/drives/${DRIVE}/collections`,
      `/api/drives/${DRIVE}/smart-folders`,
    ]);
    expect(sentScope(client.sseCalls)).toEqual(scope);
    expect(parsed(result)).not.toHaveProperty("smart_collections");
  });

  it("a Smart Collection name is replaced by its members' ids, evaluated with ids=1 and a 120 s timeout", async () => {
    const client = askBackend({ collections: COLLECTIONS, smartFolders: SMARTS, members: MEMBERS });

    const result = await askTool().handler(
      { drive: DRIVE, query: "q", scope: { collections: ["Bikes"], kinds: ["pdf"] } },
      client
    );

    expect(result.isError).toBeFalsy();
    expect(sentScope(client.sseCalls)).toEqual({ collections: [], file_ids: ["a", "b", "c"], kinds: ["pdf"] });
    const calls = endpointCalls(client);
    expect(calls).toHaveLength(1);
    expect(queryOf(calls[0])).toMatchObject({ drive: DRIVE, id: "s-1", ids: "1" });
    expect((calls[0].options as { timeoutMs?: number }).timeoutMs).toBe(120_000);
    expect(parsed(result).smart_collections).toEqual([{ name: "Bikes", member_count: 3 }]);
  });

  it("a name matching both a collection and a Smart Collection stays a collection", async () => {
    const client = askBackend({ collections: COLLECTIONS, smartFolders: SMARTS, members: MEMBERS });

    const result = await askTool().handler({ drive: DRIVE, query: "q", scope: { collections: ["Shared"] } }, client);

    expect(client.calls.map((c) => c.path).sort()).toEqual([
      `/api/drives/${DRIVE}/collections`,
      `/api/drives/${DRIVE}/smart-folders`,
    ]);
    expect(sentScope(client.sseCalls)).toEqual({ collections: ["Shared"] });
    expect(endpointCalls(client)).toHaveLength(0);
    expect(parsed(result)).not.toHaveProperty("smart_collections");
  });

  it("matches names after toLowerCase(), collections first; I9 smart_collections carries the saved name", async () => {
    const client = askBackend({ collections: COLLECTIONS, smartFolders: SMARTS, members: MEMBERS });

    const result = await askTool().handler({ drive: DRIVE, query: "q", scope: { collections: ["ALBUM", "bikes"] } }, client);

    const scope = sentScope(client.sseCalls)!;
    expect(scope.collections).toEqual(["ALBUM"]);
    expect(scope.file_ids).toEqual(["a", "b", "c"]);
    expect(queryOf(endpointCalls(client)[0]).id).toBe("s-1");
    expect(parsed(result).smart_collections).toEqual([{ name: "Bikes", member_count: 3 }]);
  });

  it("mixes kept collections and replaced Smart Collections, de-duplicating ids keeping the first", async () => {
    const client = askBackend({ collections: COLLECTIONS, smartFolders: SMARTS, members: MEMBERS });

    const result = await askTool().handler(
      { drive: DRIVE, query: "q", scope: { collections: ["Trips", "Album", "Bikes"], file_ids: ["z", "a"] } },
      client
    );

    expect(sentScope(client.sseCalls)).toEqual({ collections: ["Album"], file_ids: ["z", "a", "c", "d", "b"] });
    expect(endpointCalls(client).map((c) => queryOf(c).id)).toEqual(["s-2", "s-1"]);
    for (const call of endpointCalls(client)) {
      expect((call.options as { timeoutMs?: number }).timeoutMs).toBe(120_000);
    }
    expect(parsed(result).smart_collections).toEqual([
      { name: "Trips", member_count: 3 },
      { name: "Bikes", member_count: 3 },
    ]);
  });

  it("evaluates a name repeated in another case once, and lists it once under its saved name (I9)", async () => {
    const client = askBackend({ collections: COLLECTIONS, smartFolders: SMARTS, members: MEMBERS });

    const result = await askTool().handler(
      { drive: DRIVE, query: "q", scope: { collections: ["BIKES", "bikes", "Bikes"] } },
      client
    );

    expect(endpointCalls(client)).toHaveLength(1);
    expect(sentScope(client.sseCalls)).toEqual({ collections: [], file_ids: ["a", "b", "c"] });
    expect(parsed(result).smart_collections).toEqual([{ name: "Bikes", member_count: 3 }]);
  });

  it("evaluates Smart Collections one after another in the order given", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const order: string[] = [];
    const slow = (id: string) => async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push(id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { id, name: id, query: "", file_type: null, complete: true, total: 1, ids: [`${id}-m`] };
    };
    const client = askBackend({
      collections: [],
      smartFolders: SMARTS,
      members: { "s-4": slow("s-4"), "s-2": slow("s-2"), "s-1": slow("s-1") },
    });

    await askTool().handler({ drive: DRIVE, query: "q", scope: { collections: ["Empty", "Trips", "Bikes"] } }, client);

    expect(order).toEqual(["s-4", "s-2", "s-1"]);
    expect(maxInFlight).toBe(1);
    expect(sentScope(client.sseCalls)!.file_ids).toEqual(["s-4-m", "s-2-m", "s-1-m"]);
  });

  it("sends file_ids: [] when the only Smart Collection named has no members", async () => {
    const client = askBackend({ collections: COLLECTIONS, smartFolders: SMARTS, members: MEMBERS });

    const result = await askTool().handler({ drive: DRIVE, query: "q", scope: { collections: ["Empty"] } }, client);

    expect(sentScope(client.sseCalls)).toEqual({ collections: [], file_ids: [] });
    expect(parsed(result).smart_collections).toEqual([{ name: "Empty", member_count: 0 }]);
  });

  it("declares scope.file_ids as an optional list of strings", () => {
    const schema = schemaOf("ask");

    expect(schema.parse({ drive: DRIVE, query: "q", scope: { file_ids: ["a", "b"] } }).scope).toEqual({
      file_ids: ["a", "b"],
    });
    expect(schema.parse({ drive: DRIVE, query: "q", scope: {} }).scope).toEqual({});
    expect(() => schema.parse({ drive: DRIVE, query: "q", scope: { file_ids: [1] } })).toThrow();
  });

  describe("the 10,000-id cap", () => {
    const many = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

    it("sends exactly 10,000 ids", async () => {
      const client = askBackend({ smartFolders: SMARTS, members: { "s-1": { ids: many(10_000, "x") } } });

      const result = await askTool().handler({ drive: DRIVE, query: "q", scope: { collections: ["Bikes"] } }, client);

      expect(result.isError).toBeFalsy();
      expect((sentScope(client.sseCalls)!.file_ids as string[]).length).toBe(10_000);
    });

    it("counts after de-duplication", async () => {
      const client = askBackend({ smartFolders: SMARTS, members: { "s-1": { ids: many(10_000, "x") } } });

      const result = await askTool().handler(
        { drive: DRIVE, query: "q", scope: { collections: ["Bikes"], file_ids: ["x0", "x9999"] } },
        client
      );

      expect(result.isError).toBeFalsy();
      expect((sentScope(client.sseCalls)!.file_ids as string[]).length).toBe(10_000);
    });

    it("refuses 10,001 ids with the count written 10,001 (I10) and sends no Ask request", async () => {
      const client = askBackend({ smartFolders: SMARTS, members: { "s-1": { ids: many(10_000, "x") } } });

      const result = await askTool().handler(
        { drive: DRIVE, query: "q", scope: { collections: ["Bikes"], file_ids: ["extra"] } },
        client
      );

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain(
        "The scope holds 10,001 files; at most 10,000 can be asked about. Nothing was asked."
      );
      expect(client.sseCalls).toHaveLength(0);
    });
  });

  describe("failures send no Ask request", () => {
    const cases: Array<[string, Backend, string[], string | RegExp]> = [
      [
        "the collections list unreadable",
        { collections: () => { throw new LitloftApiError(500, { detail: "collections down" }); }, smartFolders: SMARTS },
        ["Bikes"],
        "Litloft API error (500)",
      ],
      [
        "the Smart Collections list unreadable",
        { collections: COLLECTIONS, smartFolders: () => { throw new LitloftApiError(404, { detail: "Drive not found" }); } },
        ["Album"],
        "Litloft API error (404)",
      ],
      [
        "an evaluation answering 502",
        { smartFolders: SMARTS, members: { "s-1": () => { throw new LitloftApiError(502, { detail: "Smart collection listing failed" }); } } },
        ["Bikes"],
        "Litloft API error (502)",
      ],
      [
        "an evaluation answering a JSON 404",
        { smartFolders: SMARTS, members: { "s-1": () => { throw new LitloftApiError(404, { detail: "Smart collection not found" }); } } },
        ["Bikes"],
        "Litloft API error (404)",
      ],
      [
        "an incomplete evaluation",
        { smartFolders: SMARTS, members: { "s-1": { ids: ["a"], complete: false } } },
        ["Bikes"],
        'Smart Collection "Bikes" could not be read completely (meaning search unavailable); nothing was asked.',
      ],
      [
        "an incomplete evaluation named in another case reports the saved name (I9)",
        { smartFolders: SMARTS, members: { "s-1": { ids: ["a"], complete: false } } },
        ["bIKES"],
        'Smart Collection "Bikes" could not be read completely (meaning search unavailable); nothing was asked.',
      ],
      [
        "a later evaluation incomplete",
        { smartFolders: SMARTS, members: { "s-1": { ids: ["a"] }, "s-2": { ids: ["b"], complete: false } } },
        ["Bikes", "Trips"],
        'Smart Collection "Trips" could not be read completely (meaning search unavailable); nothing was asked.',
      ],
      [
        "a Litloft without the endpoint",
        { smartFolders: SMARTS, members: { "s-1": () => { throw OLD_SERVER_404(); } } },
        ["Bikes"],
        UPDATE_MESSAGE,
      ],
    ];

    it.each(cases)("%s", async (_label, spec, names, message) => {
      const client = askBackend(spec);

      const result = await askTool().handler({ drive: DRIVE, query: "q", scope: { collections: names } }, client);

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain(message as string);
      expect(client.sseCalls).toHaveLength(0);
    });
  });
});

describe("SPEC-CORE-112 I8 descriptions and server instructions", () => {
  it("get_collection says a Smart Collection is a saved search computed when read, with complete and paging", () => {
    const description = findTool("get_collection").description;
    expect(description).toMatch(/Smart Collection/);
    expect(description).toMatch(/saved search/i);
    expect(description).toMatch(/complete: ?false|complete is false|`complete`/i);
    expect(description).toMatch(/meaning search/i);
    expect(description).toMatch(/offset/);
    expect(description).toMatch(/limit/);
  });

  it("list_collections mentions Smart Collections", () => {
    expect(findTool("list_collections").description).toMatch(/Smart Collection/);
  });

  it("ask says Smart Collection names may appear in scope.collections and combine as one collection condition", () => {
    const description = askTool().description;
    const line = description.split(/(?<=\.)\s+/).find((sentence) => /Smart Collection/.test(sentence)) ?? "";
    expect(line).toMatch(/collections/);
    expect(description).toMatch(/Smart Collection[^.]*(combine|together|condition)|(combine|together|condition)[^.]*Smart Collection/i);
  });

  it("the server instructions mention Smart Collections, complete, paging and ask", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createLitloftServer(fakeClient(async () => ({})));
    const client = new Client({ name: "litloft-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const instructions = client.getInstructions() ?? "";
    await client.close();

    expect(instructions).toMatch(/Smart Collection/);
    expect(instructions).toMatch(/saved search/i);
    expect(instructions).toMatch(/complete/);
    expect(instructions).toMatch(/offset/);
    expect(instructions).toMatch(/limit/);
    const askLine = instructions
      .split("\n")
      .find((line) => /Smart Collection/.test(line) && /\bask\b|scope\.collections/.test(line));
    expect(askLine).toBeDefined();
  });
});
