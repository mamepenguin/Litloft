import { z } from "zod";
import { runTool } from "./runTool.js";
import { textResult, writeAnnotations, type LitloftTool } from "./types.js";

function foldersPath(drive: string): string {
  return `/api/drives/${encodeURIComponent(drive)}/folders`;
}

const createFolder: LitloftTool = {
  name: "create_folder",
  description:
    "Create a folder named `name` inside the parent folder `path` (omit or '' for the drive root). A missing parent is created too.",
  inputSchema: {
    drive: z.string(),
    name: z.string().describe("Name of the new folder, not a path"),
    path: z.string().optional().describe("Parent folder path; omit for the drive root"),
  },
  annotations: writeAnnotations({ destructive: false, idempotent: false }),
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request("POST", foldersPath(args.drive as string), {
          json: { path: (args.path as string | undefined) ?? "", name: args.name },
        })
      )
    ),
};

const renameFolder: LitloftTool = {
  name: "rename_folder",
  description:
    "Rename the folder at `path` to `new_name` (a name, not a path); it stays in the same parent folder.",
  inputSchema: {
    drive: z.string(),
    path: z.string().describe("Folder path"),
    new_name: z.string().describe("New folder name, not a path"),
  },
  annotations: writeAnnotations({ destructive: true, idempotent: true }),
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request("PUT", foldersPath(args.drive as string), {
          json: { path: args.path, new_name: args.new_name },
        })
      )
    ),
};

const moveFolder: LitloftTool = {
  name: "move_folder",
  description:
    "Move the folder at `path` into the parent folder `target_path` ('' for the drive root); it keeps its name, so pass the destination parent, not the new full path. A missing parent is created.",
  inputSchema: {
    drive: z.string(),
    path: z.string().describe("Folder path to move"),
    target_path: z.string().describe("Parent folder to move it into"),
  },
  annotations: writeAnnotations({ destructive: true, idempotent: true }),
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request("PUT", `${foldersPath(args.drive as string)}/move`, {
          json: { path: args.path, target_path: args.target_path },
        })
      )
    ),
};

const trashFolder: LitloftTool = {
  name: "trash_folder",
  description:
    "Move every file under the folder at `path` to trash (restorable for 30 days with restore_file / restore_files); nothing is deleted permanently. The folder stops being listed, but its directory stays on disk: creating a folder with the same name fails until it is gone, and it can reappear as an empty folder after the next scan.",
  inputSchema: {
    drive: z.string(),
    path: z.string().describe("Folder path"),
  },
  annotations: writeAnnotations({ destructive: true, idempotent: true }),
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request("DELETE", foldersPath(args.drive as string), {
          query: { path: args.path as string },
        })
      )
    ),
};

export const folderTools: LitloftTool[] = [createFolder, renameFolder, moveFolder, trashFolder];
