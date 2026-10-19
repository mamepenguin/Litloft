import { normalizeSortParam } from "@/lib/sortField";

/**
 * Sort keys `/api/files/{id}/neighbors` will accept. Forwarding any other
 * 422s, and the reader gets two permanently disabled arrows.
 */
const NEIGHBOURS_SORTS = new Set([
  "created_at",
  "title",
  "file_size",
  "liked_at",
]);

/**
 * The value a listing puts in `nav` to say "the rows I am showing are
 * this file's folder, in the order this same URL names, and nothing
 * else".
 */
export const PLAIN_FOLDER_NAV = "folder";

export interface FileNavOrdering {
  sort: string | undefined;
  order: string | undefined;
  /**
   * Whether an `n / N` readout would be true of what the reader was
   * looking at.
   *
   * **This is declared by the listing, never inferred here.** `/files/{id}`
   * redirects to the file's own folder and carries only a handful of
   * query keys, and some filters were never in the URL at all, so a guard
   * reading the URL sees a plain folder where the arrows cannot walk one.
   */
  countable: boolean;
}

/**
 * The order comes from the URL, not `folderPrefs`: the drive root never
 * writes a `folderPrefs` entry, and reading a second source lets the arrows
 * and the full-screen gallery walk two different orderings of one folder.
 */
export function resolveFileNavOrdering({
  params,
}: {
  params: URLSearchParams;
}): FileNavOrdering {
  const urlSort = normalizeSortParam(params.get("sort"));
  const sort = urlSort && NEIGHBOURS_SORTS.has(urlSort) ? urlSort : undefined;
  const order = params.get("order") ?? undefined;
  return {
    sort,
    order,
    countable: params.get("nav") === PLAIN_FOLDER_NAV && sort !== undefined,
  };
}
