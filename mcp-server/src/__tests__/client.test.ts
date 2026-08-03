import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createLitloftClient, LitloftApiError } from "../client.js";

const BASE_URL = "http://litloft.test:3000";
const TOKEN = "test-jwt-token";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("createLitloftClient", () => {
  it("sends the token as an Authorization: Bearer header", async () => {
    let seenAuth: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/drives`, ({ request }) => {
        seenAuth = request.headers.get("Authorization");
        return HttpResponse.json([]);
      })
    );
    const client = createLitloftClient({ baseUrl: BASE_URL, token: TOKEN });
    await client.request("GET", "/api/drives");
    expect(seenAuth).toBe(`Bearer ${TOKEN}`);
  });

  it("joins baseUrl and path without double slashes", async () => {
    let seenUrl = "";
    server.use(
      http.get(`${BASE_URL}/api/drives`, ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json([]);
      })
    );
    const client = createLitloftClient({ baseUrl: `${BASE_URL}/`, token: TOKEN });
    await client.request("GET", "/api/drives");
    expect(seenUrl).toBe(`${BASE_URL}/api/drives`);
  });

  it("serializes query params", async () => {
    let seenSearch = "";
    server.use(
      http.get(`${BASE_URL}/api/files`, ({ request }) => {
        seenSearch = new URL(request.url).search;
        return HttpResponse.json([]);
      })
    );
    const client = createLitloftClient({ baseUrl: BASE_URL, token: TOKEN });
    await client.request("GET", "/api/files", {
      query: { drive: "media", q: "cats" },
    });
    const params = new URLSearchParams(seenSearch);
    expect(params.get("drive")).toBe("media");
    expect(params.get("q")).toBe("cats");
  });

  it("sends a JSON body with the correct content type on write requests", async () => {
    let seenContentType: string | null = null;
    let seenBody: unknown = null;
    server.use(
      http.put(`${BASE_URL}/api/files/42/content`, async ({ request }) => {
        seenContentType = request.headers.get("Content-Type");
        seenBody = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );
    const client = createLitloftClient({ baseUrl: BASE_URL, token: TOKEN });
    await client.request("PUT", "/api/files/42/content", {
      json: { content: "hello" },
    });
    expect(seenContentType).toContain("application/json");
    expect(seenBody).toEqual({ content: "hello" });
  });

  it("sends custom headers passed via options.headers (e.g. X-Lit-Drive)", async () => {
    let seenDrive: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/addons/intelligence/search`, ({ request }) => {
        seenDrive = request.headers.get("X-Lit-Drive");
        return HttpResponse.json({ results: [] });
      })
    );
    const client = createLitloftClient({ baseUrl: BASE_URL, token: TOKEN });
    await client.request("GET", "/api/addons/intelligence/search", {
      headers: { "X-Lit-Drive": "media" },
    });
    expect(seenDrive).toBe("media");
  });

  it("returns the parsed JSON response body on success", async () => {
    server.use(
      http.get(`${BASE_URL}/api/drives`, () =>
        HttpResponse.json([{ name: "media" }])
      )
    );
    const client = createLitloftClient({ baseUrl: BASE_URL, token: TOKEN });
    const result = await client.request<{ name: string }[]>("GET", "/api/drives");
    expect(result).toEqual([{ name: "media" }]);
  });

  it("sends X-Lit-Viewer when configured", async () => {
    let seenViewer: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/drives`, ({ request }) => {
        seenViewer = request.headers.get("X-Lit-Viewer");
        return HttpResponse.json([]);
      })
    );
    const client = createLitloftClient({
      baseUrl: BASE_URL,
      token: TOKEN,
      viewer: "alice",
    });
    await client.request("GET", "/api/drives");
    expect(seenViewer).toBe("alice");
  });

  it("requestSse parses event names, multi-line data, and trailing unterminated data", async () => {
    server.use(
      http.post(`${BASE_URL}/api/addons/intelligence/ask`, () =>
        HttpResponse.text(
          [
            "event: answer_chunk",
            "data: {\"delta\":\"hello\"}",
            "data: \" world\"",
            "",
            "event: done",
            "data: {\"took_ms\": 1}",
          ].join("\n"),
          { headers: { "Content-Type": "text/event-stream" } }
        )
      )
    );
    const client = createLitloftClient({ baseUrl: BASE_URL, token: TOKEN });
    const events = await client.requestSse(
      "POST",
      "/api/addons/intelligence/ask",
      { maxEvents: 10 }
    );
    expect(events).toEqual([
      { event: "answer_chunk", data: "{\"delta\":\"hello\"}\n\" world\"" },
      { event: "done", data: { took_ms: 1 } },
    ]);
  });

  it("requestSse stops when the event cap is exceeded", async () => {
    server.use(
      http.post(`${BASE_URL}/api/addons/intelligence/ask`, () =>
        HttpResponse.text(
          [
            "event: answer_chunk",
            "data: {\"delta\":\"a\"}",
            "",
            "event: answer_chunk",
            "data: {\"delta\":\"b\"}",
            "",
          ].join("\n"),
          { headers: { "Content-Type": "text/event-stream" } }
        )
      )
    );
    const client = createLitloftClient({ baseUrl: BASE_URL, token: TOKEN });
    await expect(
      client.requestSse("POST", "/api/addons/intelligence/ask", {
        maxEvents: 1,
      })
    ).rejects.toThrow("SSE event limit exceeded");
  });

  it("requestMultipart sends a FormData body and returns the parsed JSON response", async () => {
    let seenIndex: string | null = null;
    let seenFilename: string | undefined;
    let seenContentType: string | null = null;
    server.use(
      http.post(
        `${BASE_URL}/api/drives/media/upload/up1/chunk`,
        async ({ request }) => {
          seenContentType = request.headers.get("Content-Type");
          const form = await request.formData();
          seenIndex = form.get("chunk_index") as string;
          const chunk = form.get("chunk") as File;
          seenFilename = chunk.name;
          return HttpResponse.json({ chunk_index: 0, received_chunks: 1, total_chunks: 1 });
        }
      )
    );
    const client = createLitloftClient({ baseUrl: BASE_URL, token: TOKEN });
    const form = new FormData();
    form.append("chunk_index", "0");
    form.append("chunk", new Blob([new Uint8Array([1, 2, 3])]), "note.md");
    const result = await client.requestMultipart(
      "POST",
      "/api/drives/media/upload/up1/chunk",
      form
    );
    expect(seenIndex).toBe("0");
    expect(seenFilename).toBe("note.md");
    expect(seenContentType).toContain("multipart/form-data");
    expect(result).toEqual({ chunk_index: 0, received_chunks: 1, total_chunks: 1 });
  });

  it("requestMultipart throws LitloftApiError on a non-2xx response", async () => {
    server.use(
      http.post(`${BASE_URL}/api/drives/media/upload/up1/chunk`, () =>
        HttpResponse.json({ detail: "bad chunk" }, { status: 400 })
      )
    );
    const client = createLitloftClient({ baseUrl: BASE_URL, token: TOKEN });
    await expect(
      client.requestMultipart("POST", "/api/drives/media/upload/up1/chunk", new FormData())
    ).rejects.toBeInstanceOf(LitloftApiError);
  });

  it("requestRaw returns status, headers, and raw text on success", async () => {
    server.use(
      http.get(`${BASE_URL}/api/files/abc/stream`, () =>
        HttpResponse.text("hello world", {
          headers: { ETag: '"deadbeef"', "Content-Type": "text/plain" },
        })
      )
    );
    const client = createLitloftClient({ baseUrl: BASE_URL, token: TOKEN });
    const res = await client.requestRaw("GET", "/api/files/abc/stream");
    expect(res.status).toBe(200);
    expect(res.text).toBe("hello world");
    expect(res.headers.get("ETag")).toBe('"deadbeef"');
  });

  it("requestRaw sends a raw text body and custom headers", async () => {
    let seenBody = "";
    let seenIfMatch: string | null = null;
    let seenContentType: string | null = null;
    server.use(
      http.put(`${BASE_URL}/api/files/abc/content`, async ({ request }) => {
        seenBody = await request.text();
        seenIfMatch = request.headers.get("If-Match");
        seenContentType = request.headers.get("Content-Type");
        return HttpResponse.text("", { headers: { ETag: '"newetag"' } });
      })
    );
    const client = createLitloftClient({ baseUrl: BASE_URL, token: TOKEN });
    const res = await client.requestRaw("PUT", "/api/files/abc/content", {
      body: "new content",
      headers: { "If-Match": '"deadbeef"', "Content-Type": "text/plain" },
    });
    expect(seenBody).toBe("new content");
    expect(seenIfMatch).toBe('"deadbeef"');
    expect(seenContentType).toBe("text/plain");
    expect(res.headers.get("ETag")).toBe('"newetag"');
  });

  it("requestRaw throws LitloftApiError on a non-2xx response", async () => {
    server.use(
      http.put(`${BASE_URL}/api/files/abc/content`, () =>
        HttpResponse.json({ detail: "ETag mismatch" }, { status: 412 })
      )
    );
    const client = createLitloftClient({ baseUrl: BASE_URL, token: TOKEN });
    await expect(
      client.requestRaw("PUT", "/api/files/abc/content", { body: "x" })
    ).rejects.toBeInstanceOf(LitloftApiError);
  });

  it("throws LitloftApiError with status and body on a non-2xx response", async () => {
    server.use(
      http.get(`${BASE_URL}/api/drives/secret/files`, () =>
        HttpResponse.json({ detail: "Drive not found: secret" }, { status: 404 })
      )
    );
    const client = createLitloftClient({ baseUrl: BASE_URL, token: TOKEN });
    await expect(
      client.request("GET", "/api/drives/secret/files")
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(LitloftApiError);
      const apiErr = err as LitloftApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.body).toEqual({ detail: "Drive not found: secret" });
      return true;
    });
  });
});
