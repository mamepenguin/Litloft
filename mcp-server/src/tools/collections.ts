import { z } from "zod";
import { summarizeFile } from "./read.js";
import { runTool } from "./runTool.js";
import { readOnlyAnnotations, textResult, type LitloftTool } from "./types.js";

interface CollectionItem {
  id: number;
  position: number;
  file: Record<string, unknown>;
}

interface CollectionDetail {
  id: string;
  name: string;
  description: string | null;
  drive: string;
  created_at: string;
  updated_at: string;
  items: CollectionItem[];
}

// A state key the core omitted means "not in that state", so a file without
// deleted_at or missing_since is still active.
function isActive(file: Record<string, unknown>): boolean {
  return file.deleted_at == null && file.missing_since == null;
}

const listCollections: LitloftTool = {
  name: "list_collections",
  description:
    "List a drive's collections (also called playlists). A collection holds files of one drive; read one with get_collection, whose item ids can be passed to the other file tools.",
  inputSchema: { drive: z.string().describe("Drive name") },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool(async () =>
      textResult(
        await client.request(
          "GET",
          `/api/drives/${encodeURIComponent(args.drive as string)}/collections`
        )
      )
    ),
};

const getCollection: LitloftTool = {
  name: "get_collection",
  description:
    "Read a collection (also called a playlist), which holds files of one drive. Each item is { item_id, position, file }; the file ids can be passed to the other file tools. Trashed and missing items are left out and counted in inactive_count. fields: 'summary' (default) keeps the main fields of each file; 'full' returns every field.",
  inputSchema: {
    drive: z.string().describe("Drive name"),
    collection_id: z.string().describe("12-character collection id"),
    fields: z
      .enum(["summary", "full"])
      .optional()
      .describe(
        "'summary' (default) keeps the main fields of each file; 'full' returns every field"
      ),
  },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool(async () => {
      const detail = await client.request<CollectionDetail>(
        "GET",
        `/api/drives/${encodeURIComponent(args.drive as string)}/collections/${encodeURIComponent(args.collection_id as string)}`
      );
      const full = args.fields === "full";
      const { items: allItems, ...rest } = detail;
      const items = allItems
        .filter((item) => isActive(item.file))
        .map((item) => ({
          item_id: item.id,
          position: item.position,
          file: full ? item.file : summarizeFile(item.file),
        }));
      return textResult({
        ...rest,
        items,
        inactive_count: allItems.length - items.length,
      });
    }),
};

export const collectionTools: LitloftTool[] = [listCollections, getCollection];
