import type { FileItem, FileType } from "@/types";
import { formatDuration, formatFileSize } from "./format";

/**
 * What a file says first about itself, beneath its name.
 *
 * Every surface used to lead with the size, which is the one fact a
 * listing is least often asked for — and on a `.loft` reference file it
 * is a lie, since the row's `file_size` is the pointer's, not the
 * media's. D-3's example was a 19-minute video labelled "83 B".
 *
 * The rule is not a list of exceptions but a question asked of each
 * kind: **what has this surface not already said, that a reader would
 * use to tell this file from the one beside it?**
 *
 * | kind | first metadatum | why |
 * |---|---|---|
 * | video, audio | none | the length is the fact worth having, and every surface already has its own place for it; the size is the wrong number for a reference file |
 * | image | its dimensions | the one fact that distinguishes two photographs at card size |
 * | everything else | its size | the branch that was always right |
 *
 * The date follows in every case a surface draws one: measured against
 * real listings it was the only column with reliable distinguishing
 * power (`00-basis`).
 *
 * **A kind gets one answer, not two.** An image whose dimensions were
 * never probed shows the date alone rather than falling back to its
 * size — a fallback would make "kind → first metadatum" stop being a
 * function, and two image cards side by side would describe themselves
 * differently for a reason invisible to the reader. Nothing is drawn
 * where nothing is known (原則 1).
 *
 * **Where the length goes is the surface's business, not this rule's**,
 * and it is the one thing to settle before handing this table to a new
 * surface. The callers split on it, and on nothing else:
 *
 * - **It says the length elsewhere already.** `FileCard`, `FileListRow`,
 *   `TrashFileList` and `MissingFileList` put it on a thumbnail badge,
 *   under `hasKnownLength`; `AudioPlayer` has the transport bar of an
 *   `<audio controls>`. These call `primaryMetaText`, and for video and
 *   audio it correctly gives them nothing to add.
 * - **It has nowhere else to say it.** `FileMetaBlock`, `TrashFileGrid`,
 *   `MissingFileGrid` and the duplicates panel's file row draw the
 *   length themselves at the head of the line this rule finishes —
 *   `primaryMetaLine` below. On a trash card that is not an oversight to
 *   correct by adding a badge: the corner `FileCard` puts the length in
 *   (`bottom-2 right-2`) is already the deadline's, which is the fact
 *   that surface exists to say.
 *
 * `JustifiedFileCell` is the one surface that draws a badge and no meta
 * line at all — its cells are unequal widths, so a caption would not
 * line up into a column. It takes `hasKnownLength` and nothing else.
 *
 * On every one of them the video branch is `none` for the same reason,
 * and where the length was never probed none of them substitutes the
 * size.
 *
 * What is **not** covered by this table is a quantity that is not a fact
 * about one file: disk and cache usage (`admin/page.tsx`), a duplicate
 * group's wasted bytes, a "too large to preview" warning
 * (`TextPreview`), an entry inside an archive, and the size on
 * `FilePreview`'s no-preview panel, which qualifies the Download button
 * beside it and which `playerKind` makes unreachable for video and
 * audio anyway.
 */
export type PrimaryMeta =
  | { kind: "none" }
  | { kind: "size" }
  | { kind: "dimensions"; width: number; height: number };

const NO_PRIMARY: ReadonlySet<FileType> = new Set<FileType>(["video", "audio"]);

export function primaryMeta(file: FileItem): PrimaryMeta {
  if (NO_PRIMARY.has(file.file_type)) return { kind: "none" };
  if (file.file_type === "image") {
    return file.image_width !== null && file.image_height !== null
      ? { kind: "dimensions", width: file.image_width, height: file.image_height }
      : { kind: "none" };
  }
  return { kind: "size" };
}

/**
 * Whether this file has a length worth drawing anywhere.
 *
 * One definition rather than the copy each badge used to spell out, so
 * a surface cannot draw a badge under one condition and suppress its
 * size under another — which is precisely the disagreement that lets a
 * fact go missing from a card altogether.
 */
export function hasKnownLength(file: FileItem): boolean {
  return (
    (file.file_type === "video" || file.file_type === "audio") &&
    file.duration != null
  );
}

/** `1920 × 1080`, with the multiplication sign rather than a letter x. */
export function formatDimensions(width: number, height: number): string {
  return `${width} × ${height}`;
}

/**
 * The rule already rendered, or `null` where the kind has nothing to
 * say. Three surfaces draw this string in three different wrappers, and
 * a ternary copied into each of them is three places for the image
 * branch to be forgotten.
 */
export function primaryMetaText(file: FileItem): string | null {
  const meta = primaryMeta(file);
  switch (meta.kind) {
    case "none":
      return null;
    case "dimensions":
      return formatDimensions(meta.width, meta.height);
    case "size":
      return formatFileSize(file.file_size);
  }
}

/**
 * The whole first line, for a surface that has no other place to put a
 * length: the length where it is known, otherwise whatever the table
 * adds, and `null` where the file has neither.
 *
 * **One string, never two.** The two halves are mutually exclusive by
 * construction — `hasKnownLength` is true only for the kinds
 * `primaryMeta` answers `none` for — so this returns a value rather than
 * a list, and no caller carries a separator that could never be reached.
 * An earlier version returned an array and joined it with `" · "`; the
 * join was dead code that read as if it were load-bearing.
 *
 * `null` is a real answer, and the caller is expected to draw nothing at
 * all rather than an empty line — a video whose length was never probed
 * has neither half, and on a folder of `.loft` references that is most
 * of them.
 */
export function primaryMetaLine(file: FileItem): string | null {
  if (hasKnownLength(file)) return formatDuration(file.duration);
  return primaryMetaText(file);
}
