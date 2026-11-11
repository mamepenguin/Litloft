import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { LitloftApiError } from "../client.js";
import { createLitloftServer } from "../server.js";
import { fakeClient, type RecordedCall } from "./testClient.js";
import { allRequests, findTool, run, schemaOf, type Fake } from "./toolHarness.js";

const DRIVE = "media";
const EXACT_PATH = "/api/addons/intelligence/search/exact";
const SCENES_PATH = "/api/addons/intelligence/search/scenes";

// A tool may put the query in the path or in options.query; both reach the same URL.
function requestedUrl(call: RecordedCall): URL {
  const url = new URL(call.path, "http://litloft.test");
  for (const [key, value] of Object.entries(call.options?.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

function sentParams(call: RecordedCall): Record<string, string> {
  return Object.fromEntries(requestedUrl(call).searchParams.entries());
}

function onlyCall(client: Fake): RecordedCall {
  expect(allRequests(client)).toHaveLength(1);
  return client.calls[0];
}

const EXACT_BODY = {
  query: "needle",
  sources: ["text", "transcript", "scene"],
  total: 1,
  offset: 0,
  available: true,
  segments: [
    {
      file_id: "abc123456789",
      filename: "notes.md",
      source: "text",
      chunk_index: 0,
      page: null,
      section: null,
      section_title: null,
      start_time: null,
      end_time: null,
      field: null,
      match_count: 1,
      snippet: "a needle here",
    },
  ],
};

const SCENES_BODY = {
  query: "a red car",
  available: true,
  results: [
    {
      file_id: "abc123456789",
      filename: "trip.mp4",
      start_time: 12.5,
      end_time: 20,
      scene_label: "Red car",
      visible_text: null,
      score: 0.8123,
    },
  ],
};

function withoutAvailable<T extends { available?: unknown }>(body: T): Omit<T, "available"> {
  const { available: _available, ...rest } = body;
  return rest;
}

describe("search_exact (SPEC-CORE-017)", () => {
  it("SPEC-CORE-017: the schema takes q of 1 to 200 characters", () => {
    const schema = schemaOf("search_exact");
    expect(schema.safeParse({ drive: DRIVE, q: "n" }).success).toBe(true);
    expect(schema.safeParse({ drive: DRIVE, q: "n".repeat(200) }).success).toBe(true);
    expect(schema.safeParse({ drive: DRIVE, q: "" }).success).toBe(false);
    expect(schema.safeParse({ drive: DRIVE, q: "n".repeat(201) }).success).toBe(false);
    expect(schema.safeParse({ drive: DRIVE }).success).toBe(false);
    expect(schema.safeParse({ q: "needle" }).success).toBe(false);
  });

  it("SPEC-CORE-017: the schema takes sources as a non-empty array of text, transcript and scene", () => {
    const schema = schemaOf("search_exact");
    const base = { drive: DRIVE, q: "needle" };
    expect(schema.safeParse({ ...base, sources: ["text"] }).success).toBe(true);
    expect(schema.safeParse({ ...base, sources: ["scene", "transcript", "text"] }).success).toBe(true);
    expect(schema.safeParse({ ...base, sources: [] }).success).toBe(false);
    expect(schema.safeParse({ ...base, sources: ["video"] }).success).toBe(false);
    expect(schema.safeParse({ ...base, sources: ["text", "video"] }).success).toBe(false);
    expect(schema.safeParse({ ...base, sources: "text" }).success).toBe(false);
  });

  it("SPEC-CORE-017: the schema takes an integer limit of 1 to 200 and an integer offset >= 0", () => {
    const schema = schemaOf("search_exact");
    const base = { drive: DRIVE, q: "needle" };
    for (const limit of [1, 50, 200]) {
      expect(schema.safeParse({ ...base, limit }).success, `limit ${limit}`).toBe(true);
    }
    for (const limit of [0, 201, 1.5, -1]) {
      expect(schema.safeParse({ ...base, limit }).success, `limit ${limit}`).toBe(false);
    }
    for (const offset of [0, 1, 10_000]) {
      expect(schema.safeParse({ ...base, offset }).success, `offset ${offset}`).toBe(true);
    }
    for (const offset of [-1, 0.5]) {
      expect(schema.safeParse({ ...base, offset }).success, `offset ${offset}`).toBe(false);
    }
  });

  it("SPEC-CORE-017 I10: sends GET /search/exact with only q and X-Lit-Drive when nothing else is given", async () => {
    const client = fakeClient(async () => EXACT_BODY);
    await findTool("search_exact").handler({ drive: DRIVE, q: "needle" }, client);

    const call = onlyCall(client);
    expect(call.method).toBe("GET");
    expect(requestedUrl(call).pathname).toBe(EXACT_PATH);
    expect(sentParams(call)).toEqual({ q: "needle" });
    expect(call.options?.headers).toEqual({ "X-Lit-Drive": DRIVE });
  });

  it.each([
    [{ sources: ["scene", "text"] }, { sources: "scene,text" }],
    [{ sources: ["transcript"] }, { sources: "transcript" }],
    [{ limit: 200 }, { limit: "200" }],
    [{ offset: 0 }, { offset: "0" }],
    [
      { sources: ["text", "transcript", "scene"], limit: 3, offset: 6 },
      { sources: "text,transcript,scene", limit: "3", offset: "6" },
    ],
  ])("SPEC-CORE-017 I10: sends exactly the parameters given (%o)", async (args, expected) => {
    const client = fakeClient(async () => EXACT_BODY);
    await findTool("search_exact").handler({ drive: DRIVE, q: "needle", ...args }, client);

    expect(sentParams(onlyCall(client))).toEqual({ q: "needle", ...expected });
  });

  it("SPEC-CORE-017 I10: percent-encodes the drive in X-Lit-Drive", async () => {
    const client = fakeClient(async () => EXACT_BODY);
    await findTool("search_exact").handler({ drive: "動画 2", q: "needle" }, client);

    expect(onlyCall(client).options?.headers).toEqual({
      "X-Lit-Drive": encodeURIComponent("動画 2"),
    });
  });

  it("SPEC-CORE-017 I10: returns the response as compact JSON without the available key", async () => {
    const client = fakeClient(async () => EXACT_BODY);
    const out = await run("search_exact", { drive: DRIVE, q: "needle" }, client);

    expect(out.isError).toBe(false);
    expect(out.text).toBe(JSON.stringify(withoutAvailable(EXACT_BODY)));
  });

  it.each([
    [new LitloftApiError(422, { detail: "Invalid sources" }), "Litloft API error (422): Invalid sources"],
    [new LitloftApiError(502, { detail: "Addon service unavailable" }), "Litloft API error (502): Addon service unavailable"],
    [new LitloftApiError(404, { detail: "Not Found" }), "Litloft API error (404): Not Found"],
  ])("SPEC-CORE-017: a backend failure is an error result (%s)", async (error, text) => {
    const client = fakeClient(async () => {
      throw error;
    });
    const out = await run("search_exact", { drive: DRIVE, q: "needle" }, client);

    expect(out.isError).toBe(true);
    expect(out.text).toBe(text);
  });
});

describe("search_video_scenes (SPEC-CORE-018)", () => {
  it("SPEC-CORE-018: the schema takes q of 1 to 1000 characters and an integer limit of 1 to 50", () => {
    const schema = schemaOf("search_video_scenes");
    const base = { drive: DRIVE, q: "car" };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, q: "c".repeat(1000) }).success).toBe(true);
    expect(schema.safeParse({ ...base, q: "" }).success).toBe(false);
    expect(schema.safeParse({ ...base, q: "c".repeat(1001) }).success).toBe(false);
    expect(schema.safeParse({ q: "car" }).success).toBe(false);
    for (const limit of [1, 20, 50]) {
      expect(schema.safeParse({ ...base, limit }).success, `limit ${limit}`).toBe(true);
    }
    for (const limit of [0, 51, 2.5]) {
      expect(schema.safeParse({ ...base, limit }).success, `limit ${limit}`).toBe(false);
    }
  });

  it.each([
    [{}, {}],
    [{ limit: 50 }, { limit: "50" }],
    [{ limit: 1 }, { limit: "1" }],
  ])("SPEC-CORE-018 I10: sends GET /search/scenes with q, the limit given and X-Lit-Drive (%o)", async (args, expected) => {
    const client = fakeClient(async () => SCENES_BODY);
    await findTool("search_video_scenes").handler({ drive: DRIVE, q: "a red car", ...args }, client);

    const call = onlyCall(client);
    expect(call.method).toBe("GET");
    expect(requestedUrl(call).pathname).toBe(SCENES_PATH);
    expect(sentParams(call)).toEqual({ q: "a red car", ...expected });
    expect(call.options?.headers).toEqual({ "X-Lit-Drive": DRIVE });
  });

  it("SPEC-CORE-018 I10: percent-encodes the drive in X-Lit-Drive", async () => {
    const client = fakeClient(async () => SCENES_BODY);
    await findTool("search_video_scenes").handler({ drive: "動画", q: "car" }, client);

    expect(onlyCall(client).options?.headers).toEqual({
      "X-Lit-Drive": encodeURIComponent("動画"),
    });
  });

  it("SPEC-CORE-018 I10: returns the response as compact JSON without the available key", async () => {
    const client = fakeClient(async () => SCENES_BODY);
    const out = await run("search_video_scenes", { drive: DRIVE, q: "a red car" }, client);

    expect(out.isError).toBe(false);
    expect(out.text).toBe(JSON.stringify(withoutAvailable(SCENES_BODY)));
  });

  it.each([
    [new LitloftApiError(404, { detail: "Not Found" }), "Litloft API error (404): Not Found"],
    [new LitloftApiError(502, { detail: "Addon service unavailable" }), "Litloft API error (502): Addon service unavailable"],
  ])("SPEC-CORE-018: a backend failure is an error result (%s)", async (error, text) => {
    const client = fakeClient(async () => {
      throw error;
    });
    const out = await run("search_video_scenes", { drive: DRIVE, q: "car" }, client);

    expect(out.isError).toBe(true);
    expect(out.text).toBe(text);
  });
});

describe("search tool arguments over MCP (SPEC-CORE-017, SPEC-CORE-018)", () => {
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
    ["search_exact", { drive: DRIVE, q: "" }],
    ["search_exact", { drive: DRIVE, q: "n".repeat(201) }],
    ["search_exact", { drive: DRIVE, q: "needle", sources: [] }],
    ["search_exact", { drive: DRIVE, q: "needle", sources: ["video"] }],
    ["search_exact", { drive: DRIVE, q: "needle", limit: 0 }],
    ["search_exact", { drive: DRIVE, q: "needle", limit: 201 }],
    ["search_exact", { drive: DRIVE, q: "needle", offset: -1 }],
    ["search_video_scenes", { drive: DRIVE, q: "" }],
    ["search_video_scenes", { drive: DRIVE, q: "c".repeat(1001) }],
    ["search_video_scenes", { drive: DRIVE, q: "car", limit: 51 }],
    ["search_video_scenes", { drive: DRIVE, q: "car", limit: 0 }],
  ])("SPEC-CORE-017 SPEC-CORE-018 I10: %s with %o is rejected before any request", async (name, args) => {
    const fake = fakeClient(async () => ({}));
    const result = (await callOverMcp(fake, name, args)) as { isError?: boolean; rejected?: unknown };

    expect(result.rejected !== undefined || result.isError === true).toBe(true);
    expect(allRequests(fake)).toEqual([]);
  });

  it.each([
    ["search_exact", { drive: DRIVE, q: "needle" }, EXACT_PATH],
    ["search_video_scenes", { drive: DRIVE, q: "car" }, SCENES_PATH],
  ])("SPEC-CORE-017 SPEC-CORE-018: %s with valid arguments reaches the API over MCP", async (name, args, path) => {
    const fake = fakeClient(async () => ({}));
    const result = (await callOverMcp(fake, name, args)) as { isError?: boolean };

    expect(result.isError).not.toBe(true);
    expect(fake.calls.map((c) => requestedUrl(c).pathname)).toEqual([path]);
  });
});
