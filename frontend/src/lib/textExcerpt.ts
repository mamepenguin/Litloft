import type { FileItem } from "@/types";
import { OFFICE_MIMES } from "@/lib/officeFiles";

export function hasThumbnail(file: FileItem): boolean {
  return (
    file.has_thumbnail || file.file_type === "video" || file.file_type === "image"
  );
}

/**
 * Source files (`.c`, `.h`, `.py`) are filed as `other` with a `text/*`
 * mime, so the text side is a mime prefix test and not a `document` bucket
 * test.
 */
export function showsTextExcerpt(file: FileItem): boolean {
  if (hasThumbnail(file) || !file.mime_type) return false;
  if (file.mime_type.startsWith("text/")) {
    return file.file_type === "document" || file.file_type === "other";
  }
  return file.file_type === "document" && OFFICE_MIMES.has(file.mime_type);
}

export function showsRawExcerpt(file: FileItem): boolean {
  return (
    file.file_type === "other" && Boolean(file.mime_type?.startsWith("text/"))
  );
}
