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
 * Returns the kind holding **more than half** the files, or null when
 * no kind does — "what the folder mostly holds", which is what both the
 * view-mode rule and the user guide say this means.
 *
 * A plurality is not enough, and the difference decides whether a
 * viewer's global view preference is ever consulted. `viewModeForKind`
 * answers for every kind there is, so a plurality here would mean every
 * non-empty folder is answered by the kind table and the global
 * preference is unreachable — a folder of 40% other / 30% video / 30%
 * image would open as a list on the strength of a 40% plurality, for a
 * viewer who asked for grids everywhere. `dominantCollectionKind` has
 * always gated on a majority; this is the same rule on the other
 * surface (原則 4).
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
