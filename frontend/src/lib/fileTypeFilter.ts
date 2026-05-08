import type { FileItem, TreeTypeFilter } from "@/types";

/**
 * Returns true if `file` should be visible under `filter`. The four
 * tree-type buckets map to MIME prefixes (with markdown / pdf
 * recognised by their specific media types).
 *
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §3.3.
 */
export function fileMatchesTypeFilter(
  file: Pick<FileItem, "filename" | "mime_type" | "file_type">,
  filter: TreeTypeFilter,
): boolean {
  const mime = (file.mime_type || "").toLowerCase();
  const name = file.filename.toLowerCase();
  switch (filter) {
    case "markdown":
      return mime === "text/markdown" || name.endsWith(".md");
    case "video":
      return mime.startsWith("video/") || file.file_type === "video";
    case "image":
      return mime.startsWith("image/") || file.file_type === "image";
    case "pdf":
      return mime === "application/pdf" || name.endsWith(".pdf");
    default:
      return false;
  }
}
