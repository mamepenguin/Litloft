import { z } from "zod";
import { runTool } from "./runTool.js";
import { textResult, type LitloftTool } from "./types.js";

// All writes mirror the public /api/* surface the Litloft frontend itself
// uses (hako yOp7JPjCTJVe_Ui5rWrEV) — no bypass of existing validation or
// drive access control. Deliberately NOT included in this tool set:
//
// - purge (physical delete): irreversible, excluded per explicit design
//   decision ("一旦除外").
// - add_comment: POST /api/files/{id}/comments 401s without a lit_viewer
//   profile cookie, which MCP clients don't carry (profile support was
//   explicitly deferred alongside mobile-app cookie handling).

// MCP tool args are JSON, so file content travels as base64 rather than a
// multipart stream. Capped well below the backend's own MAX_UPLOAD_SIZE
// (which is meant for videos) — this path is for small notes/documents an
// agent creates or fetches, not bulk media import. Always sent as exactly
// one chunk (chunk_size == the file's own size), which sidesteps the
// multi-chunk loop entirely since every upload through this tool fits
// under the cap by construction.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const renameFile: LitloftTool = {
  name: "rename_file",
  description: "Rename a file (change its filename, not its folder).",
  inputSchema: { file_id: z.string(), new_filename: z.string() },
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
    "Overwrite a text/markdown file's content. Requires the current ETag (from get_file_content) as an optimistic-lock guard; a 412 conflict means the file changed since you last read it, so call get_file_content again before retrying.",
  inputSchema: { file_id: z.string(), content: z.string(), etag: z.string() },
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

const createPlaylist: LitloftTool = {
  name: "create_playlist",
  description: "Create a new playlist (collection) within a drive.",
  inputSchema: {
    drive: z.string(),
    name: z.string(),
    description: z.string().optional(),
  },
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
    "Upload a new small file (note, document, image) to a drive. Content must be base64-encoded, capped at 10MB decoded — not for large video files.",
  inputSchema: {
    drive: z.string(),
    filename: z.string(),
    content_base64: z.string().describe("File content, base64-encoded"),
    folder_path: z
      .string()
      .optional()
      .describe("Destination folder path within the drive; omit for the drive root"),
  },
  handler: (args, client) =>
    runTool(async () => {
      const drive = args.drive as string;
      const filename = args.filename as string;
      const folderPath = (args.folder_path as string | undefined) ?? "";
      const bytes = Buffer.from(args.content_base64 as string, "base64");

      if (bytes.length === 0) {
        return textResult({
          error: "Decoded content is empty (check that content_base64 is valid base64).",
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

export const writeTools: LitloftTool[] = [
  renameFile,
  moveFile,
  trashFile,
  restoreFile,
  updateTags,
  updateFileContent,
  createPlaylist,
  addToPlaylist,
  uploadFile,
];
