import type { FileItem } from "@/types";

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
}

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
    return { showTypeLabel: true, showExtensionBadge: true };
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

  return {
    showTypeLabel: types.size > 1,
    // Same threshold, applied to the rows the column actually covers: a
    // single badge among many rows is what marks that row out.
    showExtensionBadge: badged < 2 || extensions.size > 1,
  };
}
