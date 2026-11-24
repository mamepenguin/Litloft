import { z } from "zod";
import { LitloftApiError, type LitloftClient } from "../client.js";
import { summarizeFile } from "./read.js";
import { runTool } from "./runTool.js";
import { readOnlyAnnotations, textResult, type LitloftTool } from "./types.js";

export const SMART_COLLECTION_MEMBERS_PATH = "/app-api/smart-collection-members";
export const SMART_COLLECTION_ENDPOINT_MISSING =
  "This Litloft server has no Smart Collection endpoint; update Litloft.";

/**
 * The zone this machine reads dates in, sent so a Smart Collection with an
 * absolute `modified:` date is evaluated where the viewer reads it.
 */
export function hostTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

interface CollectionRow {
  id: string;
  name: string;
  [key: string]: unknown;
}

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

export interface SmartFolder {
  id: string;
  name: string;
  query: string;
  file_type: string | null;
}

interface SmartCollectionPage {
  id: string;
  name: string;
  query: string;
  file_type: string | null;
  complete: boolean;
  total: number;
  files: Record<string, unknown>[];
}

// A Litloft too old to have the endpoint answers its path with an HTML 404,
// so the body arrives as text rather than the endpoint's JSON error object.
export function isMissingSmartCollectionEndpoint(err: unknown): boolean {
  return err instanceof LitloftApiError && err.status === 404 && typeof err.body === "string";
}

// A state key the core omitted means "not in that state", so a file without
// deleted_at or missing_since is still active.
function isActive(file: Record<string, unknown>): boolean {
  return file.deleted_at == null && file.missing_since == null;
}

const NAME_ORDER = new Intl.Collator("ja", { numeric: true });

function compareRows(
  a: { id: string; name: string; kind: string },
  b: { id: string; name: string; kind: string }
): number {
  const byName = NAME_ORDER.compare(a.name, b.name);
  if (byName !== 0) return byName;
  if (a.kind !== b.kind) return a.kind === "collection" ? -1 : 1;
  if (a.id < b.id) return -1;
  return a.id > b.id ? 1 : 0;
}

const listCollections: LitloftTool = {
  name: "list_collections",
  description:
    "List a drive's collections (also called playlists) and its Smart Collections, in one list ordered by name. A collection holds files of one drive; a Smart Collection is a saved search whose items are computed when read. Every row carries kind ('collection' or 'smart'); read one with get_collection, whose item ids can be passed to the other file tools.",
  inputSchema: { drive: z.string().describe("Drive name") },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool(async () => {
      const drive = encodeURIComponent(args.drive as string);
      const [collections, smartFolders] = await Promise.all([
        client.request<CollectionRow[]>("GET", `/api/drives/${drive}/collections`),
        client.request<SmartFolder[]>("GET", `/api/drives/${drive}/smart-folders`),
      ]);
      const rows = [
        ...collections.map((row) => ({ ...row, kind: "collection" })),
        ...smartFolders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          kind: "smart",
          query: folder.query,
          file_type: folder.file_type,
        })),
      ];
      rows.sort(compareRows);
      return textResult(rows);
    }),
};

async function smartCollectionResult(
  args: Record<string, unknown>,
  client: LitloftClient,
  notFound: LitloftApiError
) {
  const drive = args.drive as string;
  const id = args.collection_id as string;
  const folders = await client.request<SmartFolder[]>(
    "GET",
    `/api/drives/${encodeURIComponent(drive)}/smart-folders`
  );
  const folder = folders.find((entry) => entry.id === id);
  if (!folder) throw notFound;

  const offset = (args.offset as number | undefined) ?? 0;
  const limit = (args.limit as number | undefined) ?? 50;
  let page: SmartCollectionPage;
  try {
    page = await client.request<SmartCollectionPage>("GET", SMART_COLLECTION_MEMBERS_PATH, {
      query: { drive, id: folder.id, offset, limit, tz: hostTimeZone() },
    });
  } catch (err) {
    if (isMissingSmartCollectionEndpoint(err)) {
      throw new Error(SMART_COLLECTION_ENDPOINT_MISSING);
    }
    throw err;
  }

  const full = args.fields === "full";
  return textResult({
    id: page.id,
    name: page.name,
    kind: "smart",
    query: page.query,
    file_type: page.file_type,
    complete: page.complete,
    total: page.total,
    offset,
    items: page.files.map((file, index) => ({
      position: offset + index,
      file: full ? file : summarizeFile(file),
    })),
  });
}

const getCollection: LitloftTool = {
  name: "get_collection",
  description:
    "Read a collection (also called a playlist) or a Smart Collection, which holds files of one drive. A collection item is { item_id, position, file }; trashed and missing items are left out and counted in inactive_count. A Smart Collection is a saved search whose items are computed when read: it returns { total, offset, complete, items: [{ position, file }] } and is paged with offset and limit (default 50, at most 200); complete: false means meaning search could not be read, so items may be missing. The file ids can be passed to the other file tools. fields: 'summary' (default) keeps the main fields of each file; 'full' returns every field.",
  inputSchema: {
    drive: z.string().describe("Drive name"),
    collection_id: z.string().describe("Collection or Smart Collection id"),
    fields: z
      .enum(["summary", "full"])
      .optional()
      .describe(
        "'summary' (default) keeps the main fields of each file; 'full' returns every field"
      ),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Smart Collection only: index of the first item (default 0)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Smart Collection only: items to return (default 50, max 200)"),
  },
  annotations: readOnlyAnnotations,
  handler: (args, client) =>
    runTool(async () => {
      let detail: CollectionDetail;
      try {
        detail = await client.request<CollectionDetail>(
          "GET",
          `/api/drives/${encodeURIComponent(args.drive as string)}/collections/${encodeURIComponent(args.collection_id as string)}`
        );
      } catch (err) {
        if (err instanceof LitloftApiError && err.status === 404) {
          return await smartCollectionResult(args, client, err);
        }
        throw err;
      }
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
        kind: "collection",
        items,
        inactive_count: allItems.length - items.length,
      });
    }),
};

export const collectionTools: LitloftTool[] = [listCollections, getCollection];
