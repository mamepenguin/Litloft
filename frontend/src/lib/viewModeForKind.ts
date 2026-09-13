import type { FolderKind, ViewMode } from "@/types";

/**
 * The question the table answers is **can a card of this kind show
 * anything**. A grid is a wall of pictures; where there is no picture it
 * is a wall of the same icon repeated, which says less per screen than a
 * list does.
 *
 * `markdown` is the one row not derived from the picture at all: it can
 * draw one and still opens as a list, because a wall of note previews is
 * not how a notebook is navigated.
 *
 * **A `Record`, not a `switch` with a `default`.** With every key
 * required, adding a `FolderKind` fails to compile until someone decides
 * what its cards look like.
 */
const VIEW_MODE_FOR_KIND: Record<FolderKind, ViewMode> = {
  video: "grid",
  image: "grid",
  pdf: "grid",
  document: "grid",
  markdown: "list",
  audio: "list",
  archive: "list",
  other: "list",
};

/**
 * `null` in, `null` out: a listing with no dominant kind is mixed, and
 * a mixed listing has no answer here — it falls through to whatever the
 * viewer's global default is.
 */
export function viewModeForKind(kind: FolderKind | null): ViewMode | null {
  return kind === null ? null : VIEW_MODE_FOR_KIND[kind];
}
