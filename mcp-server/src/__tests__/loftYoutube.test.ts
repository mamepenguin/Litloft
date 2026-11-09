import { describe, expect, it } from "vitest";
import { LitloftApiError, type LitloftRawResponse } from "../client.js";
import { videoTools } from "../tools/video.js";
import {
  fakeClient,
  type BytesResponse,
  type RecordedBytesCall,
  type RecordedRawCall,
} from "./testClient.js";

const FILE_ID = "abc123456789";
const DRIVE = "media";
const LOFT_MIME = "application/vnd.litloft.loft+json";
const FILE_PATH = `/api/files/${FILE_ID}`;
const STREAM_PATH = `/api/files/${FILE_ID}/stream`;
const FRAME_PATH = `/api/addons/intelligence/files/${FILE_ID}/frame`;
const SCENES_PATH = `/api/addons/intelligence/files/${FILE_ID}/scenes`;
const YOUTUBE_BODY = JSON.stringify({ provider: "youtube", url: "https://www.youtube.com/watch?v=abc" });

function findTool(name: string) {
  const tool = videoTools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

function requestedUrl(call: { path: string; options?: { query?: Record<string, unknown> } }): URL {
  const url = new URL(call.path, "http://litloft.test");
  for (const [key, value] of Object.entries(call.options?.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

function driveHeader(call: { options?: { headers?: Record<string, string> } }) {
  return call.options?.headers?.["X-Lit-Drive"];
}

type Block = { type: string; text?: string; data?: string; mimeType?: string };

function blocks(result: { content: unknown[] }): Block[] {
  return result.content as Block[];
}

function frameBytesFor(call: RecordedBytesCall): BytesResponse {
  const url = requestedUrl(call);
  return {
    bytes: new TextEncoder().encode(`frame@${url.searchParams.get("t")}/${url.searchParams.get("size")}`),
    contentType: "image/webp",
  };
}

function streamOf(text: string): (call: RecordedRawCall) => Promise<LitloftRawResponse> {
  return async () => ({ status: 200, headers: new Headers(), text });
}

const scenes = [
  { start: 12.5, end: 40, transcript_excerpt: "first" },
  { start: 40, end: 75.25, transcript_excerpt: null },
  { start: 75.25, end: 100, transcript_excerpt: "third" },
];

function youtubeClient(
  options: {
    duration?: number | null;
    scenesResponse?: unknown;
    bytesImpl?: (call: RecordedBytesCall) => Promise<BytesResponse>;
    stream?: string;
  } = {}
) {
  const { duration = 100, scenesResponse, bytesImpl, stream = YOUTUBE_BODY } = options;
  return fakeClient(
    async (call) => {
      if (call.path === FILE_PATH) return { id: FILE_ID, mime_type: LOFT_MIME, duration };
      if (requestedUrl(call).pathname === SCENES_PATH) {
        if (scenesResponse instanceof Error) throw scenesResponse;
        return (
          scenesResponse ?? {
            file_id: FILE_ID,
            duration,
            window: null,
            candidate_count: 3,
            available: true,
            scenes,
          }
        );
      }
      throw new Error(`unexpected JSON request ${call.path}`);
    },
    streamOf(stream),
    undefined,
    undefined,
    bytesImpl ?? (async (call) => frameBytesFor(call))
  );
}

describe("SPEC-CORE-058: get_video_frame on a YouTube .loft", () => {
  it("SPEC-CORE-058: reads the file and its stream, then requests a large frame and returns it as an image block", async () => {
    const client = youtubeClient();
    const result = await findTool("get_video_frame").handler(
      { drive: DRIVE, file_id: FILE_ID, t: 12.5 },
      client
    );

    expect(client.calls.map((c) => c.path)).toEqual([FILE_PATH]);
    expect(client.rawCalls.map((c) => c.path)).toEqual([STREAM_PATH]);
    expect(client.bytesCalls).toHaveLength(1);
    const call = client.bytesCalls[0];
    expect(requestedUrl(call).pathname).toBe(FRAME_PATH);
    expect(requestedUrl(call).searchParams.get("t")).toBe("12.5");
    expect(requestedUrl(call).searchParams.get("size")).toBe("large");

    expect(result.isError).not.toBe(true);
    const [text, image, ...rest] = blocks(result);
    expect(rest).toEqual([]);
    expect(JSON.parse(text.text!)).toEqual({ file_id: FILE_ID, t: 12.5, size: "large" });
    expect(image.type).toBe("image");
    expect(image.mimeType).toBe("image/webp");
    expect(Buffer.from(image.data!, "base64").toString("utf8")).toBe("frame@12.5/large");
  });

  it.each(["media", "other-drive"])(
    "SPEC-CORE-058: sends the drive argument (%s) as X-Lit-Drive",
    async (drive) => {
      const client = youtubeClient();
      await findTool("get_video_frame").handler({ drive, file_id: FILE_ID, t: 1 }, client);
      expect(driveHeader(client.bytesCalls[0])).toBe(drive);
    }
  );

  it("SPEC-CORE-058: size small is passed through", async () => {
    const client = youtubeClient();
    await findTool("get_video_frame").handler(
      { drive: DRIVE, file_id: FILE_ID, t: 3, size: "small" },
      client
    );
    expect(requestedUrl(client.bytesCalls[0]).searchParams.get("size")).toBe("small");
  });

  it("SPEC-CORE-058: t past the known duration is the duration error, after the stream was read, and no frame is requested", async () => {
    const client = youtubeClient({ duration: 100 });
    const result = await findTool("get_video_frame").handler(
      { drive: DRIVE, file_id: FILE_ID, t: 100.5 },
      client
    );
    expect(result.isError).toBe(true);
    expect(blocks(result)[0].text).toBe("t=100.5 is past the end of the video (duration 100s)");
    expect(client.rawCalls.map((c) => c.path)).toEqual([STREAM_PATH]);
    expect(client.bytesCalls).toEqual([]);
  });

  it.each([
    [400, "No frame source"],
    [500, "Frame extraction failed"],
    [502, "Frame source unavailable"],
    [504, "Frame extraction timed out"],
  ])("SPEC-CORE-058: intelligence answering %i is an API error result", async (status, detail) => {
    const client = youtubeClient({
      bytesImpl: async () => {
        throw new LitloftApiError(status, { detail });
      },
    });
    const result = await findTool("get_video_frame").handler(
      { drive: DRIVE, file_id: FILE_ID, t: 1 },
      client
    );
    expect(result.isError).toBe(true);
    expect(blocks(result)).toHaveLength(1);
    expect(blocks(result)[0].text).toBe(`Litloft API error (${status}): ${detail}`);
  });
});

describe("SPEC-CORE-058: list_video_scenes on a YouTube .loft", () => {
  it("SPEC-CORE-058: reads the file and stream, requests the scenes, then a small frame per scene", async () => {
    const client = youtubeClient();
    const result = await findTool("list_video_scenes").handler(
      { drive: DRIVE, file_id: FILE_ID },
      client
    );

    expect(client.calls[0].path).toBe(FILE_PATH);
    expect(client.rawCalls.map((c) => c.path)).toEqual([STREAM_PATH]);
    const scenesCall = client.calls.find((c) => requestedUrl(c).pathname === SCENES_PATH);
    expect(scenesCall).toBeDefined();
    expect(driveHeader(scenesCall!)).toBe(DRIVE);

    expect(result.isError).not.toBe(true);
    const content = blocks(result);
    const summary = JSON.parse(content[0].text!);
    expect(summary.scene_count).toBe(3);
    const images = content.filter((b) => b.type === "image");
    expect(images.map((b) => Buffer.from(b.data!, "base64").toString("utf8"))).toEqual([
      "frame@12.5/small",
      "frame@40/small",
      "frame@75.25/small",
    ]);
    expect(client.bytesCalls).toHaveLength(3);
    for (const call of client.bytesCalls) {
      expect(requestedUrl(call).pathname).toBe(FRAME_PATH);
      expect(driveHeader(call)).toBe(DRIVE);
    }
  });

  it("SPEC-CORE-058: a scene list with no scenes is returned, not an error", async () => {
    const client = youtubeClient({
      scenesResponse: {
        file_id: FILE_ID,
        duration: 100,
        window: null,
        candidate_count: 0,
        available: true,
        scenes: [],
      },
    });
    const result = await findTool("list_video_scenes").handler(
      { drive: DRIVE, file_id: FILE_ID },
      client
    );
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(blocks(result)[0].text!).scene_count).toBe(0);
    expect(client.bytesCalls).toEqual([]);
  });

  it("SPEC-CORE-058: the list is still returned when some small frames fail", async () => {
    const client = youtubeClient({
      bytesImpl: async (call) => {
        if (requestedUrl(call).searchParams.get("t") === "40") {
          throw new LitloftApiError(504, { detail: "Frame extraction timed out" });
        }
        return frameBytesFor(call);
      },
    });
    const result = await findTool("list_video_scenes").handler(
      { drive: DRIVE, file_id: FILE_ID },
      client
    );
    expect(result.isError).not.toBe(true);
    const images = blocks(result).filter((b) => b.type === "image");
    expect(images).toHaveLength(2);
  });

  it.each([
    [400, "Not a video file"],
    [500, "boom"],
    [502, "Addon service unavailable"],
    [504, "timed out"],
  ])("SPEC-CORE-058: intelligence answering %i for the scenes is an API error result", async (status, detail) => {
    const client = youtubeClient({ scenesResponse: new LitloftApiError(status, { detail }) });
    const result = await findTool("list_video_scenes").handler(
      { drive: DRIVE, file_id: FILE_ID },
      client
    );
    expect(result.isError).toBe(true);
    expect(blocks(result)[0].text).toBe(`Litloft API error (${status}): ${detail}`);
    expect(client.bytesCalls).toEqual([]);
  });
});

describe("SPEC-CORE-058: tool descriptions", () => {
  it.each(["get_video_frame", "list_video_scenes"])(
    "SPEC-CORE-058: %s no longer says a .loft has no frames",
    (name) => {
      expect(findTool(name).description).not.toMatch(/\.loft reference has no frames/);
    }
  );
});
