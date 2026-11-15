import { describe, expect, it } from "vitest";
import { videoTools } from "../tools/video.js";
import { fakeClient, type BytesResponse, type RecordedBytesCall } from "./testClient.js";

const FILE_ID = "abc123456789";
const DRIVE = "media";
const FILE_PATH = `/api/files/${FILE_ID}`;
const FRAME_PATH = `/api/addons/intelligence/files/${FILE_ID}/frame`;
const SCENES_PATH = `/api/addons/intelligence/files/${FILE_ID}/scenes`;

type Block = { type: string; text?: string; data?: string; mimeType?: string };

function findTool(name: string) {
  const tool = videoTools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

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

function frameBytesFor(call: RecordedBytesCall): BytesResponse {
  const url = requestedUrl(call);
  return {
    bytes: new TextEncoder().encode(`frame@${url.searchParams.get("t")}/${url.searchParams.get("size")}`),
    contentType: "image/webp",
  };
}

function decoded(data: string): string {
  return Buffer.from(data, "base64").toString("utf8");
}

const sections = [
  { start: 0, end: 75.5, frame_time: 6, transcript_excerpt: "first" },
  { start: 75.5, end: 155.5, frame_time: 86, transcript_excerpt: null },
  { start: 155.5, end: 600, frame_time: 165.5, transcript_excerpt: "third" },
];

function clientFor(scenes: unknown[], bytesImpl = async (call: RecordedBytesCall) => frameBytesFor(call)) {
  return fakeClient(
    async (call) => {
      if (call.path === FILE_PATH) return { id: FILE_ID, mime_type: "video/mp4", duration: 600 };
      if (requestedUrl(call).pathname === SCENES_PATH) {
        return {
          file_id: FILE_ID,
          duration: 600,
          window: null,
          candidate_count: 60,
          available: true,
          scenes,
        };
      }
      throw new Error(`unexpected JSON request ${call.path}`);
    },
    undefined,
    undefined,
    undefined,
    bytesImpl
  );
}

describe("list_video_scenes sections (SPEC-CORE-110)", () => {
  it("SPEC-CORE-110: describes up to 40 representative scenes", () => {
    expect(findTool("list_video_scenes").description).toContain("up to 40 representative scenes");
  });

  it("SPEC-CORE-110: fetches each frame at its frame time and labels the section start and frame time", async () => {
    const client = clientFor(sections);
    const result = await findTool("list_video_scenes").handler({ drive: DRIVE, file_id: FILE_ID }, client);

    expect(result.isError).not.toBe(true);
    const content = result.content as Block[];
    expect(content.slice(1).map((b) => (b.type === "text" ? b.text : decoded(b.data!)))).toEqual([
      "Scene 1 at 0s (frame at 6s)",
      "frame@6/small",
      "Scene 2 at 75.5s (frame at 86s)",
      "frame@86/small",
      "Scene 3 at 155.5s (frame at 165.5s)",
      "frame@165.5/small",
    ]);
    expect(client.bytesCalls.map((c) => requestedUrl(c).pathname)).toEqual([
      FRAME_PATH,
      FRAME_PATH,
      FRAME_PATH,
    ]);
  });

  it("SPEC-CORE-110: each summary item carries its frame time and a numeric end", async () => {
    const client = clientFor(sections);
    const result = await findTool("list_video_scenes").handler({ drive: DRIVE, file_id: FILE_ID }, client);

    const summary = JSON.parse((result.content as Block[])[0].text!);
    expect(summary.scenes).toEqual([
      { index: 1, start: 0, end: 75.5, frame_time: 6, transcript_excerpt: "first", frame: "included" },
      { index: 2, start: 75.5, end: 155.5, frame_time: 86, transcript_excerpt: null, frame: "included" },
      { index: 3, start: 155.5, end: 600, frame_time: 165.5, transcript_excerpt: "third", frame: "included" },
    ]);
  });

  it("SPEC-CORE-110 SPEC-CORE-009: a frame that fails is reported after its own label, the rest are kept", async () => {
    const client = clientFor(sections, async (call) => {
      if (requestedUrl(call).searchParams.get("t") === "86") throw new Error("socket hang up");
      return frameBytesFor(call);
    });
    const result = await findTool("list_video_scenes").handler({ drive: DRIVE, file_id: FILE_ID }, client);

    expect(result.isError).not.toBe(true);
    const content = result.content as Block[];
    expect(JSON.parse(content[0].text!).scenes.map((s: { frame: string }) => s.frame)).toEqual([
      "included",
      "unavailable",
      "included",
    ]);
    expect(content.slice(1).map((b) => (b.type === "text" ? b.text : decoded(b.data!)))).toEqual([
      "Scene 1 at 0s (frame at 6s)",
      "frame@6/small",
      "Scene 2 at 75.5s (frame at 86s)",
      "frame unavailable: request failed: socket hang up",
      "Scene 3 at 155.5s (frame at 165.5s)",
      "frame@165.5/small",
    ]);
  });
});
