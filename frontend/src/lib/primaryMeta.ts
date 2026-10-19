import type { FileItem, FileType } from "@/types";
import { formatDuration, formatFileSize } from "./format";

/**
 * On a `.loft` reference file the size is a lie, since the row's
 * `file_size` is the pointer's, not the media's.
 *
 * **A kind gets one answer, not two.** An image whose dimensions were
 * never probed shows the date alone rather than falling back to its
 * size.
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

export function hasKnownLength(file: FileItem): boolean {
  return (
    (file.file_type === "video" || file.file_type === "audio") &&
    file.duration != null
  );
}

export function formatDimensions(width: number, height: number): string {
  return `${width} × ${height}`;
}

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
 * `null` is a real answer, and the caller is expected to draw nothing at
 * all rather than an empty line.
 */
export function primaryMetaLine(file: FileItem): string | null {
  if (hasKnownLength(file)) return formatDuration(file.duration);
  return primaryMetaText(file);
}
