import { describe, expect, it } from "vitest";
import { LitloftApiError } from "../client.js";
import { fakeClient } from "./testClient.js";
import {
  FILE_ID,
  MB,
  allRequests,
  isOneLine,
  run,
  schemaOf,
  type Fake,
} from "./toolHarness.js";

const META_PATH = `/api/files/${FILE_ID}`;
const STREAM_PATH = `/api/files/${FILE_ID}/stream`;
const CONTENT_PATH = `/api/files/${FILE_ID}/content`;
const BOM = [0xef, 0xbb, 0xbf];

interface Setup {
  mime_type?: string;
  file_size?: number;
  body?: Uint8Array | string;
  etag?: string | null;
  putEtag?: string;
  putError?: Error;
}

function bytesOf(body: Uint8Array | string): Uint8Array {
  return typeof body === "string" ? new TextEncoder().encode(body) : body;
}

function contentClient(setup: Setup): Fake {
  const body = bytesOf(setup.body ?? "");
  const meta = {
    id: FILE_ID,
    mime_type: setup.mime_type ?? "text/markdown",
    file_size: setup.file_size ?? body.length,
  };
  return fakeClient(
    async (call) => {
      if (call.method === "GET" && call.path === META_PATH) return meta;
      throw new Error(`unexpected JSON request ${call.method} ${call.path}`);
    },
    async (call) => {
      if (call.method === "PUT" && call.path === CONTENT_PATH) {
        if (setup.putError) throw setup.putError;
        return {
          status: 200,
          headers: new Headers({ ETag: setup.putEtag ?? '"after"' }),
          text: "",
        };
      }
      throw new Error(`unexpected raw request ${call.method} ${call.path}`);
    },
    undefined,
    undefined,
    async (call) => {
      if (call.method === "GET" && call.path === STREAM_PATH) {
        return { bytes: body, contentType: meta.mime_type, etag: setup.etag ?? null };
      }
      throw new Error(`unexpected bytes request ${call.method} ${call.path}`);
    }
  );
}

function streamRequests(client: Fake) {
  return allRequests(client).filter((r) => r.path === STREAM_PATH);
}

function puts(client: Fake) {
  return client.rawCalls.filter((c) => c.method === "PUT");
}

function lowerHeaders(headers: Record<string, string> | undefined) {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
  );
}

describe("get_file_content full read (SPEC-CORE-010)", () => {
  it("SPEC-CORE-010 I1: returns the decoded text and the stream's ETag over requestBytes", async () => {
    const client = contentClient({ body: "# hello\n", etag: '"abc"' });
    const out = await run("get_file_content", { file_id: FILE_ID }, client);
    expect(out.isError).toBe(false);
    expect(JSON.parse(out.text)).toEqual({ content: "# hello\n", etag: '"abc"' });
    expect(client.bytesCalls.map((c) => [c.method, c.path])).toEqual([["GET", STREAM_PATH]]);
    expect(client.rawCalls).toEqual([]);
  });

  it("SPEC-CORE-010 I1: a leading byte-order mark is kept as U+FEFF and re-encodes to the stored bytes", async () => {
    const stored = new Uint8Array([...BOM, ...new TextEncoder().encode("# 見出し\r\nbody")]);
    const client = contentClient({ body: stored, etag: '"bom"' });
    const out = await run("get_file_content", { file_id: FILE_ID }, client);
    const parsed = JSON.parse(out.text);
    expect(parsed.content.charCodeAt(0)).toBe(0xfeff);
    expect(Array.from(new TextEncoder().encode(parsed.content))).toEqual(Array.from(stored));
    expect(parsed.etag).toBe('"bom"');
  });

  it.each([
    ["text/csv", "a,b\n1,2\n"],
    ["text/html", "<p>x</p>"],
    ["text/x-python", "print(1)\n"],
    ["application/json", '{"a":1}'],
  ])("SPEC-CORE-010: reads a %s file, with a null ETag when the stream sends none", async (mime, body) => {
    const client = contentClient({ mime_type: mime, body, etag: null });
    const out = await run("get_file_content", { file_id: FILE_ID }, client);
    expect(out.isError).toBe(false);
    expect(JSON.parse(out.text)).toEqual({ content: body, etag: null });
  });

  it("SPEC-CORE-010: invalid UTF-8 bytes come back as U+FFFD", async () => {
    const client = contentClient({
      mime_type: "text/plain",
      body: new Uint8Array([0x61, 0xff, 0x62]),
      etag: '"x"',
    });
    const out = await run("get_file_content", { file_id: FILE_ID }, client);
    expect(JSON.parse(out.text).content).toBe("a�b");
  });

  it("SPEC-CORE-010: a file of exactly 1 MB is read whole without a range", async () => {
    const body = "x".repeat(MB);
    const client = contentClient({ mime_type: "text/plain", body, etag: '"e"' });
    const out = await run("get_file_content", { file_id: FILE_ID }, client);
    expect(out.isError).toBe(false);
    expect(JSON.parse(out.text).content.length).toBe(MB);
  });
});

describe("get_file_content refusals (SPEC-CORE-010)", () => {
  it.each(["video/mp4", "image/png", "application/octet-stream", "application/pdf"])(
    "SPEC-CORE-010 I3: refuses %s as a one-line error naming the mime, with no /stream request",
    async (mime) => {
      const client = contentClient({ mime_type: mime, file_size: 10 });
      const out = await run("get_file_content", { file_id: FILE_ID }, client);
      expect(out.isError).toBe(true);
      expect(isOneLine(out.text)).toBe(true);
      expect(out.text).toContain(mime);
      expect(streamRequests(client)).toEqual([]);
    }
  );

  it.each([{}, { offset: 1 }, { limit: 5 }])(
    "SPEC-CORE-010 I3: refuses a file over 10 MB naming size and limit, with no /stream request (%o)",
    async (range) => {
      const size = 10 * MB + 1;
      const client = contentClient({ mime_type: "text/plain", file_size: size });
      const out = await run("get_file_content", { file_id: FILE_ID, ...range }, client);
      expect(out.isError).toBe(true);
      expect(isOneLine(out.text)).toBe(true);
      expect(out.text).toContain(String(size));
      expect(out.text).toContain(String(10 * MB));
      expect(streamRequests(client)).toEqual([]);
    }
  );

  it("SPEC-CORE-010 I3: refuses a file over 1 MB without a range, pointing at offset/limit, with no /stream request", async () => {
    const client = contentClient({ mime_type: "text/markdown", file_size: MB + 1 });
    const out = await run("get_file_content", { file_id: FILE_ID }, client);
    expect(out.isError).toBe(true);
    expect(isOneLine(out.text)).toBe(true);
    expect(out.text).toMatch(/offset|limit/);
    expect(streamRequests(client)).toEqual([]);
  });

  it.each([{ offset: 1 }, { limit: 3 }])(
    "SPEC-CORE-010: a file over 1 MB and up to 10 MB is read when a range is given (%o)",
    async (range) => {
      const body = "line\n".repeat(Math.ceil((10 * MB) / 5));
      const client = contentClient({ mime_type: "text/plain", body: body.slice(0, 10 * MB) });
      const out = await run("get_file_content", { file_id: FILE_ID, ...range }, client);
      expect(out.isError).toBe(false);
      expect(streamRequests(client)).toHaveLength(1);
    }
  );

  it("SPEC-CORE-010: a full read whose downloaded body exceeds 1 MB is refused and returns none of it", async () => {
    const body = "Z".repeat(MB + 1);
    const client = contentClient({ mime_type: "text/plain", file_size: 10, body, etag: '"e"' });
    const out = await run("get_file_content", { file_id: FILE_ID }, client);
    expect(out.isError).toBe(true);
    expect(isOneLine(out.text)).toBe(true);
    expect(out.text).toContain(String(MB + 1));
    expect(out.text).not.toContain("ZZZZ");
  });

  it("SPEC-CORE-010: a ranged read whose downloaded body exceeds 10 MB is refused and returns none of it", async () => {
    const body = "Z".repeat(10 * MB + 1);
    const client = contentClient({ mime_type: "text/plain", file_size: 10, body });
    const out = await run("get_file_content", { file_id: FILE_ID, offset: 1, limit: 1 }, client);
    expect(out.isError).toBe(true);
    expect(out.text).toContain(String(10 * MB + 1));
    expect(out.text).not.toContain("ZZZZ");
  });

  it("SPEC-CORE-010: refuses when the first requested line alone exceeds 1 MB, naming the line", async () => {
    const body = "a\nb\nc\nd\ne\nf\n" + "L".repeat(MB + 1) + "\nh\n";
    const client = contentClient({ mime_type: "text/plain", body });
    const out = await run("get_file_content", { file_id: FILE_ID, offset: 7 }, client);
    expect(out.isError).toBe(true);
    expect(isOneLine(out.text)).toBe(true);
    expect(out.text).toMatch(/\b7\b/);
    expect(out.text).not.toContain("LLLL");
  });

  it("SPEC-CORE-010: the schema takes offset and limit only as integers >= 1", () => {
    const schema = schemaOf("get_file_content");
    const base = { file_id: FILE_ID };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, offset: 1, limit: 1 }).success).toBe(true);
    expect(schema.safeParse({ ...base, offset: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...base, limit: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...base, offset: -1 }).success).toBe(false);
    expect(schema.safeParse({ ...base, offset: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ ...base, limit: 2.5 }).success).toBe(false);
  });
});

describe("get_file_content ranged read (SPEC-CORE-010)", () => {
  // Lines: "a\n", "b\r\n", "c\n", "\n", "d" (the last has no terminator).
  const TEXT = "a\nb\r\nc\n\nd";

  async function ranged(args: Record<string, unknown>, body: Uint8Array | string = TEXT) {
    const client = contentClient({ mime_type: "text/plain", body, etag: '"would-be"' });
    const out = await run("get_file_content", { file_id: FILE_ID, ...args }, client);
    expect(out.isError).toBe(false);
    return JSON.parse(out.text);
  }

  it.each([
    [{ offset: 2, limit: 2 }, { content: "b\r\nc\n", start_line: 2, end_line: 3 }],
    [{ offset: 4 }, { content: "\nd", start_line: 4, end_line: 5 }],
    [{ limit: 1 }, { content: "a\n", start_line: 1, end_line: 1 }],
    [{ offset: 5, limit: 10 }, { content: "d", start_line: 5, end_line: 5 }],
    [{ offset: 1 }, { content: TEXT, start_line: 1, end_line: 5 }],
  ])(
    "SPEC-CORE-010 I2: %o returns those lines with terminators, a null ETag and the total",
    async (args, expected) => {
      expect(await ranged(args)).toEqual({
        ...expected,
        etag: null,
        total_lines: 5,
        truncated: false,
      });
    }
  );

  it.each([
    [6, 5],
    [100, 5],
  ])("SPEC-CORE-010: offset %i past the last line returns empty content ending at offset - 1", async (offset, total) => {
    expect(await ranged({ offset })).toEqual({
      content: "",
      etag: null,
      start_line: offset,
      end_line: offset - 1,
      total_lines: total,
      truncated: false,
    });
  });

  it("SPEC-CORE-010: empty text has 0 lines", async () => {
    expect(await ranged({ offset: 1 }, "")).toEqual({
      content: "",
      etag: null,
      start_line: 1,
      end_line: 0,
      total_lines: 0,
      truncated: false,
    });
  });

  it("SPEC-CORE-010: a text ending in a terminator has no extra empty last line", async () => {
    const parsed = await ranged({ offset: 1 }, "x\ny\n");
    expect(parsed.total_lines).toBe(2);
    expect(parsed.content).toBe("x\ny\n");
  });

  it("SPEC-CORE-010 I2: stops before the line that would take content past 1 MB of UTF-8 and reports truncated", async () => {
    // Each line is 200,000 three-byte characters plus "\n": two lines are over 1 MB as UTF-8
    // while their JavaScript string length is well under it.
    const line = "あ".repeat(200_000) + "\n";
    const parsed = await ranged({ offset: 1 }, line.repeat(3));
    expect(parsed.start_line).toBe(1);
    expect(parsed.end_line).toBe(1);
    expect(parsed.total_lines).toBe(3);
    expect(parsed.truncated).toBe(true);
    expect(parsed.content).toBe(line);
    expect(parsed.etag).toBeNull();
  });

  it("SPEC-CORE-010: content may reach exactly 1 MB; truncated is true only when the bound, not limit, stopped it", async () => {
    const half = "h".repeat(MB / 2 - 1) + "\n";
    const parsed = await ranged({ offset: 1 }, half + half + "tail\n");
    expect(parsed.end_line).toBe(2);
    expect(new TextEncoder().encode(parsed.content).length).toBe(MB);
    expect(parsed.truncated).toBe(true);
    const withLimit = await ranged({ offset: 1, limit: 2 }, half + half + "tail\n");
    expect(withLimit.end_line).toBe(2);
    expect(withLimit.truncated).toBe(false);
  });

  it("SPEC-CORE-010 I2: reading range after range from end_line + 1 rebuilds the decoded text with a stable total", async () => {
    const big = "あ".repeat(150_000) + "\r\n";
    const parts = [
      "first\n",
      big,
      big,
      "mid\r\n",
      "\n",
      big,
      "ends without terminator",
    ];
    const text = "﻿" + parts.join("");
    const stored = new Uint8Array([...BOM, ...new TextEncoder().encode(parts.join(""))]);
    let offset = 1;
    let rebuilt = "";
    const totals = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const parsed = await ranged({ offset, limit: 10 }, stored);
      totals.add(parsed.total_lines);
      expect(parsed.start_line).toBe(offset);
      expect(new TextEncoder().encode(parsed.content).length).toBeLessThanOrEqual(MB);
      rebuilt += parsed.content;
      if (parsed.end_line >= parsed.total_lines) break;
      offset = parsed.end_line + 1;
    }
    expect(rebuilt).toBe(text);
    expect([...totals]).toEqual([7]);
  });
});

describe("edit_file_content (SPEC-CORE-011)", () => {
  it("SPEC-CORE-011 I4 I5: replaces the single occurrence and PUTs the text with If-Match of the read", async () => {
    const client = contentClient({
      body: "# Title\nhello world\nbye\n",
      etag: '"read-etag"',
      putEtag: '"stored-etag"',
    });
    const out = await run(
      "edit_file_content",
      { file_id: FILE_ID, old_string: "hello world", new_string: "hi there" },
      client
    );
    expect(out.isError).toBe(false);
    expect(JSON.parse(out.text)).toEqual({ etag: '"stored-etag"', replacements: 1 });
    const sent = puts(client);
    expect(sent).toHaveLength(1);
    expect(sent[0].path).toBe(CONTENT_PATH);
    expect(sent[0].options?.body).toBe("# Title\nhi there\nbye\n");
    const headers = lowerHeaders(sent[0].options?.headers);
    expect(headers["if-match"]).toBe('"read-etag"');
    expect(headers["content-type"]).toBe("text/plain");
    expect(headers).not.toHaveProperty("x-litloft-save-kind");
    expect(allRequests(client).length).toBeLessThanOrEqual(3);
  });

  it("SPEC-CORE-011 I4: replace_all replaces every non-overlapping occurrence, scanning left to right", async () => {
    const client = contentClient({ mime_type: "text/plain", body: "aaaaa|aa", etag: '"e"' });
    const out = await run(
      "edit_file_content",
      { file_id: FILE_ID, old_string: "aa", new_string: "B", replace_all: true },
      client
    );
    expect(JSON.parse(out.text).replacements).toBe(3);
    expect(puts(client)[0].options?.body).toBe("BBa|B");
  });

  it("SPEC-CORE-011: occurrences are counted without overlap, so 'aaa' holds 'aa' once", async () => {
    const client = contentClient({ mime_type: "text/plain", body: "aaa", etag: '"e"' });
    const out = await run(
      "edit_file_content",
      { file_id: FILE_ID, old_string: "aa", new_string: "X" },
      client
    );
    expect(out.isError).toBe(false);
    expect(puts(client)[0].options?.body).toBe("Xa");
  });

  it("SPEC-CORE-011 I4: old_string and new_string are literal, with no pattern or $ substitution", async () => {
    const client = contentClient({ mime_type: "text/plain", body: "axb a.b (x)", etag: '"e"' });
    const out = await run(
      "edit_file_content",
      { file_id: FILE_ID, old_string: "a.b", new_string: "$&-$1-$$-$'" },
      client
    );
    expect(out.isError).toBe(false);
    expect(puts(client)[0].options?.body).toBe("axb $&-$1-$$-$' (x)");
  });

  it("SPEC-CORE-011 I4: a leading byte-order mark and the rest of the text are left unchanged", async () => {
    const stored = new Uint8Array([...BOM, ...new TextEncoder().encode("one\r\ntwo\r\n")]);
    const client = contentClient({ mime_type: "text/plain", body: stored, etag: '"e"' });
    await run(
      "edit_file_content",
      { file_id: FILE_ID, old_string: "two", new_string: "2" },
      client
    );
    expect(puts(client)[0].options?.body).toBe("﻿one\r\n2\r\n");
  });

  it.each([
    [{ old_string: "", new_string: "x" }],
    [{ old_string: "same", new_string: "same" }],
  ])("SPEC-CORE-011: %o is refused as an error before any request", async (args) => {
    const client = contentClient({ body: "same", etag: '"e"' });
    const out = await run("edit_file_content", { file_id: FILE_ID, ...args }, client);
    expect(out.isError).toBe(true);
    expect(isOneLine(out.text)).toBe(true);
    expect(allRequests(client)).toEqual([]);
  });

  it.each([
    ["text/csv", 10],
    ["application/json", 10],
    ["text/html", 10],
    ["image/png", 10],
    ["text/markdown", MB + 1],
    ["text/plain", MB + 1],
  ])("SPEC-CORE-011 I4: %s of %i bytes is refused with no /stream request and no PUT", async (mime, size) => {
    const client = contentClient({ mime_type: mime, file_size: size, body: "x", etag: '"e"' });
    const out = await run(
      "edit_file_content",
      { file_id: FILE_ID, old_string: "x", new_string: "y" },
      client
    );
    expect(out.isError).toBe(true);
    expect(isOneLine(out.text)).toBe(true);
    expect(streamRequests(client)).toEqual([]);
    expect(puts(client)).toEqual([]);
  });

  it("SPEC-CORE-011: a Markdown file of exactly 1 MB is editable", async () => {
    const body = "x".repeat(MB - 1) + "y";
    const client = contentClient({ body, etag: '"e"' });
    const out = await run(
      "edit_file_content",
      { file_id: FILE_ID, old_string: "y", new_string: "z" },
      client
    );
    expect(out.isError).toBe(false);
    expect(puts(client)).toHaveLength(1);
  });

  it("SPEC-CORE-011 I4: a body that is not valid UTF-8 is refused with no PUT", async () => {
    const client = contentClient({
      mime_type: "text/plain",
      body: new Uint8Array([0x61, 0x62, 0xff, 0x63]),
      etag: '"e"',
    });
    const out = await run(
      "edit_file_content",
      { file_id: FILE_ID, old_string: "ab", new_string: "AB" },
      client
    );
    expect(out.isError).toBe(true);
    expect(isOneLine(out.text)).toBe(true);
    expect(puts(client)).toEqual([]);
  });

  it("SPEC-CORE-011 I4: a stream response without an ETag is refused with no PUT", async () => {
    const client = contentClient({ mime_type: "text/plain", body: "abc", etag: null });
    const out = await run(
      "edit_file_content",
      { file_id: FILE_ID, old_string: "b", new_string: "B" },
      client
    );
    expect(out.isError).toBe(true);
    expect(isOneLine(out.text)).toBe(true);
    expect(puts(client)).toEqual([]);
  });

  it("SPEC-CORE-011 I4: old_string not found is the error 'old_string not found' with no PUT", async () => {
    const client = contentClient({ mime_type: "text/plain", body: "abc", etag: '"e"' });
    const out = await run(
      "edit_file_content",
      { file_id: FILE_ID, old_string: "zzz", new_string: "y" },
      client
    );
    expect(out.isError).toBe(true);
    expect(out.text).toContain("old_string not found");
    expect(puts(client)).toEqual([]);
  });

  it("SPEC-CORE-011 I4: several occurrences without replace_all is an error naming the count and replace_all, with no PUT", async () => {
    const client = contentClient({ mime_type: "text/plain", body: "x x x", etag: '"e"' });
    const out = await run(
      "edit_file_content",
      { file_id: FILE_ID, old_string: "x", new_string: "y" },
      client
    );
    expect(out.isError).toBe(true);
    expect(isOneLine(out.text)).toBe(true);
    expect(out.text).toMatch(/\b3\b/);
    expect(out.text).toContain("replace_all");
    expect(puts(client)).toEqual([]);
  });

  it.each([
    [412, "ETag mismatch"],
    [413, "Content too large"],
  ])("SPEC-CORE-011: a backend %i on the PUT is an error result carrying the detail %s", async (status, detail) => {
    const client = contentClient({
      mime_type: "text/plain",
      body: "abc",
      etag: '"e"',
      putError: new LitloftApiError(status, { detail }),
    });
    const out = await run(
      "edit_file_content",
      { file_id: FILE_ID, old_string: "b", new_string: "B" },
      client
    );
    expect(out.isError).toBe(true);
    expect(out.text).toBe(`Litloft API error (${status}): ${detail}`);
  });
});
