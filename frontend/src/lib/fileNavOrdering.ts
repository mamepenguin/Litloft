import { resolveFolderSort } from "@/hooks/useFolderViewMode";
import { isCrossFolderView, isStandaloneView } from "@/lib/driveViews";
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

export interface FileNavOrdering {
  sort: string | undefined;
  order: string | undefined;
  /**
   * Whether an `n / N` readout would be true.
   *
   * The arrows walk the file's folder in a stored order. The listing the
   * reader came from may be walking something else — a search result
   * set, a tag, a cross-folder view — and `/neighbors` has no way to
   * reproduce those: the listing is unmounted the moment a file is
   * selected (`TwoPaneLayout` swaps it for the pane), so its filters are
   * not merely unread, they no longer exist.
   *
   * The ruling is that a count is drawn only when the readout, the
   * arrows and the listing are the same sequence. Where they are not,
   * the arrows still work and the number is simply absent — a wrong `N`
   * says a file is there that nothing can reach, which is worse than no
   * `N` at all.
   */
  countable: boolean;
}

/**
 * What ordering the prev/next walk should use, and whether it can be
 * counted.
 *
 * The sort is read from the same `folderPrefs` entry the listing reads,
 * not from the URL: a folder-anchored listing keeps its sort in
 * localStorage and never writes it to the URL, so taking `?sort=` here
 * asked `/neighbors` for `created_at desc` while the reader was looking
 * at "Name A-Z" — and the readout then named a position in an ordering
 * nobody could see.
 */
export function resolveFileNavOrdering({
  drive,
  folderPath,
  params,
}: {
  drive: string;
  folderPath: string | undefined;
  params: URLSearchParams;
}): FileNavOrdering {
  const view = params.get("view");
  const urlSort = normalizeSortParam(params.get("sort"));
  const listingIsElsewhere =
    !!params.get("q") ||
    !!params.get("tag") ||
    !!params.get("smart_folder_id") ||
    params.get("recursive") === "true" ||
    isCrossFolderView(view) ||
    isStandaloneView(view);

  if (listingIsElsewhere) {
    return {
      // The URL's sort still applies where there is one — the Liked view
      // puts `liked_at` there, and the walk should follow it.
      sort: urlSort && NEIGHBOURS_SORTS.has(urlSort) ? urlSort : undefined,
      order: params.get("order") ?? undefined,
      countable: false,
    };
  }

  // A plain folder listing. Its order is the folder's stored preference,
  // which is exactly what the arrows should follow — and `random`, which
  // a folder may hold, is an order the endpoint cannot walk and nothing
  // can be counted in anyway.
  const stored = resolveFolderSort(drive, folderPath ?? "");
  if (!NEIGHBOURS_SORTS.has(stored.sort)) {
    return { sort: undefined, order: undefined, countable: false };
  }
  return { sort: stored.sort, order: stored.order, countable: true };
}
