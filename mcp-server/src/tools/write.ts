import { z } from "zod";
import { runTool } from "./runTool.js";
import {
  EDITABLE_MAX_BYTES,
  EDITABLE_MIMES,
  decodeUtf8,
  getFileMeta,
  readTextBody,
} from "./textContent.js";
import { errorResult, textResult, writeAnnotations, type LitloftTool } from "./types.js";

// All writes mirror the public /api/* surface the Litloft frontend itself
// uses — no bypass of existing validation or drive access control.
// Deliberately NOT included in this tool set:
//
// - purge (physical delete): irreversible.

// MCP tool args are JSON, so file content travels as base64 rather than a
// multipart stream. Capped well below the backend's own MAX_UPLOAD_SIZE
// (which is meant for videos) — this path is for small notes/documents an
// agent creates or fetches, not bulk media import. Always sent as exactly
// one chunk (chunk_size == the file's own size), which sidesteps the
// multi-chunk loop entirely since every upload through this tool fits
// under the cap by construction.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

function requireViewer(client: { viewer?: string }): string | null {
  if (!client.viewer) {
    return "LITLOFT_VIEWER is required for this tool.";
  }
  return null;
}
const renameFile: LitloftTool = {
  name: "rename_file",
  description: "Rename a file (change its filename, not its folder).",
  inputSchema: { file_id: z.string(), new_filename: z.string() },
  annotations: writeAnnotations({ destructive: true, idempotent: true }),
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request(
          "PUT",
          `/api/files/${encodeURIComponent(args.file_id as string)}/rename`,
          { json: { new_filename: args.new_filename } }
        )
      )
    ),
};

const moveFile: LitloftTool = {
  name: "move_file",
  description: "Move a file to a different folder path, optionally to a different drive.",
  inputSchema: {
    file_id: z.string(),
    target_folder_path: z.string(),
    target_drive: z.string().optional(),
  },
  annotations: writeAnnotations({ destructive: true, idempotent: true }),
  handler: (args, client) =>
    runTool(async () => {
      const { file_id, ...body } = args as { file_id: string } & Record<string, unknown>;
      return textResult(
        await client.request("PUT", `/api/files/${encodeURIComponent(file_id)}/move`, {
          json: body,
        })
      );
    }),
};

const trashFile: LitloftTool = {
  name: "trash_file",
  description:
    "Move a file to trash (soft delete). Recoverable for 30 days via restore_file; this does not permanently delete anything.",
  inputSchema: { file_id: z.string() },
  annotations: writeAnnotations({ destructive: true, idempotent: true }),
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request(
          "DELETE",
          `/api/files/${encodeURIComponent(args.file_id as string)}`
        )
      )
    ),
};

const restoreFile: LitloftTool = {
  name: "restore_file",
  description: "Restore a file out of trash.",
  inputSchema: { file_id: z.string() },
  annotations: writeAnnotations({ destructive: false, idempotent: true }),
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request(
          "POST",
          `/api/files/${encodeURIComponent(args.file_id as string)}/restore`
        )
      )
    ),
};

const updateTags: LitloftTool = {
  name: "update_tags",
  description:
    "Replace the full tag list on a file (max 10 tags). This overwrites existing tags rather than appending to them.",
  inputSchema: { file_id: z.string(), tags: z.array(z.string()).max(10) },
  annotations: writeAnnotations({ destructive: true, idempotent: true }),
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request(
          "PUT",
          `/api/files/${encodeURIComponent(args.file_id as string)}/tags`,
          { json: { tags: args.tags } }
        )
      )
    ),
};

const updateFileContent: LitloftTool = {
  name: "update_file_content",
  description:
    "Replace a text/markdown file's whole content. `content` is plain text, not base64 (unlike upload_file's content_base64). Requires the ETag of a full get_file_content read (a ranged read returns none) as an optimistic-lock guard; a 412 conflict means the file changed since you last read it, so read it again before retrying. To change part of a file, use edit_file_content instead.",
  inputSchema: { file_id: z.string(), content: z.string(), etag: z.string() },
  annotations: writeAnnotations({ destructive: true, idempotent: true }),
  handler: (args, client) =>
    runTool(async () => {
      const res = await client.requestRaw(
        "PUT",
        `/api/files/${encodeURIComponent(args.file_id as string)}/content`,
        {
          body: args.content as string,
          headers: {
            "If-Match": args.etag as string,
            "Content-Type": "text/plain",
          },
        }
      );
      return textResult({ etag: res.headers.get("ETag") });
    }),
};

// Counts left to right without overlap, the way the replacement below walks.
function countOccurrences(text: string, needle: string): number {
  let count = 0;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
    count += 1;
  }
  return count;
}

const editFileContent: LitloftTool = {
  name: "edit_file_content",
  description:
    "Change part of a Markdown or plain-text file (at most 1 MB) by exact string replacement, without sending the whole file. old_string must occur exactly once in the current file (include surrounding text to make it unique), or pass replace_all to replace every occurrence. Both strings are literal. The tool reads the file itself, so no ETag is needed; it applies to the file as it is now.",
  inputSchema: {
    file_id: z.string(),
    old_string: z.string().describe("Exact text to replace"),
    new_string: z.string().describe("Text to put in its place"),
    replace_all: z.boolean().optional().describe("Replace every occurrence (default false)"),
  },
  annotations: writeAnnotations({ destructive: true, idempotent: false }),
  handler: (args, client) =>
    runTool(async () => {
      const fileId = args.file_id as string;
      const oldString = args.old_string as string;
      const newString = args.new_string as string;
      const replaceAll = (args.replace_all as boolean | undefined) ?? false;

      if (oldString === "") {
        return errorResult("old_string is empty.");
      }
      if (oldString === newString) {
        return errorResult("old_string and new_string are the same; nothing to change.");
      }

      const file = await getFileMeta(client, fileId);
      if (!file.mime_type || !EDITABLE_MIMES.has(file.mime_type)) {
        return errorResult(
          `File mime type '${file.mime_type}' is not editable; only text/markdown and text/plain are.`
        );
      }
      if ((file.file_size ?? 0) > EDITABLE_MAX_BYTES) {
        return errorResult(
          `File is ${file.file_size} bytes, over the ${EDITABLE_MAX_BYTES}-byte limit for editing.`
        );
      }

      const body = await readTextBody(client, fileId);
      let text: string;
      try {
        text = decodeUtf8(body.bytes, true);
      } catch {
        return errorResult("File is not valid UTF-8 and cannot be edited.");
      }
      if (!body.etag) {
        return errorResult(
          `File has no ETag to guard the write; it is over ${EDITABLE_MAX_BYTES} bytes on disk.`
        );
      }

      const count = countOccurrences(text, oldString);
      if (count === 0) {
        return errorResult("old_string not found in the file.");
      }
      if (count > 1 && !replaceAll) {
        return errorResult(
          `old_string occurs ${count} times; include more surrounding text to make it unique, or pass replace_all.`
        );
      }
      // split/join inserts new_string literally; String.replace would expand $& and $1.
      const updated = replaceAll
        ? text.split(oldString).join(newString)
        : text.replace(oldString, () => newString);

      const res = await client.requestRaw(
        "PUT",
        `/api/files/${encodeURIComponent(fileId)}/content`,
        {
          body: updated,
          headers: { "If-Match": body.etag, "Content-Type": "text/plain" },
        }
      );
      return textResult({ etag: res.headers.get("ETag"), replacements: count });
    }),
};

const createPlaylist: LitloftTool = {
  name: "create_playlist",
  description: "Create a new playlist (collection) within a drive.",
  inputSchema: {
    drive: z.string(),
    name: z.string(),
    description: z.string().optional(),
  },
  annotations: writeAnnotations({ destructive: false, idempotent: false }),
  handler: (args, client) =>
    runTool(async () => {
      const { drive, ...body } = args as { drive: string } & Record<string, unknown>;
      return textResult(
        await client.request(
          "POST",
          `/api/drives/${encodeURIComponent(drive)}/collections`,
          { json: body }
        )
      );
    }),
};

const addToPlaylist: LitloftTool = {
  name: "add_to_playlist",
  description:
    "Add one or more files to an existing playlist (collection). Files must belong to the same drive as the playlist.",
  inputSchema: {
    drive: z.string(),
    collection_id: z.string(),
    file_ids: z.array(z.string()),
  },
  annotations: writeAnnotations({ destructive: false, idempotent: false }),
  handler: (args, client) =>
    runTool(async () => {
      const { drive, collection_id, file_ids } = args as {
        drive: string;
        collection_id: string;
        file_ids: string[];
      };
      return textResult(
        await client.request(
          "POST",
          `/api/drives/${encodeURIComponent(drive)}/collections/${encodeURIComponent(collection_id)}/items`,
          { json: { file_ids } }
        )
      );
    }),
};

const uploadFile: LitloftTool = {
  name: "upload_file",
  description:
    "Upload a new small file (note, document, image) to a drive, capped at 10MB decoded — not for large video files. Pass exactly one of: `content` (plain UTF-8 text — for notes/markdown/text files) or `content_base64` (base64-encoded bytes — required for binary files such as images; plain text is NOT accepted here, only in `content`).",
  inputSchema: {
    drive: z.string(),
    filename: z.string(),
    content: z
      .string()
      .optional()
      .describe(
        "Plain UTF-8 text content, for text/markdown files. Mutually exclusive with content_base64; pass exactly one."
      ),
    content_base64: z
      .string()
      .optional()
      .describe(
        "Base64-encoded file content, required for binary files (e.g. images). Mutually exclusive with content; pass exactly one."
      ),
    folder_path: z
      .string()
      .optional()
      .describe("Destination folder path within the drive; omit for the drive root"),
  },
  annotations: writeAnnotations({ destructive: false, idempotent: false }),
  handler: (args, client) =>
    runTool(async () => {
      const drive = args.drive as string;
      const filename = args.filename as string;
      const folderPath = (args.folder_path as string | undefined) ?? "";
      const content = args.content as string | undefined;
      const contentBase64 = args.content_base64 as string | undefined;

      if (content !== undefined && contentBase64 !== undefined) {
        return textResult({
          error: "Pass exactly one of content or content_base64, not both.",
        });
      }
      if (content === undefined && contentBase64 === undefined) {
        return textResult({
          error: "One of content (plain text) or content_base64 (base64) is required.",
        });
      }
      const bytes =
        content !== undefined
          ? Buffer.from(content, "utf-8")
          : Buffer.from(contentBase64 as string, "base64");

      if (bytes.length === 0) {
        return textResult({
          error:
            content !== undefined
              ? "content is empty."
              : "Decoded content is empty (check that content_base64 is valid base64).",
        });
      }
      if (bytes.length > MAX_UPLOAD_BYTES) {
        return textResult({
          error: `Decoded content is ${bytes.length} bytes, which exceeds the ${MAX_UPLOAD_BYTES}-byte limit for this tool.`,
        });
      }

      const init = await client.request<{ upload_id: string }>(
        "POST",
        `/api/drives/${encodeURIComponent(drive)}/upload/init`,
        {
          json: {
            filename,
            file_size: bytes.length,
            folder_path: folderPath,
            chunk_size: bytes.length,
          },
        }
      );

      const form = new FormData();
      form.append("chunk_index", "0");
      form.append("chunk", new Blob([bytes]), filename);
      await client.requestMultipart(
        "POST",
        `/api/drives/${encodeURIComponent(drive)}/upload/${encodeURIComponent(init.upload_id)}/chunk`,
        form
      );

      return textResult(
        await client.request(
          "POST",
          `/api/drives/${encodeURIComponent(drive)}/upload/${encodeURIComponent(init.upload_id)}/complete`
        )
      );
    }),
};

const addComment: LitloftTool = {
  name: "add_comment",
  description:
    "Post a comment on a file. Requires LITLOFT_VIEWER so the comment has a profile nickname.",
  inputSchema: { file_id: z.string(), body: z.string().min(1).max(1000) },
  annotations: writeAnnotations({ destructive: false, idempotent: false }),
  handler: (args, client) =>
    runTool(async () => {
      const error = requireViewer(client);
      if (error) {
        return textResult({ error });
      }
      return textResult(
        await client.request(
          "POST",
          `/api/files/${encodeURIComponent(args.file_id as string)}/comments`,
          { json: { body: args.body } }
        )
      );
    }),
};

const clipUrl: LitloftTool = {
  name: "clip_url",
  description:
    "Create a Knowledge web clip from a URL in a drive. Requires LITLOFT_VIEWER.",
  inputSchema: {
    drive: z.string(),
    url: z.string().url(),
    subfolder: z.string().optional(),
    title: z.string().optional(),
  },
  annotations: writeAnnotations({
    destructive: false,
    idempotent: false,
    openWorld: true,
  }),
  handler: (args, client) =>
    runTool(async () => {
      const error = requireViewer(client);
      if (error) {
        return textResult({ error });
      }
      const { drive, ...body } = args as { drive: string } & Record<string, unknown>;
      return textResult(
        await client.request("POST", "/api/addons/knowledge/clips", {
          headers: { "X-Lit-Drive": drive },
          json: body,
        })
      );
    }),
};

const clipPasted: LitloftTool = {
  name: "clip_pasted",
  description:
    "Create a Knowledge clip from pasted HTML. Requires LITLOFT_VIEWER.",
  inputSchema: {
    drive: z.string(),
    url: z.string().url(),
    html: z.string().min(1),
    subfolder: z.string().optional(),
    title: z.string().optional(),
  },
  annotations: writeAnnotations({ destructive: false, idempotent: false }),
  handler: (args, client) =>
    runTool(async () => {
      const error = requireViewer(client);
      if (error) {
        return textResult({ error });
      }
      const { drive, ...body } = args as { drive: string } & Record<string, unknown>;
      return textResult(
        await client.request("POST", "/api/addons/knowledge/clips/pasted", {
          headers: { "X-Lit-Drive": drive },
          json: body,
        })
      );
    }),
};

export const writeTools: LitloftTool[] = [
  renameFile,
  moveFile,
  trashFile,
  restoreFile,
  updateTags,
  updateFileContent,
  editFileContent,
  createPlaylist,
  addToPlaylist,
  uploadFile,
  addComment,
  clipUrl,
  clipPasted,
];
