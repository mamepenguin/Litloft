import { describe, expect, it } from "vitest";
import { LitloftApiError, type LitloftRawResponse } from "../client.js";
import { videoTools } from "../tools/video.js";
import { fakeClient, type RecordedRawCall } from "./testClient.js";

const FILE_ID = "abc123456789";
const DRIVE = "media";
const LOFT_MIME = "application/vnd.litloft.loft+json";
const FILE_PATH = `/api/files/${FILE_ID}`;
const STREAM_PATH = `/api/files/${FILE_ID}/stream`;
const FALLBACK = `${FILE_ID} is a .loft reference; it has no local video to read frames from`;

function findTool(name: string) {
  const tool = videoTools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

type Block = { type: string; text?: string };

function blocks(result: { content: unknown[] }): Block[] {
  return result.content as Block[];
}

function streamOf(text: string): (call: RecordedRawCall) => Promise<LitloftRawResponse> {
  return async () => ({ status: 200, headers: new Headers(), text });
}

function loftClient(rawImpl: (call: RecordedRawCall) => Promise<LitloftRawResponse>) {
  return fakeClient(
    async (call) => {
      if (call.path === FILE_PATH) return { id: FILE_ID, mime_type: LOFT_MIME, duration: 100 };
      throw new Error(`unexpected JSON request ${call.path}`);
    },
    rawImpl
  );
}

type Invoke = (drive: string, client: ReturnType<typeof loftClient>) => ReturnType<
  ReturnType<typeof findTool>["handler"]
>;

const tools: Array<[string, Invoke]> = [
  [
    "get_video_frame",
    (drive, client) => findTool("get_video_frame").handler({ drive, file_id: FILE_ID, t: 1 }, client),
  ],
  [
    "list_video_scenes",
    (drive, client) => findTool("list_video_scenes").handler({ drive, file_id: FILE_ID }, client),
  ],
];

describe.each(tools)("SPEC-CORE-021: %s on a .loft file", (_name, invoke) => {
  it.each(["youtube", "vimeo", "soundcloud", "generic"])(
    "SPEC-CORE-021: names the stored url whatever the provider (%s)",
    async (provider) => {
      const url = "https://example.com/watch?v=a b&t=1#frag";
      const client = loftClient(streamOf(JSON.stringify({ provider, url })));
      const result = await invoke(DRIVE, client);

      expect(result.isError).toBe(true);
      expect(blocks(result)).toEqual([
        {
          type: "text",
          text: `${FILE_ID} is a .loft reference to ${url}; it has no local video to read frames from`,
        },
      ]);
    }
  );

  it("SPEC-CORE-021: reads the file then its stream with no Range or X-Lit-Drive header, and nothing else", async () => {
    const client = loftClient(
      streamOf(JSON.stringify({ provider: "youtube", url: "https://youtu.be/x" }))
    );
    await invoke(DRIVE, client);

    expect(client.calls.map((c) => c.path)).toEqual([FILE_PATH]);
    expect(client.rawCalls).toHaveLength(1);
    const raw = client.rawCalls[0];
    expect(raw.method).toBe("GET");
    expect(raw.path).toBe(STREAM_PATH);
    expect(Object.keys(raw.options?.headers ?? {}).map((k) => k.toLowerCase())).not.toContain("range");
    expect(Object.keys(raw.options?.headers ?? {}).map((k) => k.toLowerCase())).not.toContain(
      "x-lit-drive"
    );
    expect(client.bytesCalls).toEqual([]);
    expect(client.sseCalls).toEqual([]);
  });

  it("SPEC-CORE-021: the result does not depend on the drive argument", async () => {
    const body = JSON.stringify({ provider: "vimeo", url: "https://vimeo.com/1" });
    const a = await invoke(DRIVE, loftClient(streamOf(body)));
    const b = await invoke("other-drive", loftClient(streamOf(body)));
    expect(b).toEqual(a);
    expect(blocks(a)[0].text).toContain("https://vimeo.com/1");
  });

  it.each([
    ["404 from the stream", () => Promise.reject(new LitloftApiError(404, { detail: "File not on disk" }))],
    ["410 from the stream", () => Promise.reject(new LitloftApiError(410, { detail: "File missing" }))],
    ["500 from the stream", () => Promise.reject(new LitloftApiError(500, { detail: "boom" }))],
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
    ["a timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
    ["a body that is not JSON", streamOf("not json")],
    ["an empty body", streamOf("")],
    ["a JSON array", streamOf('[{"url":"https://example.com"}]')],
    ["JSON null", streamOf("null")],
    ["a JSON string", streamOf('"https://example.com"')],
    ["a JSON number", streamOf("7")],
    ["an object without url", streamOf('{"provider":"youtube"}')],
    ["an empty url", streamOf('{"provider":"youtube","url":""}')],
    ["a null url", streamOf('{"provider":"youtube","url":null}')],
    ["a numeric url", streamOf('{"provider":"youtube","url":42}')],
    ["an object url", streamOf('{"provider":"youtube","url":{"href":"https://example.com"}}')],
  ])("SPEC-CORE-021: %s gives the previous message, not an API error", async (_label, rawImpl) => {
    const client = loftClient(rawImpl as (call: RecordedRawCall) => Promise<LitloftRawResponse>);
    const result = await invoke(DRIVE, client);

    expect(result.isError).toBe(true);
    expect(blocks(result)).toEqual([{ type: "text", text: FALLBACK }]);
    expect(client.rawCalls.map((c) => c.path)).toEqual([STREAM_PATH]);
    expect(client.calls.map((c) => c.path)).toEqual([FILE_PATH]);
  });
});

describe("SPEC-CORE-021: get_video_frame checks the .loft before the duration", () => {
  it("SPEC-CORE-021: t past the recorded duration still gives the url", async () => {
    const client = loftClient(streamOf(JSON.stringify({ provider: "generic", url: "https://e.com/v" })));
    const result = await findTool("get_video_frame").handler(
      { drive: DRIVE, file_id: FILE_ID, t: 5000 },
      client
    );
    expect(blocks(result)[0].text).toBe(
      `${FILE_ID} is a .loft reference to https://e.com/v; it has no local video to read frames from`
    );
  });
});
