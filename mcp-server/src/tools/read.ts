import { z } from "zod";
import { runTool } from "./runTool.js";
import { textResult, type LitloftTool } from "./types.js";

// Mirrors backend/app/routers/files.py _TEXT_WRITE_ALLOWED_MIMES /
// _TEXT_WRITE_MAX_BYTES. get_file_content refuses non-text mimes so a call
// against a video/image file can't stream megabytes of binary data into the
// tool result, and refuses oversized text files so a large-but-legitimate
// markdown/log file doesn't get dumped whole into the agent's context.
const TEXT_CONTENT_MIMES = new Set(["text/markdown", "text/plain"]);
const TEXT_CONTENT_MAX_BYTES = 1024 * 1024; // 1 MB

const listDrives: LitloftTool = {
  name: "list_drives",
  description:
    "List drives visible to the current credentials. Locked/inaccessible drives are omitted entirely (never listed as locked).",
  inputSchema: {},
  handler: (_args, client) =>
    runTool(async () => textResult(await client.request("GET", "/api/drives"))),
};

const searchFiles: LitloftTool = {
  name: "search_files",
  description:
    "Search/list files within a single drive. Drives are a hard security boundary in Litloft; there is no cross-drive search.",
  inputSchema: {
    drive: z.string().describe("Drive name"),
    search: z.string().optional().describe("Substring match against title/folder path"),
    favorite: z.boolean().optional(),
    tag: z.string().optional(),
    type: z.string().optional().describe("file_type filter, e.g. video/image/document"),
    sort: z.enum(["created_at", "title", "file_size", "likes", "random"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(500).optional(),
    path: z.string().optional().describe("Folder path filter"),
  },
  handler: (args, client) =>
    runTool(async () => {
      const { drive, ...query } = args as { drive: string } & Record<string, unknown>;
      return textResult(
        await client.request("GET", `/api/drives/${encodeURIComponent(drive)}/files`, {
          query: query as Record<string, string | number | boolean | undefined>,
        })
      );
    }),
};

const getFile: LitloftTool = {
  name: "get_file",
  description: "Get metadata for a single file by id.",
  inputSchema: { file_id: z.string().describe("12-character file id") },
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request(
          "GET",
          `/api/files/${encodeURIComponent(args.file_id as string)}`
        )
      )
    ),
};

const getFileContent: LitloftTool = {
  name: "get_file_content",
  description:
    "Read the full text content of a small text/markdown file, plus the ETag required by update_file_content. Refuses non-text files without downloading them.",
  inputSchema: { file_id: z.string() },
  handler: (args, client) =>
    runTool(async () => {
      const fileId = args.file_id as string;
      const file = await client.request<{ mime_type?: string; file_size?: number }>(
        "GET",
        `/api/files/${encodeURIComponent(fileId)}`
      );
      if (!file.mime_type || !TEXT_CONTENT_MIMES.has(file.mime_type)) {
        return textResult({
          error: `File mime type '${file.mime_type}' is not readable as text. Only text/markdown and text/plain are supported by this tool.`,
        });
      }
      if (typeof file.file_size === "number" && file.file_size > TEXT_CONTENT_MAX_BYTES) {
        return textResult({
          error: `File is ${file.file_size} bytes, which exceeds the ${TEXT_CONTENT_MAX_BYTES}-byte limit for this tool. Use the Litloft web UI to view it.`,
        });
      }
      const res = await client.requestRaw(
        "GET",
        `/api/files/${encodeURIComponent(fileId)}/stream`
      );
      return textResult({ content: res.text, etag: res.headers.get("ETag") });
    }),
};

const getWatchHistory: LitloftTool = {
  name: "get_watch_history",
  description: "Get continue-watching / watch history for a drive.",
  inputSchema: {
    drive: z.string(),
    limit: z.number().int().min(1).max(50).optional(),
    filter: z.enum(["unfinished", "all"]).optional(),
  },
  handler: (args, client) =>
    runTool(async () => {
      const { drive, ...query } = args as { drive: string } & Record<string, unknown>;
      return textResult(
        await client.request(
          "GET",
          `/api/drives/${encodeURIComponent(drive)}/watch-history`,
          { query: query as Record<string, string | number | boolean | undefined> }
        )
      );
    }),
};

const semanticSearch: LitloftTool = {
  name: "semantic_search",
  description:
    "Rank files within a drive by relevance to a natural-language query, using transcripts/captions/embeddings rather than filename matching (unlike search_files, which only matches title/folder path). Results include per-segment excerpts (with time ranges for video/audio, page numbers for documents) showing exactly what matched. Requires the intelligence addon's 'search' feature to be enabled for the drive.",
  inputSchema: {
    drive: z.string().describe("Drive name"),
    q: z.string().min(1).describe("Natural-language search query"),
    limit: z.number().int().min(1).max(100).optional(),
    type: z.string().optional().describe("file_type filter, e.g. video/image/document"),
    mode: z
      .enum(["precision", "recall"])
      .optional()
      .describe("'precision' (default) for normal use; 'recall' is a wider net for comparison purposes"),
    include_scene_clip: z
      .boolean()
      .optional()
      .describe("Include scene-level (not just representative-frame) image embeddings in the match"),
  },
  handler: (args, client) =>
    runTool(async () => {
      const { drive, ...query } = args as { drive: string } & Record<string, unknown>;
      return textResult(
        await client.request("GET", "/api/addons/intelligence/search", {
          query: query as Record<string, string | number | boolean | undefined>,
          headers: { "X-Lit-Drive": drive },
        })
      );
    }),
};

const listComments: LitloftTool = {
  name: "list_comments",
  description: "List comments on a file.",
  inputSchema: { file_id: z.string() },
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request(
          "GET",
          `/api/files/${encodeURIComponent(args.file_id as string)}/comments`
        )
      )
    ),
};

export const readTools: LitloftTool[] = [
  listDrives,
  searchFiles,
  getFile,
  getFileContent,
  semanticSearch,
  getWatchHistory,
  listComments,
];
