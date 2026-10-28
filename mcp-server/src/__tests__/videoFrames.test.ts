import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LitloftApiError } from "../client.js";
import { readTools } from "../tools/read.js";
import { fakeClient, type BytesResponse, type RecordedBytesCall } from "./testClient.js";

const FILE_ID = "abc123456789";
const DRIVE = "media";
const LOFT_MIME = "application/vnd.litloft.loft+json";
const FILE_PATH = `/api/files/${FILE_ID}`;
const FRAME_PATH = `/api/addons/intelligence/files/${FILE_ID}/frame`;
const SCENES_PATH = `/api/addons/intelligence/files/${FILE_ID}/scenes`;

function findTool(name: string) {
  const tool = readTools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

// A tool may put the query in the path or in options.query; both reach the same URL.
function requestedUrl(call: {
  path: string;
  options?: { query?: Record<string, unknown> };
}): URL {
  const url = new URL(call.path, "http://litloft.test");
  for (const [key, value] of Object.entries(call.options?.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

function driveHeader(call: { options?: { headers?: Record<string, string> } }) {
  return call.options?.headers?.["X-Lit-Drive"];
}

function frameBytesFor(call: RecordedBytesCall): BytesResponse {
  const url = requestedUrl(call);
  return {
    bytes: new TextEncoder().encode(`frame@${url.searchParams.get("t")}/${url.searchParams.get("size")}`),
    contentType: "image/webp",
  };
}

function base64Of(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function decoded(data: string): string {
  return Buffer.from(data, "base64").toString("utf8");
}

type Block = { type: string; text?: string; data?: string; mimeType?: string };

function blocks(result: { content: unknown[] }): Block[] {
  return result.content as Block[];
}

describe("get_video_frame (SPEC-CORE-008)", () => {
  const videoMeta = { id: FILE_ID, mime_type: "video/mp4", duration: 100 };

  function clientFor(
    meta: unknown,
    bytesImpl: (call: RecordedBytesCall) => Promise<BytesResponse> = async (call) =>
      frameBytesFor(call)
  ) {
    return fakeClient(
      async (call) => {
        if (call.path === FILE_PATH) return meta;
        throw new Error(`unexpected JSON request ${call.path}`);
      },
      undefined,
      undefined,
      undefined,
      bytesImpl
    );
  }

  it("SPEC-CORE-008: the schema takes a finite t >= 0 and size small or large", () => {
    const schema = z.object(findTool("get_video_frame").inputSchema);
    const base = { drive: DRIVE, file_id: FILE_ID };
    expect(schema.safeParse({ ...base, t: 0 }).success).toBe(true);
    expect(schema.safeParse({ ...base, t: 12.5, size: "small" }).success).toBe(true);
    expect(schema.safeParse({ ...base, t: 12.5, size: "large" }).success).toBe(true);
    expect(schema.safeParse({ ...base, t: -0.001 }).success).toBe(false);
    expect(schema.safeParse({ ...base, t: Number.NaN }).success).toBe(false);
    expect(schema.safeParse({ ...base, t: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(schema.safeParse({ ...base, t: 1, size: "medium" }).success).toBe(false);
  });

  it("SPEC-CORE-008: without size, requests a large frame with X-Lit-Drive and returns a text then an image block", async () => {
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0xff, 0x80]);
    const client = clientFor(videoMeta, async () => ({ bytes, contentType: "image/webp" }));
    const result = await findTool("get_video_frame").handler(
      { drive: DRIVE, file_id: FILE_ID, t: 12.5 },
      client
    );

    expect(client.calls.map((c) => [c.method, c.path])).toEqual([["GET", FILE_PATH]]);
    expect(client.bytesCalls).toHaveLength(1);
    const call = client.bytesCalls[0];
    const url = requestedUrl(call);
    expect(call.method).toBe("GET");
    expect(url.pathname).toBe(FRAME_PATH);
    expect(url.searchParams.get("t")).toBe("12.5");
    expect(url.searchParams.get("size")).toBe("large");
    expect(driveHeader(call)).toBe(DRIVE);

    expect(result.isError).not.toBe(true);
    const [text, image, ...rest] = blocks(result);
    expect(rest).toEqual([]);
    expect(text.type).toBe("text");
    expect(JSON.parse(text.text!)).toEqual({ file_id: FILE_ID, t: 12.5, size: "large" });
    expect(image).toEqual({ type: "image", data: base64Of(bytes), mimeType: "image/webp" });
  });

  it("SPEC-CORE-008: size small is passed through to the frame request", async () => {
    const client = clientFor(videoMeta);
    const result = await findTool("get_video_frame").handler(
      { drive: DRIVE, file_id: FILE_ID, t: 3, size: "small" },
      client
    );
    expect(requestedUrl(client.bytesCalls[0]).searchParams.get("size")).toBe("small");
    expect(JSON.parse(blocks(result)[0].text!)).toEqual({ file_id: FILE_ID, t: 3, size: "small" });
  });

  it("SPEC-CORE-008: the image mimeType is the Content-Type without parameters", async () => {
    const client = clientFor(videoMeta, async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/webp; charset=binary",
    }));
    const result = await findTool("get_video_frame").handler(
      { drive: DRIVE, file_id: FILE_ID, t: 1 },
      client
    );
    expect(blocks(result)[1].mimeType).toBe("image/webp");
  });

  it("SPEC-CORE-008: a .loft reference is an error and no frame is requested", async () => {
    const client = clientFor({ id: FILE_ID, mime_type: LOFT_MIME, duration: 100 });
    const result = await findTool("get_video_frame").handler(
      { drive: DRIVE, file_id: FILE_ID, t: 1 },
      client
    );
    expect(result.isError).toBe(true);
    expect(blocks(result)[0].text).toBe(
      `${FILE_ID} is a .loft reference; it has no local video to read frames from`
    );
    expect(client.calls).toHaveLength(1);
    expect(client.bytesCalls).toEqual([]);
  });

  it("SPEC-CORE-008: t past the known duration is an error naming the duration and no frame is requested", async () => {
    const client = clientFor(videoMeta);
    const result = await findTool("get_video_frame").handler(
      { drive: DRIVE, file_id: FILE_ID, t: 100.5 },
      client
    );
    expect(result.isError).toBe(true);
    expect(blocks(result)[0].text).toBe("t=100.5 is past the end of the video (duration 100s)");
    expect(client.bytesCalls).toEqual([]);
  });

  it("SPEC-CORE-008: t equal to the duration still requests the frame", async () => {
    const client = clientFor(videoMeta);
    const result = await findTool("get_video_frame").handler(
      { drive: DRIVE, file_id: FILE_ID, t: 100 },
      client
    );
    expect(result.isError).not.toBe(true);
    expect(client.bytesCalls).toHaveLength(1);
  });

  it("SPEC-CORE-008: a null duration skips the duration check", async () => {
    const client = clientFor({ id: FILE_ID, mime_type: "video/mp4", duration: null });
    const result = await findTool("get_video_frame").handler(
      { drive: DRIVE, file_id: FILE_ID, t: 99999 },
      client
    );
    expect(result.isError).not.toBe(true);
    expect(requestedUrl(client.bytesCalls[0]).searchParams.get("t")).toBe("99999");
  });

  it("SPEC-CORE-008: a core 404 is an error and no frame is requested", async () => {
    const client = fakeClient(
      async () => {
        throw new LitloftApiError(404, { detail: "File not found" });
      },
      undefined,
      undefined,
      undefined,
      async (call) => frameBytesFor(call)
    );
    const result = await findTool("get_video_frame").handler(
      { drive: DRIVE, file_id: FILE_ID, t: 1 },
      client
    );
    expect(result.isError).toBe(true);
    expect(blocks(result)[0].text).toBe("Litloft API error (404): File not found");
    expect(client.bytesCalls).toEqual([]);
  });

  it.each([
    [new LitloftApiError(400, { detail: "Not a video file" }), "Litloft API error (400): Not a video file"],
    [new LitloftApiError(403, { detail: "Drive not accessible" }), "Litloft API error (403): Drive not accessible"],
    [new Error("The operation was aborted due to timeout"), "The operation was aborted due to timeout"],
  ])("SPEC-CORE-008: a failed frame request is an error result (%s)", async (error, text) => {
    const client = clientFor(videoMeta, async () => {
      throw error;
    });
    const result = await findTool("get_video_frame").handler(
      { drive: DRIVE, file_id: FILE_ID, t: 1 },
      client
    );
    expect(result.isError).toBe(true);
    expect(blocks(result)[0].text).toBe(text);
  });
});

describe("list_video_scenes (SPEC-CORE-009)", () => {
  const videoMeta = { id: FILE_ID, mime_type: "video/mp4", duration: 600 };
  const threeScenes = [
    { start: 12.5, end: 40, transcript_excerpt: "first" },
    { start: 40, end: 75.25, transcript_excerpt: null },
    { start: 75.25, end: 600, transcript_excerpt: "third" },
  ];

  function scenesBody(scenes: unknown[], extra: Record<string, unknown> = {}) {
    return {
      file_id: FILE_ID,
      duration: 600,
      window: null,
      candidate_count: 40,
      available: true,
      scenes,
      ...extra,
    };
  }

  function clientFor(
    scenesResponse: unknown,
    bytesImpl: (call: RecordedBytesCall) => Promise<BytesResponse> = async (call) =>
      frameBytesFor(call),
    meta: unknown = videoMeta
  ) {
    return fakeClient(
      async (call) => {
        if (call.path === FILE_PATH) return meta;
        if (requestedUrl(call).pathname === SCENES_PATH) {
          if (scenesResponse instanceof Error) throw scenesResponse;
          return scenesResponse;
        }
        throw new Error(`unexpected JSON request ${call.path}`);
      },
      undefined,
      undefined,
      undefined,
      bytesImpl
    );
  }

  function scenesCall(client: ReturnType<typeof clientFor>) {
    const call = client.calls.find((c) => requestedUrl(c).pathname === SCENES_PATH);
    if (!call) throw new Error("no scenes request was sent");
    return call;
  }

  it("SPEC-CORE-009: the schema takes finite times >= 0 and lets end <= start through", () => {
    const schema = z.object(findTool("list_video_scenes").inputSchema);
    const base = { drive: DRIVE, file_id: FILE_ID };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, start_time: 0, end_time: 0 }).success).toBe(true);
    expect(schema.safeParse({ ...base, start_time: 10, end_time: 5 }).success).toBe(true);
    expect(schema.safeParse({ ...base, start_time: -1 }).success).toBe(false);
    expect(schema.safeParse({ ...base, end_time: -1 }).success).toBe(false);
    expect(schema.safeParse({ ...base, start_time: Number.NaN }).success).toBe(false);
    expect(schema.safeParse({ ...base, end_time: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  it("SPEC-CORE-009: reads the core file, then requests scenes with X-Lit-Drive and no window", async () => {
    const client = clientFor(scenesBody(threeScenes));
    await findTool("list_video_scenes").handler({ drive: DRIVE, file_id: FILE_ID }, client);

    expect(client.calls[0].method).toBe("GET");
    expect(client.calls[0].path).toBe(FILE_PATH);
    const call = scenesCall(client);
    expect(call.method).toBe("GET");
    expect(driveHeader(call)).toBe(DRIVE);
    const params = requestedUrl(call).searchParams;
    expect(params.has("start")).toBe(false);
    expect(params.has("end")).toBe(false);
  });

  it.each([
    [{ start_time: 30 }, { start: "30", end: null }],
    [{ end_time: 90 }, { start: null, end: "90" }],
    [{ start_time: 30, end_time: 90 }, { start: "30", end: "90" }],
    [{ start_time: 90, end_time: 30 }, { start: "90", end: "30" }],
  ])("SPEC-CORE-009: sends start/end only for the times given (%o)", async (args, expected) => {
    const client = clientFor(scenesBody([]));
    await findTool("list_video_scenes").handler({ drive: DRIVE, file_id: FILE_ID, ...args }, client);
    const params = requestedUrl(scenesCall(client)).searchParams;
    expect(params.get("start")).toBe(expected.start);
    expect(params.get("end")).toBe(expected.end);
  });

  it("SPEC-CORE-009: returns the summary, then each scene's label followed by its small frame", async () => {
    const client = clientFor(scenesBody(threeScenes));
    const result = await findTool("list_video_scenes").handler(
      { drive: DRIVE, file_id: FILE_ID },
      client
    );

    expect(result.isError).not.toBe(true);
    const content = blocks(result);
    expect(content[0].type).toBe("text");
    expect(JSON.parse(content[0].text!)).toEqual({
      file_id: FILE_ID,
      duration: 600,
      window: null,
      candidate_count: 40,
      scene_count: 3,
      scenes: [
        { index: 1, start: 12.5, end: 40, transcript_excerpt: "first", frame: "included" },
        { index: 2, start: 40, end: 75.25, transcript_excerpt: null, frame: "included" },
        { index: 3, start: 75.25, end: 600, transcript_excerpt: "third", frame: "included" },
      ],
    });

    const rest = content.slice(1);
    expect(rest.map((b) => (b.type === "text" ? b.text : decoded(b.data!)))).toEqual([
      "Scene 1 at 12.5s",
      "frame@12.5/small",
      "Scene 2 at 40s",
      "frame@40/small",
      "Scene 3 at 75.25s",
      "frame@75.25/small",
    ]);
    for (const image of [rest[1], rest[3], rest[5]]) {
      expect(image.type).toBe("image");
      expect(image.mimeType).toBe("image/webp");
    }

    expect(client.bytesCalls).toHaveLength(3);
    for (const call of client.bytesCalls) {
      expect(call.method).toBe("GET");
      expect(requestedUrl(call).pathname).toBe(FRAME_PATH);
      expect(requestedUrl(call).searchParams.get("size")).toBe("small");
      expect(driveHeader(call)).toBe(DRIVE);
    }
  });

  it("SPEC-CORE-009: passes the effective window from the endpoint into the summary", async () => {
    const window = { start: 30, end: null };
    const client = clientFor(
      scenesBody([{ start: 31, end: null, transcript_excerpt: null }], {
        window,
        duration: null,
        candidate_count: 1,
      })
    );
    const result = await findTool("list_video_scenes").handler(
      { drive: DRIVE, file_id: FILE_ID, start_time: 30 },
      client
    );
    const summary = JSON.parse(blocks(result)[0].text!);
    expect(summary.window).toEqual(window);
    expect(summary.duration).toBeNull();
    expect(summary.scenes[0].end).toBeNull();
  });

  it.each([
    ["301 code points are cut to 299 plus an ellipsis", 301, [..."𝒜".repeat(299)].join("") + "…"],
    ["300 code points are unchanged", 300, "𝒜".repeat(300)],
    ["1 code point is unchanged", 1, "𝒜"],
  ])("SPEC-CORE-009: excerpt length in the output: %s", async (_label, length, expected) => {
    const excerpt = "𝒜".repeat(length);
    const client = clientFor(scenesBody([{ start: 5, end: 10, transcript_excerpt: excerpt }]));
    const result = await findTool("list_video_scenes").handler(
      { drive: DRIVE, file_id: FILE_ID },
      client
    );
    const out = JSON.parse(blocks(result)[0].text!).scenes[0].transcript_excerpt as string;
    expect(out).toBe(expected);
    expect([...out].length).toBeLessThanOrEqual(300);
  });

  it.each([
    [new LitloftApiError(500, { detail: "Frame extraction failed" }), "500 Frame extraction failed"],
    [new LitloftApiError(504, { detail: "Frame extraction timed out" }), "504 Frame extraction timed out"],
    [new Error("socket hang up"), "request failed: socket hang up"],
  ])("SPEC-CORE-009: one failed frame marks only that scene unavailable (%s)", async (error, reason) => {
    const client = clientFor(scenesBody(threeScenes), async (call) => {
      if (requestedUrl(call).searchParams.get("t") === "40") throw error;
      return frameBytesFor(call);
    });
    const result = await findTool("list_video_scenes").handler(
      { drive: DRIVE, file_id: FILE_ID },
      client
    );

    expect(result.isError).not.toBe(true);
    const content = blocks(result);
    const summary = JSON.parse(content[0].text!);
    expect(summary.scenes.map((s: { frame: string }) => s.frame)).toEqual([
      "included",
      "unavailable",
      "included",
    ]);
    expect(summary.scenes.map((s: { start: number }) => s.start)).toEqual([12.5, 40, 75.25]);
    expect(content.slice(1).map((b) => (b.type === "text" ? b.text : decoded(b.data!)))).toEqual([
      "Scene 1 at 12.5s",
      "frame@12.5/small",
      "Scene 2 at 40s",
      `frame unavailable: ${reason}`,
      "Scene 3 at 75.25s",
      "frame@75.25/small",
    ]);
  });

  it("SPEC-CORE-009: no scene candidates returns the summary and a pointer to get_video_frame", async () => {
    const client = clientFor(scenesBody([], { candidate_count: 0 }));
    const result = await findTool("list_video_scenes").handler(
      { drive: DRIVE, file_id: FILE_ID },
      client
    );
    expect(result.isError).not.toBe(true);
    const content = blocks(result);
    expect(content).toHaveLength(2);
    const summary = JSON.parse(content[0].text!);
    expect(summary.scene_count).toBe(0);
    expect(summary.scenes).toEqual([]);
    expect(content[1].type).toBe("text");
    expect(content[1].text).toMatch(/no scene candidates/i);
    expect(content[1].text).toContain("get_video_frame");
    expect(content[1].text).toContain("get_transcript");
    expect(content[1].text).toContain("semantic_search");
    expect(client.bytesCalls).toEqual([]);
  });

  it("SPEC-CORE-009: a .loft reference is an error and no intelligence request is sent", async () => {
    const client = clientFor(scenesBody(threeScenes), undefined, {
      id: FILE_ID,
      mime_type: LOFT_MIME,
      duration: null,
    });
    const result = await findTool("list_video_scenes").handler(
      { drive: DRIVE, file_id: FILE_ID },
      client
    );
    expect(result.isError).toBe(true);
    expect(blocks(result)[0].text).toBe(
      `${FILE_ID} is a .loft reference; it has no local video to read frames from`
    );
    expect(client.calls.map((c) => c.path)).toEqual([FILE_PATH]);
    expect(client.bytesCalls).toEqual([]);
  });

  it.each([
    [new LitloftApiError(422, { detail: "end must be greater than start" }), "Litloft API error (422): end must be greater than start"],
    [new LitloftApiError(502, { detail: "Addon service unavailable" }), "Litloft API error (502): Addon service unavailable"],
    [new LitloftApiError(404, { detail: "File not indexed" }), "Litloft API error (404): File not indexed"],
  ])("SPEC-CORE-009: a failed scenes request is an error result (%s)", async (error, text) => {
    const client = clientFor(error);
    const result = await findTool("list_video_scenes").handler(
      { drive: DRIVE, file_id: FILE_ID, start_time: 90, end_time: 30 },
      client
    );
    expect(result.isError).toBe(true);
    expect(blocks(result)[0].text).toBe(text);
    expect(client.bytesCalls).toEqual([]);
  });

  it("SPEC-CORE-009: never has more than 4 frame requests in flight and fetches every frame", async () => {
    const scenes = Array.from({ length: 11 }, (_, i) => ({
      start: i * 10,
      end: (i + 1) * 10,
      transcript_excerpt: null,
    }));
    let inFlight = 0;
    let maxInFlight = 0;
    const release: Array<() => void> = [];
    const client = clientFor(scenesBody(scenes), (call) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        release.push(() => {
          inFlight -= 1;
          resolve(frameBytesFor(call));
        });
      });
    });

    let done = false;
    const pending = findTool("list_video_scenes")
      .handler({ drive: DRIVE, file_id: FILE_ID }, client)
      .finally(() => {
        done = true;
      });
    for (let spins = 0; !done && spins < 1_000; spins += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      release.shift()?.();
    }
    const result = await pending;

    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(client.bytesCalls).toHaveLength(11);
    const summary = JSON.parse(blocks(result)[0].text!);
    expect(summary.scenes.every((s: { frame: string }) => s.frame === "included")).toBe(true);
  });

  describe("45 s frame budget", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function hangUntilAborted(call: RecordedBytesCall): Promise<BytesResponse> {
      return new Promise((_resolve, reject) => {
        const signal = call.options?.signal;
        signal?.addEventListener("abort", () =>
          reject(new DOMException("This operation was aborted", "AbortError"))
        );
      });
    }

    const sixScenes = Array.from({ length: 6 }, (_, i) => ({
      start: i * 10 + 5,
      end: i * 10 + 15,
      transcript_excerpt: `scene ${i + 1}`,
    }));

    it("SPEC-CORE-009: aborts in-flight frames, sends no more, and reports every missing frame as time budget exceeded", async () => {
      const client = clientFor(scenesBody(sixScenes), (call) => {
        const t = requestedUrl(call).searchParams.get("t");
        return t === "5" ? Promise.resolve(frameBytesFor(call)) : hangUntilAborted(call);
      });

      let settled = false;
      const pending = findTool("list_video_scenes")
        .handler({ drive: DRIVE, file_id: FILE_ID }, client)
        .finally(() => {
          settled = true;
        });

      await vi.advanceTimersByTimeAsync(44_900);
      expect(settled).toBe(false);
      expect(client.bytesCalls.some((c) => c.options?.signal?.aborted)).toBe(false);
      const sentBeforeBudget = client.bytesCalls.length;
      expect(sentBeforeBudget).toBeGreaterThanOrEqual(4);
      expect(sentBeforeBudget).toBeLessThanOrEqual(5);

      await vi.advanceTimersByTimeAsync(200);
      const result = await pending;
      await vi.advanceTimersByTimeAsync(60_000);

      expect(client.bytesCalls).toHaveLength(sentBeforeBudget);
      for (const call of client.bytesCalls.slice(1)) {
        expect(call.options?.signal?.aborted).toBe(true);
      }

      expect(result.isError).not.toBe(true);
      const content = blocks(result);
      const summary = JSON.parse(content[0].text!);
      expect(summary.scene_count).toBe(6);
      expect(summary.scenes.map((s: { transcript_excerpt: string }) => s.transcript_excerpt)).toEqual(
        sixScenes.map((s) => s.transcript_excerpt)
      );
      expect(summary.scenes.map((s: { frame: string }) => s.frame)).toEqual([
        "included",
        "unavailable",
        "unavailable",
        "unavailable",
        "unavailable",
        "unavailable",
      ]);
      const texts = content.slice(1).map((b) => (b.type === "text" ? b.text : decoded(b.data!)));
      expect(texts).toEqual([
        "Scene 1 at 5s",
        "frame@5/small",
        ...sixScenes.slice(1).flatMap((s, i) => [
          `Scene ${i + 2} at ${s.start}s`,
          "frame unavailable: time budget exceeded",
        ]),
      ]);
    });

    it("SPEC-CORE-009: scenes whose frames were never sent are also time budget exceeded", async () => {
      const client = clientFor(scenesBody(sixScenes), hangUntilAborted);

      const pending = findTool("list_video_scenes").handler(
        { drive: DRIVE, file_id: FILE_ID },
        client
      );
      await vi.advanceTimersByTimeAsync(45_100);
      const result = await pending;

      expect(client.bytesCalls.length).toBeLessThanOrEqual(4);
      for (const call of client.bytesCalls) {
        expect(call.options?.signal?.aborted).toBe(true);
      }
      const content = blocks(result);
      const summary = JSON.parse(content[0].text!);
      expect(summary.scenes.every((s: { frame: string }) => s.frame === "unavailable")).toBe(true);
      const reasons = content.filter((b) => b.type === "text" && b.text?.startsWith("frame unavailable"));
      expect(reasons.map((b) => b.text)).toEqual(
        Array(6).fill("frame unavailable: time budget exceeded")
      );
    });
  });

  it("SPEC-CORE-009 SPEC-CORE-008: both tools only read", async () => {
    const listClient = clientFor(scenesBody(threeScenes));
    await findTool("list_video_scenes").handler({ drive: DRIVE, file_id: FILE_ID }, listClient);
    const frameClient = clientFor(scenesBody([]));
    await findTool("get_video_frame").handler({ drive: DRIVE, file_id: FILE_ID, t: 1 }, frameClient);
    for (const client of [listClient, frameClient]) {
      expect([...client.calls, ...client.bytesCalls].every((c) => c.method === "GET")).toBe(true);
      expect(client.rawCalls).toEqual([]);
      expect(client.multipartCalls).toEqual([]);
      expect(client.sseCalls).toEqual([]);
    }
  });
});
