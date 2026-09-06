import type { FileItem, FileType } from "@/types";

/**
 * What a file card says first, beneath its title.
 *
 * Every card used to lead with its size, which is the one fact a
 * listing is least often asked for — and on a `.loft` reference file it
 * is a lie, since the row's `file_size` is the pointer's, not the
 * media's. D-3's example was a 19-minute video labelled "83 B".
 *
 * The rule is not a list of exceptions but a question asked of each
 * kind: **what has this card not already said, that a reader would use
 * to tell it from the one beside it?**
 *
 * | kind | first metadatum | why |
 * |---|---|---|
 * | video, audio | none | the length is already on the thumbnail badge, and the size is the wrong number for a reference file |
 * | image | its dimensions | the one fact that distinguishes two photographs at card size |
 * | everything else | its size | the branch that was always right |
 *
 * The date follows in every case: measured against real listings it was
 * the only column with reliable distinguishing power (`00-basis`).
 *
 * **A kind gets one answer, not two.** An image whose dimensions were
 * never probed shows the date alone rather than falling back to its
 * size — a fallback would make "kind → first metadatum" stop being a
 * function, and two image cards side by side would describe themselves
 * differently for a reason invisible to the reader. Nothing is drawn
 * where nothing is known (原則 1).
 */
export type CardPrimaryMeta =
  | { kind: "none" }
  | { kind: "size" }
  | { kind: "dimensions"; width: number; height: number };

const NO_PRIMARY: ReadonlySet<FileType> = new Set<FileType>(["video", "audio"]);

export function cardPrimaryMeta(file: FileItem): CardPrimaryMeta {
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
