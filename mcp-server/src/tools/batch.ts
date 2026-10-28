import { z } from "zod";
import { runTool } from "./runTool.js";
import { textResult, writeAnnotations, type LitloftTool } from "./types.js";

// Mirrors backend/app/schemas.py _validate_batch_ids: one malformed id makes
// the backend reject the whole call, so it is caught here before any request.
const fileIds = z
  .array(z.string().regex(/^[A-Za-z0-9_-]{12}$/, "file ids are 12 characters of A-Z a-z 0-9 _ -"))
  .min(1)
  .max(100)
  .describe("1 to 100 file ids");

const targetFolderPath = z
  .string()
  .describe("Destination folder path ('' for the drive root)");
const targetDrive = z.string().optional().describe("Destination drive; omit for the same drive");

function withTargetDrive(body: Record<string, unknown>, drive: unknown): Record<string, unknown> {
  return drive === undefined ? body : { ...body, target_drive: drive };
}

const moveFiles: LitloftTool = {
  name: "move_files",
  description:
    "Move up to 100 files into one folder, optionally on another drive. Files keep their names; a name already taken there is reported per file in `errors`.",
  inputSchema: { file_ids: fileIds, target_folder_path: targetFolderPath, target_drive: targetDrive },
  annotations: writeAnnotations({ destructive: true, idempotent: true }),
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request("PUT", "/api/files/batch/move", {
          json: withTargetDrive(
            { ids: args.file_ids, target_folder_path: args.target_folder_path },
            args.target_drive
          ),
        })
      )
    ),
};

const copyFiles: LitloftTool = {
  name: "copy_files",
  description:
    "Copy up to 100 files into one folder, optionally on another drive. A copy whose name is taken becomes <stem>_copy<ext>, then <stem>_copy_2<ext> and so on. Only a count is returned: list the target folder with search_files to find the copies.",
  inputSchema: { file_ids: fileIds, target_folder_path: targetFolderPath, target_drive: targetDrive },
  annotations: writeAnnotations({ destructive: false, idempotent: false }),
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request("POST", "/api/files/batch/copy", {
          json: withTargetDrive(
            { ids: args.file_ids, target_folder_path: args.target_folder_path },
            args.target_drive
          ),
        })
      )
    ),
};

const trashFiles: LitloftTool = {
  name: "trash_files",
  description:
    "Move up to 100 files to trash (restorable for 30 days with restore_files). Nothing is deleted permanently.",
  inputSchema: { file_ids: fileIds },
  annotations: writeAnnotations({ destructive: true, idempotent: true }),
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request("POST", "/api/files/batch/delete", { json: { ids: args.file_ids } })
      )
    ),
};

const restoreFiles: LitloftTool = {
  name: "restore_files",
  description: "Restore up to 100 files out of trash.",
  inputSchema: { file_ids: fileIds },
  annotations: writeAnnotations({ destructive: false, idempotent: true }),
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request("POST", "/api/files/batch/restore", { json: { ids: args.file_ids } })
      )
    ),
};

const addTags: LitloftTool = {
  name: "add_tags",
  description:
    "Add tags to up to 100 files, keeping their existing tags (update_tags replaces one file's tags instead). For Markdown files the tags are written to the frontmatter.",
  inputSchema: {
    file_ids: fileIds,
    tags: z.array(z.string()).min(1).max(10).describe("1 to 10 tags to add"),
  },
  annotations: writeAnnotations({ destructive: false, idempotent: true }),
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request("PUT", "/api/files/batch/tags", {
          json: { ids: args.file_ids, tags: args.tags },
        })
      )
    ),
};

export const batchTools: LitloftTool[] = [moveFiles, copyFiles, trashFiles, restoreFiles, addTags];
