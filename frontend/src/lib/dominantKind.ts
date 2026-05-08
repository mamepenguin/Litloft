import type { FileItem, FolderKind } from "@/types";

/**
 * Approximate the parent-folder dominant_kind from a sample of files.
 *
 * The backend computes this recursively for each Folder record (Phase 1
 * commit 0f09611), but the listing endpoint only carries dominant_kind
 * for child folders, not for the folder currently being viewed. As a
 * v1 stand-in we derive it from the loaded files using the same
 * classification rules as `backend/app/routers/drives.py:_classify_kind`:
 *
 *   mime "text/markdown"    → markdown
 *   mime "application/pdf"  → pdf
 *   file_type "video"       → video
 *   file_type "image"       → image
 *   file_type "audio"       → audio
 *   file_type "document"    → document
 *   else                    → other
 *
 * Returns the most common kind, or null when there are no files. Ties
 * are broken deterministically by the order of the input list.
 */
export function deriveDominantKind(files: FileItem[]): FolderKind | null {
  if (files.length === 0) return null;
  const counts = new Map<FolderKind, number>();
  for (const file of files) {
    const kind = classify(file);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  let bestKind: FolderKind | null = null;
  let bestCount = 0;
  for (const [kind, count] of counts) {
    if (count > bestCount) {
      bestKind = kind;
      bestCount = count;
    }
  }
  return bestKind;
}

function classify(file: FileItem): FolderKind {
  if (file.mime_type === "text/markdown") return "markdown";
  if (file.mime_type === "application/pdf") return "pdf";
  switch (file.file_type) {
    case "video":
      return "video";
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "document":
      return "document";
    default:
      return "other";
  }
}
