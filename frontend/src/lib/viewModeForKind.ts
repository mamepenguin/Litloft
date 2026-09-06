import type { FolderKind, ViewMode } from "@/types";

/**
 * Which view a listing opens in, when nobody has chosen one for it.
 *
 * The question the table answers is **can a card of this kind show
 * anything**. A grid is a wall of pictures; where there is no picture it
 * is a wall of the same icon repeated, which says less per screen than a
 * list does and takes four times the space to say it (COL-1: fifty songs
 * as fifty identical headphone glyphs).
 *
 * So the value for a kind follows from `FileCard`'s own thumbnail
 * branches, not from taste:
 *
 * | kind | card shows | mode |
 * |---|---|---|
 * | video, image | a generated thumbnail | grid |
 * | pdf | its first page | grid |
 * | document | `TextThumbnail` — the shape of the text | grid |
 * | markdown | `TextThumbnail`, but a note is read by its title | list |
 * | audio, archive, other | `FileTypeIcon`, the same glyph every time | list |
 *
 * **Two rows hold for most of the kind rather than all of it.**
 * `TextThumbnail` covers `text/*` and the three OOXML mimes
 * (`lib/officeFiles.ts`), so a folder of `.doc` / `.xls` / `.ppt` is
 * `document` and gets the icon; and `generate_pdf_thumbnail` runs on
 * `application/pdf` only, so a `.pdf` whose mime was never recorded gets
 * the icon too. Both are minorities of their kind, and both would be
 * better fixed where the picture is made than by splitting the kind: a
 * table with a row per mime is not a rule anyone can hold in their head.
 * Stated rather than left implied, because "derived from the card" is
 * the whole claim this module rests on.
 *
 * `markdown` is the one row not derived from the picture at all: it can
 * draw one and still opens as a list, because a wall of note previews is
 * not how a notebook is navigated. It was already `list` before this
 * table existed.
 *
 * **A `Record`, not a `switch` with a `default`.** The default arm is
 * what let `audio` sit in the wrong bucket unnoticed; with every key
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
