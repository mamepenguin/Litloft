import { normalizeSortParam } from "@/lib/sortField";

/**
 * Sort keys `/api/files/{id}/neighbors` will accept.
 *
 * A superset reaches the listing — `random` and `relevance` order a
 * search result set, and neither is a keyset the endpoint can walk — so
 * forwarding one 422s. The viewer then catches, renders no neighbours,
 * and the reader gets two permanently disabled arrows.
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
   * **This is declared by the listing, never inferred here.** Inferring
   * it was the first attempt and it did not work: `/files/{id}`
   * redirects to the file's own folder and carries only a handful of
   * query keys, so `view` / `q` / `tag` / `smart_folder_id` are gone by
   * the time this runs — and `typeFilter` / `trustFilter` / the name box
   * were never in the URL at all. A guard reading the URL saw a plain
   * folder in every one of those cases and drew a count for a sequence
   * the arrows could not walk.
   *
   * The listing is the only place that knows, and it knows at the moment
   * of the click. So it says so, and this reads what it said. Anything
   * that does not say it is not counted — including surfaces that never
   * go through the redirect at all, such as a collection, whose order is
   * a hand-made position and whose rows can span folders.
   */
  countable: boolean;
}

/**
 * What ordering the prev/next walk should use, and whether it can be
 * counted.
 *
 * The order comes from the URL, which is where both listings already put
 * it — the folder listing writes `?sort=&order=` into its file links and
 * the redirect carries them, and the drive root does the same. An
 * earlier version read `folderPrefs` instead, which was wrong twice
 * over: the drive root never writes a `folderPrefs` entry, and reading a
 * second source let the arrows and the full-screen gallery walk two
 * different orderings of one folder.
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
    // A sort the endpoint cannot walk is not countable either: `random`
    // has no place to hold, and an absent one means the listing did not
    // name its order.
    countable: params.get("nav") === PLAIN_FOLDER_NAV && sort !== undefined,
  };
}
