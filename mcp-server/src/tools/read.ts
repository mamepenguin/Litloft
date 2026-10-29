import { z } from "zod";
import { DOCUMENT_MIMES } from "./documents.js";
import { runTool } from "./runTool.js";
import {
  FULL_READ_MAX_BYTES,
  RANGED_OUTPUT_MAX_BYTES,
  RANGED_READ_MAX_BYTES,
  decodeUtf8,
  getFileMeta,
  isReadableMime,
  readTextBody,
  selectLines,
} from "./textContent.js";
import { errorResult, readOnlyAnnotations, textResult, type LitloftTool } from "./types.js";


// get_transcript has no server-side range/pagination support (the backend
// endpoint always returns every chunk), so range filtering and the size
// cap are both applied client-side here. 20k chars is in the same order of
// magnitude as the project's own RAG context budgets (search-config.yml),
// not an arbitrary number.
const TRANSCRIPT_MAX_CHARS = 20_000;

interface TranscriptChunk {
  index: number;
  text: string;
  start: number;
  end: number;
  text_refined_at: string | null;
}

const listDrives: LitloftTool = {
  name: "list_drives",
  description:
    "List drives visible to the current credentials. Locked/inaccessible drives are omitted entirely (never listed as locked).",
  inputSchema: {},
  annotations: readOnlyAnnotations,
  handler: (_args, client) =>
    runTool(async () => textResult(await client.request("GET", "/api/drives"))),
};

// Safety valve for depth > 1: each level issues one request per folder
// discovered at the level above, so a wide/deep drive could otherwise fan
// out into hundreds of requests from a single tool call. The cap is
// client-side because the recursion itself lives here, not in the backend.
const LIST_FOLDERS_MAX_CALLS = 200;

interface FolderNode {
  name: string;
  path: string;
  file_count: number;
  /** Per-kind totals, recursive, keyed by the kind vocabulary `?type=` takes. */
  kind_counts?: Record<string, number>;
  dominant_kind?: string | null;
  subfolders?: FolderNode[];
}

const listFolders: LitloftTool = {
  name: "list_folders",
  description:
    "List subfolders under a path within a drive. By default one level deep (call again with a returned subfolder's path to go deeper). Pass depth (2-5) to recurse multiple levels in one call — each folder in the result then carries a `subfolders` array nested the same way, up to that depth. To list the files inside a folder instead, use search_files with the same path and no search term.",
  inputSchema: {
    drive: z.string().describe("Drive name"),
    path: z.string().optional().describe("Parent folder path; omit for the drive root"),
    depth: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe(
        "How many levels deep to recurse (default 1, max 5). Depth >1 nests each folder's children under a `subfolders` field."
      ),
  },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool(async () => {
      const drive = args.drive as string;
      const path = args.path as string | undefined;
      const depth = (args.depth as number | undefined) ?? 1;

      let callCount = 0;
      let truncated = false;

      const fetchLevel = async (
        parentPath: string | undefined,
        remainingDepth: number
      ): Promise<FolderNode[]> => {
        if (truncated) return [];
        callCount += 1;
        if (callCount > LIST_FOLDERS_MAX_CALLS) {
          truncated = true;
          return [];
        }
        const folders = await client.request<FolderNode[]>(
          "GET",
          `/api/drives/${encodeURIComponent(drive)}/folders`,
          { query: parentPath !== undefined ? { path: parentPath } : undefined }
        );
        if (remainingDepth > 1) {
          for (const folder of folders) {
            if (truncated) break;
            folder.subfolders = await fetchLevel(folder.path, remainingDepth - 1);
          }
        }
        return folders;
      };

      const folders = await fetchLevel(path, depth);
      if (depth === 1) {
        return textResult(folders);
      }
      return textResult({ depth, truncated, folders });
    }),
};

const SUMMARY_FIELDS = [
  "id",
  "filename",
  "title",
  "folder_path",
  "file_type",
  "mime_type",
  "file_size",
  "duration",
  "tags",
  "created_at",
  "updated_at",
  "match_source",
];

function summarizeFile(item: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(SUMMARY_FIELDS.filter((k) => k in item).map((k) => [k, item[k]]));
}

const searchFiles: LitloftTool = {
  name: "search_files",
  description:
    "List and/or search files within a single drive. Set path (and leave search empty) to list files directly inside a specific folder; set search to filter by filename/folder-path substring. Each item is a summary (id, filename, title, folder_path, file_type, mime_type, file_size, duration, tags, created_at, updated_at, match_source); pass fields: 'full' for every field (thumbnail, favorite, likes, trust, subtitles…). Drives are a hard security boundary in Litloft; there is no cross-drive search.",
  inputSchema: {
    drive: z.string().describe("Drive name"),
    search: z.string().optional().describe("Substring match against title/folder path"),
    favorite: z.boolean().optional(),
    tag: z.string().optional(),
    type: z
      .enum([
        "video",
        "image",
        "audio",
        "document",
        "archive",
        "other",
        "text",
        "pdf",
      ])
      .optional()
      .describe(
        "Narrow to one kind. `text` (Markdown and .txt) and `pdf` are refinements of "
        + "`document`, so `document` returns those too. An unlisted value "
        + "is rejected by the server rather than returning nothing.",
      ),
    sort: z.enum(["created_at", "title", "file_size", "likes", "random"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(500).optional(),
    path: z.string().optional().describe("Folder path filter"),
    fields: z
      .enum(["summary", "full"])
      .optional()
      .describe("'summary' (default) keeps the main fields of each file; 'full' returns every field"),
  },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool(async () => {
      const { drive, fields, ...query } = args as { drive: string; fields?: string } & Record<
        string,
        unknown
      >;
      const res = await client.request<{ data: Record<string, unknown>[] }>(
        "GET",
        `/api/drives/${encodeURIComponent(drive)}/files`,
        { query: query as Record<string, string | number | boolean | undefined> }
      );
      if (fields === "full") {
        return textResult(res);
      }
      return textResult({ ...res, data: res.data.map(summarizeFile) });
    }),
};

const getFile: LitloftTool = {
  name: "get_file",
  description: "Get metadata for a single file by id.",
  inputSchema: { file_id: z.string().describe("12-character file id") },
  annotations: readOnlyAnnotations,
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
    "Read a text file (Markdown, plain text, CSV, HTML, code, JSON, any text/* type). Without offset/limit it returns the whole text and, for Markdown/plain text, the ETag update_file_content needs; files over 1 MB must be read in ranges and files over 10 MB are refused. With offset (1-based first line) and/or limit (number of lines) it returns those lines with their terminators, start_line, end_line, total_lines, truncated (stopped at 1 MB of output) and a null ETag: to change part of a file use edit_file_content, never update_file_content with a partial read.",
  inputSchema: {
    file_id: z.string(),
    offset: z.number().int().min(1).optional().describe("1-based first line to return"),
    limit: z.number().int().min(1).optional().describe("Number of lines to return"),
  },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool(async () => {
      const fileId = args.file_id as string;
      const offset = args.offset as number | undefined;
      const limit = args.limit as number | undefined;
      const ranged = offset !== undefined || limit !== undefined;
      const bound = ranged ? RANGED_READ_MAX_BYTES : FULL_READ_MAX_BYTES;

      const file = await getFileMeta(client, fileId);
      if (!isReadableMime(file.mime_type)) {
        return errorResult(
          DOCUMENT_MIMES.has(file.mime_type ?? "")
            ? `File mime type '${file.mime_type}' is not readable as text here; read it with read_document.`
            : `File mime type '${file.mime_type}' is not readable as text; only text/* and application/json are.`
        );
      }
      const tooLarge = (size: number) =>
        size > RANGED_READ_MAX_BYTES
          ? errorResult(
              `File is ${size} bytes, over the ${RANGED_READ_MAX_BYTES}-byte limit for this tool.`
            )
          : errorResult(
              `File is ${size} bytes, over ${FULL_READ_MAX_BYTES} bytes; read it in parts with offset and limit.`
            );
      if ((file.file_size ?? 0) > bound) {
        return tooLarge(file.file_size ?? 0);
      }

      const body = await readTextBody(client, fileId);
      if (body.bytes.length > bound) {
        return tooLarge(body.bytes.length);
      }
      const text = decodeUtf8(body.bytes, false);
      if (!ranged) {
        return textResult({ content: text, etag: body.etag });
      }
      const range = selectLines(text, offset ?? 1, limit);
      if ("tooLongLine" in range) {
        return errorResult(
          `Line ${range.tooLongLine} alone is over ${RANGED_OUTPUT_MAX_BYTES} bytes and cannot be returned.`
        );
      }
      return textResult(range);
    }),
};

const getFileByPath: LitloftTool = {
  name: "get_file_by_path",
  description:
    "Get a file's metadata (including its file_id) from its drive-relative path, e.g. 'notes/2026/trip.md'. Looks only in the given drive.",
  inputSchema: {
    drive: z.string().describe("Drive name"),
    path: z.string().min(1).describe("Drive-relative path including the filename"),
  },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request(
          "GET",
          `/api/drives/${encodeURIComponent(args.drive as string)}/files/by-path`,
          { query: { path: args.path as string } }
        )
      )
    ),
};

const getWatchHistory: LitloftTool = {
  name: "get_watch_history",
  description: "Get continue-watching / watch history for a drive.",
  inputSchema: {
    drive: z.string(),
    limit: z.number().int().min(1).max(50).optional(),
    filter: z.enum(["unfinished", "all"]).optional(),
  },
  annotations: readOnlyAnnotations,
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
    "Rank files within a drive by relevance to a natural-language query. This is a hybrid search: it combines transcript/caption/embedding relevance with filename/title/folder-path/tag matching (so it's a superset of search_files, not just a semantic-only complement to it). Results include per-segment excerpts (with time ranges for video/audio, page numbers for PDFs, and for an EPUB book a null page with a 1-based `section` and its `section_title`, the chapter title or null) showing exactly what matched. Requires the intelligence addon's 'search' feature to be enabled for the drive.",
  inputSchema: {
    drive: z.string().describe("Drive name"),
    q: z.string().min(1).describe("Natural-language search query"),
    limit: z.number().int().min(1).max(100).optional(),
    type: z
      .enum(["video", "image", "audio", "document", "archive", "other"])
      .optional()
      .describe(
        "Narrow to one kind. The semantic index stores the flat kinds "
        + "only — use `document` to include Markdown and PDFs.",
      ),
    mode: z
      .enum(["precision", "recall"])
      .optional()
      .describe("'precision' (default) for normal use; 'recall' is a wider net for comparison purposes"),
    include_scene_clip: z
      .boolean()
      .optional()
      .describe("Include scene-level (not just representative-frame) image embeddings in the match"),
  },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool(async () => {
      const { drive, ...query } = args as { drive: string } & Record<string, unknown>;
      return textResult(
        await client.request("GET", "/api/addons/intelligence/search", {
          query: query as Record<string, string | number | boolean | undefined>,
          headers: { "X-Lit-Drive": encodeURIComponent(drive) },
        })
      );
    }),
};

const getTranscript: LitloftTool = {
  name: "get_transcript",
  description:
    "Get the Whisper transcript for a video/audio file as time-stamped chunks. Pass start_time/end_time (in seconds, e.g. from a semantic_search segment's time_range) to narrow to a relevant window instead of pulling the whole transcript. Fails with a 404-style error if the file hasn't been transcribed.",
  inputSchema: {
    drive: z.string(),
    file_id: z.string(),
    start_time: z
      .number()
      .optional()
      .describe("Only return chunks ending after this time (seconds)"),
    end_time: z
      .number()
      .optional()
      .describe("Only return chunks starting before this time (seconds)"),
  },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool(async () => {
      const drive = args.drive as string;
      const fileId = args.file_id as string;
      const startTime = args.start_time as number | undefined;
      const endTime = args.end_time as number | undefined;

      const transcript = await client.request<{
        file_id: string;
        language: string;
        chunks: TranscriptChunk[];
      }>("GET", `/api/addons/intelligence/files/${encodeURIComponent(fileId)}/transcript`, {
        headers: { "X-Lit-Drive": encodeURIComponent(drive) },
      });

      let candidates = transcript.chunks;
      if (startTime !== undefined || endTime !== undefined) {
        candidates = candidates.filter(
          (c) =>
            (endTime === undefined || c.start < endTime) &&
            (startTime === undefined || c.end > startTime)
        );
      }

      const limited: TranscriptChunk[] = [];
      let totalChars = 0;
      let truncated = false;
      for (const c of candidates) {
        if (limited.length > 0 && totalChars + c.text.length > TRANSCRIPT_MAX_CHARS) {
          truncated = true;
          break;
        }
        limited.push(c);
        totalChars += c.text.length;
      }

      return textResult({
        file_id: transcript.file_id,
        language: transcript.language,
        total_chunks: transcript.chunks.length,
        returned_chunks: limited.length,
        truncated,
        chunks: limited.map((c) => ({ index: c.index, start: c.start, end: c.end, text: c.text })),
      });
    }),
};

const listComments: LitloftTool = {
  name: "list_comments",
  description: "List comments on a file.",
  inputSchema: { file_id: z.string() },
  annotations: readOnlyAnnotations,
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
  listFolders,
  searchFiles,
  getFile,
  getFileByPath,
  getFileContent,
  semanticSearch,
  getTranscript,
  getWatchHistory,
  listComments,
];
