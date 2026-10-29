import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { LitloftApiError } from "../client.js";
import { createLitloftServer } from "../server.js";
import { fakeClient, type RecordedCall } from "./testClient.js";
import {
  FILE_ID,
  allRequests,
  findTool,
  isOneLine,
  run,
  schemaOf,
  type Fake,
} from "./toolHarness.js";

const DRIVE = "media";
const DOCUMENT_PATH = `/api/addons/intelligence/files/${FILE_ID}/document-text`;

const BODY = {
  file_id: FILE_ID,
  unit: "page",
  unit_count: 12,
  units: [
    { number: 3, title: null, text: "Page three\n\nbody", truncated: false, extractor: "pymupdf4llm" },
    { number: 4, title: null, text: "Page fo", truncated: false, extractor: "fitz_fallback" },
  ],
  next: { start: 4, offset: 7 },
};

const FIVE_FORMATS = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/epub+zip",
];

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

describe("read_document schema (SPEC-CORE-019)", () => {
  it("SPEC-CORE-019: takes a drive and a non-empty file_id, both required", () => {
    const schema = schemaOf("read_document");
    expect(schema.safeParse({ drive: DRIVE, file_id: FILE_ID }).success).toBe(true);
    expect(schema.safeParse({ drive: DRIVE, file_id: "" }).success).toBe(false);
    expect(schema.safeParse({ drive: DRIVE }).success).toBe(false);
    expect(schema.safeParse({ file_id: FILE_ID }).success).toBe(false);
  });

  it.each([
    ["start", [1, 2, 10_000], [0, -1, 1.5]],
    ["count", [1, 10, 200], [0, 201, 2.5]],
    ["offset", [0, 1, 1_000_000], [-1, 0.5]],
    ["max_chars", [1, 50_000, 200_000], [0, 200_001, 10.5]],
  ] as const)(
    "SPEC-CORE-019: %s accepts its bounds and refuses values outside them",
    (key, accepted, refused) => {
      const schema = schemaOf("read_document");
      const base = { drive: DRIVE, file_id: FILE_ID };
      for (const value of accepted) {
        expect(schema.safeParse({ ...base, [key]: value }).success, `${key} ${value}`).toBe(true);
      }
      for (const value of refused) {
        expect(schema.safeParse({ ...base, [key]: value }).success, `${key} ${value}`).toBe(false);
      }
    }
  );
});

describe("read_document requests (SPEC-CORE-019)", () => {
  it("SPEC-CORE-019 I10: sends GET to the document-text route through the addon proxy with X-Lit-Drive", async () => {
    const client = fakeClient(async () => BODY);
    await findTool("read_document").handler({ drive: DRIVE, file_id: FILE_ID }, client);

    const call = onlyCall(client);
    expect(call.method).toBe("GET");
    expect(requestedUrl(call).pathname).toBe(DOCUMENT_PATH);
    expect(call.options?.headers).toEqual({ "X-Lit-Drive": DRIVE });
  });

  it("SPEC-CORE-019: leaves count to the endpoint's per-format default when it is not given", async () => {
    const client = fakeClient(async () => BODY);
    await findTool("read_document").handler({ drive: DRIVE, file_id: FILE_ID }, client);

    const params = sentParams(onlyCall(client));
    expect(params).not.toHaveProperty("count");
    const defaults: Record<string, string> = { start: "1", offset: "0", max_chars: "50000" };
    for (const [key, value] of Object.entries(params)) {
      expect(defaults[key], `unexpected parameter ${key}`).toBe(value);
    }
  });

  it.each([
    [{ start: 3 }, { start: "3" }],
    [{ count: 200 }, { count: "200" }],
    [{ offset: 0 }, { offset: "0" }],
    [{ max_chars: 1 }, { max_chars: "1" }],
    [
      { start: 4, count: 2, offset: 7, max_chars: 200_000 },
      { start: "4", count: "2", offset: "7", max_chars: "200000" },
    ],
  ])("SPEC-CORE-019: sends the cursor and limits given (%o)", async (args, expected) => {
    const client = fakeClient(async () => BODY);
    await findTool("read_document").handler({ drive: DRIVE, file_id: FILE_ID, ...args }, client);

    expect(sentParams(onlyCall(client))).toMatchObject(expected);
  });

  it("SPEC-CORE-019 I10: percent-encodes the drive in X-Lit-Drive", async () => {
    const client = fakeClient(async () => BODY);
    await findTool("read_document").handler({ drive: "動画 2", file_id: FILE_ID }, client);

    expect(onlyCall(client).options?.headers).toEqual({
      "X-Lit-Drive": encodeURIComponent("動画 2"),
    });
  });

  it("SPEC-CORE-019 I10: returns the endpoint's body as compact JSON, unchanged", async () => {
    const client = fakeClient(async () => BODY);
    const out = await run("read_document", { drive: DRIVE, file_id: FILE_ID }, client);

    expect(out.isError).toBe(false);
    expect(out.text).toBe(JSON.stringify(BODY));
  });

  it.each([
    [new LitloftApiError(404, { detail: "File not found" }), "Litloft API error (404): File not found"],
    [new LitloftApiError(415, { detail: "Unsupported type" }), "Litloft API error (415): Unsupported type"],
    [new LitloftApiError(422, { detail: "Document could not be read" }), "Litloft API error (422): Document could not be read"],
    [new LitloftApiError(429, { detail: "Document reader busy" }), "Litloft API error (429): Document reader busy"],
    [new LitloftApiError(502, { detail: "Addon service unavailable" }), "Litloft API error (502): Addon service unavailable"],
  ])("SPEC-CORE-019: a non-2xx response is an error result with its status and detail (%s)", async (error, text) => {
    const client = fakeClient(async () => {
      throw error;
    });
    const out = await run("read_document", { drive: DRIVE, file_id: FILE_ID }, client);

    expect(out.isError).toBe(true);
    expect(out.text).toBe(text);
  });
});

describe("read_document description (SPEC-CORE-019)", () => {
  it("SPEC-CORE-019: names the formats, the cursor, the retryable statuses and the tool for text files", () => {
    const description = findTool("read_document").description;
    for (const word of ["PDF", "EPUB", "next", "count", "502", "429", "404", "get_file_content"]) {
      expect(description, word).toContain(word);
    }
    expect(description).toMatch(/docx|Word/);
    expect(description).toMatch(/xlsx|spreadsheet|Excel/i);
    expect(description).toMatch(/pptx|slide|PowerPoint/i);
    expect(description).toMatch(/scan/i);
  });
});

describe("read_document over MCP (SPEC-CORE-019)", () => {
  async function callOverMcp(fake: Fake, args: Record<string, unknown>) {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createLitloftServer(fake);
    const client = new Client({ name: "litloft-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const listed = (await client.listTools()).tools.some((t) => t.name === "read_document");
      expect(listed, "read_document is registered").toBe(true);
      try {
        return await client.callTool({ name: "read_document", arguments: args });
      } catch (error) {
        return { rejected: error };
      }
    } finally {
      await client.close();
    }
  }

  it.each([
    [{ drive: DRIVE, file_id: "" }],
    [{ drive: DRIVE, file_id: FILE_ID, start: 0 }],
    [{ drive: DRIVE, file_id: FILE_ID, count: 201 }],
    [{ drive: DRIVE, file_id: FILE_ID, offset: -1 }],
    [{ drive: DRIVE, file_id: FILE_ID, max_chars: 200_001 }],
  ])("SPEC-CORE-019: %o is rejected before any request", async (args) => {
    const fake = fakeClient(async () => BODY);
    const result = (await callOverMcp(fake, args)) as { isError?: boolean; rejected?: unknown };

    expect(result.rejected !== undefined || result.isError === true).toBe(true);
    expect(allRequests(fake)).toEqual([]);
  });

  it("SPEC-CORE-019: valid arguments reach the document-text route over MCP", async () => {
    const fake = fakeClient(async () => BODY);
    const result = (await callOverMcp(fake, { drive: DRIVE, file_id: FILE_ID })) as { isError?: boolean };

    expect(result.isError).not.toBe(true);
    expect(fake.calls.map((c) => requestedUrl(c).pathname)).toEqual([DOCUMENT_PATH]);
  });
});

describe("get_file_content refusal points at read_document (SPEC-CORE-019)", () => {
  function metaOnly(mime: string): Fake {
    return fakeClient(async (call) => {
      if (call.method === "GET" && call.path === `/api/files/${FILE_ID}`) {
        return { id: FILE_ID, mime_type: mime, file_size: 10 };
      }
      throw new Error(`unexpected request ${call.method} ${call.path}`);
    });
  }

  it.each(FIVE_FORMATS)("SPEC-CORE-019 I10: refuses %s naming read_document and the mime", async (mime) => {
    const client = metaOnly(mime);
    const out = await run("get_file_content", { file_id: FILE_ID }, client);

    expect(out.isError).toBe(true);
    expect(isOneLine(out.text)).toBe(true);
    expect(out.text).toContain(mime);
    expect(out.text).toContain("read_document");
    expect(client.bytesCalls).toEqual([]);
  });

  it.each(["video/mp4", "image/png", "application/octet-stream", "application/msword", "application/zip"])(
    "SPEC-CORE-019 I10: refuses %s without naming read_document",
    async (mime) => {
      const client = metaOnly(mime);
      const out = await run("get_file_content", { file_id: FILE_ID }, client);

      expect(out.isError).toBe(true);
      expect(out.text).toContain(mime);
      expect(out.text).not.toContain("read_document");
    }
  );
});
