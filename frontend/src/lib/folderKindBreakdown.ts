import type { FolderKind } from "@/types";

/**
 * Which kinds a folder card names beside its total, and in which order.
 *
 * A folder used to say only how many files it held, with a photograph
 * borrowed from somewhere beneath it — so two folders side by side showed
 * a photo and a glyph in the same column, and neither told you what was
 * in them (D-4). The count stays; the picture is replaced by what the
 * count is made of.
 *
 * **Two kinds at most.** The counts partition the total, so a reader can
 * subtract: "138 items · Video 135 · Document 3" leaves nothing to guess
 * about, and a third entry costs a line of width to say what the first
 * two already implied.
 *
 * **A single kind is named without its count** — the caller renders
 * "12 items · Document", not "12 items · Document 12". One column whose
 * distinct values number one is not a column (`lib/listMeta.ts` applies
 * the same rule to the file listing's columns).
 *
 * Ties break on the kind's name so two folders holding the same mix are
 * described the same way, rather than on whatever order the API returned.
 */
export const MAX_BREAKDOWN_KINDS = 2;

export interface KindShare {
  kind: FolderKind;
  count: number;
}

export function folderKindBreakdown(
  kindCounts: Record<string, number>,
): KindShare[] {
  return Object.entries(kindCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_BREAKDOWN_KINDS)
    .map(([kind, count]) => ({ kind: kind as FolderKind, count }));
}
