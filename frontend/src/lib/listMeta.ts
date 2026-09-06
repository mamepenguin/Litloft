import type { FileItem } from "@/types";
import { hasKnownRatio } from "./justifiedGrid";

/**
 * Which repeated columns a file listing should bother drawing.
 *
 * A column whose every row says the same word is not telling the reader
 * anything: in a folder of 138 videos the type label read "Video" 30
 * times out of 30 visible rows, and in a folder of photographs the
 * extension badge read "JPG" 995 times. The rule is general rather than
 * per-folder — draw a column only where its values differ — so a mixed
 * folder keeps both and a uniform one keeps neither, without either
 * case being special.
 *
 * "Differ" is measured over the rows that are loaded, not the folder:
 * the listing pages 30 at a time and there is no per-folder type facet
 * on the backend. So a second page that brings in another kind turns
 * the label on from there. That is the rule working, not a gap in it —
 * the label appears exactly when it starts distinguishing something.
 */
export interface ListMeta {
  showTypeLabel: boolean;
  showExtensionBadge: boolean;
  /**
   * Whether the listing may pack its thumbnails at their real
   * proportions instead of into equal 16:9 cards. True only when nearly
   * every loaded row is an image whose dimensions are known — see
   * `DESIGN.md` §8.5 "Justified thumbnail rows".
   *
   * This is the second column of the same question the flags above ask:
   * a folder of 995 photographs is told apart from a folder of videos by
   * what is in it, not by a switch the reader has to find. A justified
   * cell carries no meta row, and in a video folder the relative date is
   * the one column that was still distinguishing anything, so video
   * folders stay on equal cards.
   */
  justifyThumbnails: boolean;
}

/**
 * How much of a listing has to be measurable images before it packs.
 *
 * Not 100%: a folder of photographs routinely holds a stray `.txt` or a
 * file whose header would not parse, and one such row should not put
 * 995 photographs back into letterboxed cards. The rows that fall
 * outside are drawn square (`JG_FALLBACK_RATIO`).
 */
export const JUSTIFY_THRESHOLD = 0.9;

/** Rows that would carry an extension badge at all. */
function badgeExtension(file: FileItem): string | null {
  if (file.file_type === "video" || file.file_type === "audio") return null;
  if (!file.filename.includes(".")) return null;
  // The badge renders `uppercase`, so `.JPG` and `.jpg` are one value.
  return file.filename.split(".").pop()!.toLowerCase();
}

export function deriveListMeta(files: readonly FileItem[]): ListMeta {
  // A list of one has no repetition to remove; hiding a column there
  // would only take information away.
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
