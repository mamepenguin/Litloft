import { z } from "zod";
import { LitloftApiError, type LitloftClient } from "../client.js";
import { apiErrorDetail, runTool } from "./runTool.js";
import {
  errorResult,
  imageBlock,
  readOnlyAnnotations,
  textBlock,
  type ImageBlock,
  type LitloftMediaTool,
  type TextBlock,
  type ToolMediaResult,
} from "./types.js";

// Mirrors whisper.LOFT_MIME in the intelligence addon. Core files a .loft
// as video, so the frame endpoint would run ffmpeg on its JSON pointer.
const LOFT_MIME = "application/vnd.litloft.loft+json";

const SCENE_FRAME_CONCURRENCY = 4;
const SCENE_FRAME_BUDGET_MS = 45_000;
const SCENE_EXCERPT_MAX_CODE_POINTS = 300;

const BUDGET_EXCEEDED = "time budget exceeded";

const finiteSeconds = z.number().finite().min(0);

interface CoreFile {
  mime_type?: string | null;
  duration?: number | null;
}

interface SceneItem {
  start: number;
  end: number | null;
  transcript_excerpt: string | null;
}

interface ScenesResponse {
  file_id: string;
  duration: number | null;
  window: { start: number; end: number | null } | null;
  candidate_count: number;
  scenes: SceneItem[];
}

type FrameOutcome = { image: ImageBlock } | { reason: string };

function framePath(fileId: string): string {
  return `/api/addons/intelligence/files/${encodeURIComponent(fileId)}/frame`;
}

function driveHeaders(drive: string): Record<string, string> {
  return { "X-Lit-Drive": encodeURIComponent(drive) };
}

function loftError(fileId: string, url: string | null): string {
  const target = url === null ? "" : ` to ${url}`;
  return `${fileId} is a .loft reference${target}; it has no local video to read frames from`;
}

// Any failure falls back to the message without a URL: the file was found
// and is still a .loft, so a failed read is not reported as an API error.
async function readLoftUrl(client: LitloftClient, fileId: string): Promise<string | null> {
  try {
    const res = await client.requestRaw(
      "GET",
      `/api/files/${encodeURIComponent(fileId)}/stream`
    );
    const parsed: unknown = JSON.parse(res.text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const url = (parsed as { url?: unknown }).url;
    return typeof url === "string" && url !== "" ? url : null;
  } catch {
    return null;
  }
}

function readCoreFile(client: LitloftClient, fileId: string): Promise<CoreFile> {
  return client.request<CoreFile>("GET", `/api/files/${encodeURIComponent(fileId)}`);
}

// Counted in code points, so a cut never splits a surrogate pair.
function truncateExcerpt(excerpt: string | null): string | null {
  if (excerpt === null) return null;
  const codePoints = [...excerpt];
  if (codePoints.length <= SCENE_EXCERPT_MAX_CODE_POINTS) return excerpt;
  return codePoints.slice(0, SCENE_EXCERPT_MAX_CODE_POINTS - 1).join("") + "…";
}

function failureReason(err: unknown, budget: AbortSignal): string {
  if (budget.aborted) return BUDGET_EXCEEDED;
  if (err instanceof LitloftApiError) return `${err.status} ${apiErrorDetail(err)}`;
  return `request failed: ${err instanceof Error ? err.message : String(err)}`;
}

async function fetchSceneFrames(
  client: LitloftClient,
  drive: string,
  fileId: string,
  scenes: SceneItem[]
): Promise<FrameOutcome[]> {
  const outcomes: (FrameOutcome | undefined)[] = [];
  const budget = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budgetExpired = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      budget.abort();
      resolve();
    }, SCENE_FRAME_BUDGET_MS);
  });

  let next = 0;
  const worker = async () => {
    while (!budget.signal.aborted && next < scenes.length) {
      const index = next++;
      try {
        const res = await client.requestBytes("GET", framePath(fileId), {
          query: { t: scenes[index].start, size: "small" },
          headers: driveHeaders(drive),
          signal: budget.signal,
        });
        outcomes[index] = budget.signal.aborted
          ? { reason: BUDGET_EXCEEDED }
          : { image: imageBlock(res.bytes, res.contentType) };
      } catch (err) {
        outcomes[index] = { reason: failureReason(err, budget.signal) };
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(SCENE_FRAME_CONCURRENCY, scenes.length) },
    worker
  );
  // A request that ignores its abort signal must not hold the tool past the budget.
  await Promise.race([Promise.all(workers), budgetExpired]);
  clearTimeout(timer);
  budget.abort();
  return Array.from(scenes, (_scene, i) => outcomes[i] ?? { reason: BUDGET_EXCEEDED });
}

const getVideoFrame: LitloftMediaTool = {
  name: "get_video_frame",
  description:
    "Return the frame of a video at time t (seconds) as an image, so you can see what is on screen: on-screen text, slides, what is being shown. size 'large' (default) has a long edge of up to 1280 px, enough to read on-screen text; 'small' is 320 px wide. Take t from list_video_scenes, get_transcript or a semantic_search time range. Native videos indexed by the intelligence addon only; a .loft reference has no frames, and the error gives its URL.",
  inputSchema: {
    drive: z.string(),
    file_id: z.string(),
    t: finiteSeconds.describe("Time in seconds"),
    size: z
      .enum(["large", "small"])
      .optional()
      .describe("'large' (default, long edge up to 1280 px) or 'small' (320 px wide)"),
  },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool<ToolMediaResult>(async () => {
      const drive = args.drive as string;
      const fileId = args.file_id as string;
      const t = args.t as number;
      const size = (args.size as "large" | "small" | undefined) ?? "large";

      const file = await readCoreFile(client, fileId);
      if (file.mime_type === LOFT_MIME) {
        return errorResult(loftError(fileId, await readLoftUrl(client, fileId)));
      }
      if (typeof file.duration === "number" && t > file.duration) {
        return errorResult(
          `t=${t} is past the end of the video (duration ${file.duration}s)`
        );
      }

      const res = await client.requestBytes("GET", framePath(fileId), {
        query: { t, size },
        headers: driveHeaders(drive),
      });
      return {
        content: [
          textBlock({ file_id: fileId, t, size }),
          imageBlock(res.bytes, res.contentType),
        ],
      };
    }),
};

const listVideoScenes: LitloftMediaTool = {
  name: "list_video_scenes",
  description:
    "Overview of a video: up to 24 representative scenes chosen from the scene changes found at indexing, each with its start/end time, the nearby transcript excerpt and a small frame image. Pass start_time/end_time (seconds) to look closer at one part of a long video. Use get_video_frame for a large frame of a scene you want to read. Native videos indexed by the intelligence addon only; a .loft reference has no frames, and the error gives its URL.",
  inputSchema: {
    drive: z.string(),
    file_id: z.string(),
    start_time: finiteSeconds.optional().describe("Window start in seconds"),
    end_time: finiteSeconds.optional().describe("Window end in seconds"),
  },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool<ToolMediaResult>(async () => {
      const drive = args.drive as string;
      const fileId = args.file_id as string;

      const file = await readCoreFile(client, fileId);
      if (file.mime_type === LOFT_MIME) {
        return errorResult(loftError(fileId, await readLoftUrl(client, fileId)));
      }

      const res = await client.request<ScenesResponse>(
        "GET",
        `/api/addons/intelligence/files/${encodeURIComponent(fileId)}/scenes`,
        {
          query: {
            start: args.start_time as number | undefined,
            end: args.end_time as number | undefined,
          },
          headers: driveHeaders(drive),
        }
      );

      const frames = await fetchSceneFrames(client, drive, fileId, res.scenes);
      const summary = {
        file_id: res.file_id,
        duration: res.duration,
        window: res.window,
        candidate_count: res.candidate_count,
        scene_count: res.scenes.length,
        scenes: res.scenes.map((scene, i) => ({
          index: i + 1,
          start: scene.start,
          end: scene.end,
          transcript_excerpt: truncateExcerpt(scene.transcript_excerpt),
          frame: "image" in frames[i] ? "included" : "unavailable",
        })),
      };

      const content: (TextBlock | ImageBlock)[] = [textBlock(summary)];
      if (res.scenes.length === 0) {
        content.push(
          textBlock(
            "No scene candidates for this video (frames not indexed yet, or none in the window). " +
              "get_video_frame still works with a time taken from get_transcript or semantic_search."
          )
        );
      }
      res.scenes.forEach((scene, i) => {
        content.push(textBlock(`Scene ${i + 1} at ${scene.start}s`));
        const frame = frames[i];
        content.push("image" in frame ? frame.image : textBlock(`frame unavailable: ${frame.reason}`));
      });
      return { content };
    }),
};

export const videoTools: LitloftMediaTool[] = [getVideoFrame, listVideoScenes];
