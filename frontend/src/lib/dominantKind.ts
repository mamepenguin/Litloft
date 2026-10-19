import { isTextKind } from "@/lib/textKind";
import type { FileItem, FolderKind } from "@/types";

/**
 * Uses the same classification rules as
 * `backend/app/routers/drives.py:_classify_kind`.
 *
 * A plurality is not enough: `viewModeForKind` answers for every kind there
 * is, so a plurality here would make the global view preference unreachable.
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
  return bestCount > files.length / 2 ? bestKind : null;
}

function classify(file: FileItem): FolderKind {
  if (isTextKind(file.mime_type, file.filename)) return "text";
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
