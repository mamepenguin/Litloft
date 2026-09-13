import type { FileItem } from "@/types";
import { hasKnownRatio } from "./justifiedGrid";

/**
 * "Differ" is measured over the rows that are loaded, not the folder:
 * there is no per-folder type facet on the backend.
 */
export interface ListMeta {
  showTypeLabel: boolean;
  showExtensionBadge: boolean;
  /**
   * True only when nearly every loaded row is an image whose dimensions are
   * known.
   */
  justifyThumbnails: boolean;
}

/**
 * Not 100%: a folder of photographs routinely holds a stray `.txt` or a
 * file whose header would not parse.
 */
export const JUSTIFY_THRESHOLD = 0.9;

function badgeExtension(file: FileItem): string | null {
  if (file.file_type === "video" || file.file_type === "audio") return null;
  if (!file.filename.includes(".")) return null;
  // The badge renders `uppercase`, so `.JPG` and `.jpg` are one value.
  return file.filename.split(".").pop()!.toLowerCase();
}

export function deriveListMeta(files: readonly FileItem[]): ListMeta {
  if (files.length < 2) {
    // A list of one has no repetition to remove, and nothing to pack
    // against either — a single cell stretched to the full row width is
    // not a justified row, it is one very large thumbnail.
    return {
      showTypeLabel: true,
      showExtensionBadge: true,
      justifyThumbnails: false,
    };
  }

  const types = new Set(files.map((f) => f.file_type));

  const extensions = new Set<string>();
  let badged = 0;
  for (const file of files) {
    const ext = badgeExtension(file);
    if (ext === null) continue;
    badged += 1;
    extensions.add(ext);
  }

  const measurable = files.filter(hasKnownRatio).length;

  return {
    showTypeLabel: types.size > 1,
    // Same threshold, applied to the rows the column actually covers: a
    // single badge among many rows is what marks that row out.
    showExtensionBadge: badged < 2 || extensions.size > 1,
    justifyThumbnails: measurable >= files.length * JUSTIFY_THRESHOLD,
  };
}
