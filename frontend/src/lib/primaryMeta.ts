import type { FileItem, FileType } from "@/types";
import { formatFileSize } from "./format";

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
 * **Where the length goes is the surface's business, not this rule's.**
 * The three callers differ only in that:
 *
 * - `FileCard` and `FileListRow` draw it as a badge on the thumbnail,
 *   both under `duration != null`, so the meta row never repeats it.
 * - `FileMetaBlock` has no thumbnail to put a badge on, so it draws the
 *   length inline at the head of the same line this rule finishes.
 *
 * In all three the video branch is `none` for the same reason, and
 * where the length was never probed all three say nothing rather than
 * substituting the size.
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
