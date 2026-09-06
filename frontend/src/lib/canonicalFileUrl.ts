import type { FileItem } from "@/types";

/**
 * Query keys forwarded from ``/files/{id}?...`` to the canonical
 * 2-pane URL ``/drive/{drive}/{folder}?file={id}&...``. Anything not
 * listed here is dropped on redirect.
 *
 * - ``t / page / highlight / sort / order``: legacy callers (player
 *   resume, search results, wiki anchors).
 * - ``edit``: Phase 2 Pre-PR — Knowledge editor auto-start signal
 *   forwarded so ``useCreateFile``'s ``router.push("/files/${id}?edit=1")``
 *   reaches the inline editor through the redirect.
 * - ``nav``: which sequence the reader was walking when they opened
 *   this file. Set by the listing, read only by
 *   ``lib/fileNavOrdering.ts``. It has to survive the redirect because
 *   the redirect is exactly what destroys the evidence: it rewrites the
 *   path to the file's own folder and drops ``view`` / ``q`` / ``tag``
 *   / ``smart_folder_id``, so by the time the pane renders, a file
 *   opened out of Liked is indistinguishable from one opened out of its
 *   folder.
 */
export const CARRIED_QUERY_KEYS = [
  "t",
  "page",
  "highlight",
  "sort",
  "order",
  "edit",
  "nav",
] as const;

/**
 * Build the canonical 2-pane URL for ``file``. Used by the
 * ``/files/[id]`` Server Component (Phase 1 PR-5) and the Knowledge
 * ``Page.tsx`` (Phase 2 PR-3 case P) to converge legacy fullscreen
 * links onto the right-pane view.
 *
 * ``sp`` accepts the lenient Next.js ``searchParams`` shape (where
 * each value may be ``string | string[] | undefined``) so callers can
 * pass it through without normalising. Array / undefined values are
 * dropped — same behaviour as the original Server Component
 * implementation.
 */
export function buildCanonicalFileUrl(
  file: Pick<FileItem, "drive" | "folder_path">,
  fileId: string,
  sp: Record<string, string | string[] | undefined> = {},
): string {
  const carried = new URLSearchParams();
  carried.set("file", fileId);
  for (const key of CARRIED_QUERY_KEYS) {
    const v = sp[key];
    if (typeof v === "string" && v.length > 0) {
      carried.set(key, v);
    }
  }
  const drivePart = encodeURIComponent(file.drive);
  const folderPart = file.folder_path
    ? "/" +
      file.folder_path
        .split("/")
        .filter(Boolean)
        .map(encodeURIComponent)
        .join("/")
    : "";
  return `/drive/${drivePart}${folderPart}?${carried.toString()}`;
}
