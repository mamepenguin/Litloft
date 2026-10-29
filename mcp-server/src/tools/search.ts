import { z } from "zod";
import { runTool } from "./runTool.js";
import { readOnlyAnnotations, textResult, type LitloftTool } from "./types.js";

type Query = Record<string, string | number | boolean | undefined>;

export function withoutAvailable(response: unknown): unknown {
  if (typeof response !== "object" || response === null || Array.isArray(response)) {
    return response;
  }
  const { available: _available, ...rest } = response as Record<string, unknown>;
  return rest;
}

export function intelligenceGet(
  client: Parameters<LitloftTool["handler"]>[1],
  path: string,
  drive: string,
  query: Query
) {
  return client.request("GET", `/api/addons/intelligence${path}`, {
    query,
    headers: { "X-Lit-Drive": encodeURIComponent(drive) },
  });
}

const searchExact: LitloftTool = {
  name: "search_exact",
  description:
    "List every place a string appears in one drive, like grep: document text (Markdown, plain text, HTML, PDF, Office, EPUB), video/audio transcripts, and Visual Index scenes (scene label, on-screen text). It does not search filenames (use search_files), file descriptions, tags or image descriptions. Matching is a plain substring, case-insensitive for ASCII letters only, with no wildcards. Each segment gives its position (PDF page, EPUB `section`, transcript or scene times), match_count and a snippet. Results are ordered and paged: `total` is the full count, page with offset. Document chunks overlap, so one occurrence can be listed in two consecutive text segments.",
  inputSchema: {
    drive: z.string().describe("Drive name"),
    q: z.string().min(1).max(200).describe("Exact text to find"),
    sources: z
      .array(z.enum(["text", "transcript", "scene"]))
      .min(1)
      .optional()
      .describe("Which kinds of text to search (default all three)"),
    limit: z.number().int().min(1).max(200).optional().describe("Segments per page (default 50)"),
    offset: z.number().int().min(0).optional().describe("Segments to skip (default 0)"),
  },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool(async () => {
      const sources = args.sources as string[] | undefined;
      return textResult(
        withoutAvailable(
          await intelligenceGet(client, "/search/exact", args.drive as string, {
            q: args.q as string,
            sources: sources?.join(","),
            limit: args.limit as number | undefined,
            offset: args.offset as number | undefined,
          })
        )
      );
    }),
};

const searchVideoScenes: LitloftTool = {
  name: "search_video_scenes",
  description:
    "Find video scenes in one drive by what is shown, ranked by meaning against each scene's label and on-screen text. Only videos whose Visual Index was generated have scenes. Every result carries a score and no threshold is applied, so judge weak matches by score. Open a hit with get_video_frame at its start_time.",
  inputSchema: {
    drive: z.string().describe("Drive name"),
    q: z.string().min(1).max(1000).describe("What the scene shows"),
    limit: z.number().int().min(1).max(50).optional().describe("Number of scenes (default 20)"),
  },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        withoutAvailable(
          await intelligenceGet(client, "/search/scenes", args.drive as string, {
            q: args.q as string,
            limit: args.limit as number | undefined,
          })
        )
      )
    ),
};

export const searchTools: LitloftTool[] = [searchExact, searchVideoScenes];
