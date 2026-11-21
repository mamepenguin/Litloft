import type { Shelf } from "@/lib/api";

/** NFC and no trailing slash, the form the listing's `folder` compares. */
export function normalizeFolder(value: string): string {
  return value.normalize("NFC").replace(/\/+$/, "");
}

/** The shelf that holds the files directly in `base`, never a chip. */
export function baseShelfKey(base: string): string {
  const normal = normalizeFolder(base);
  return normal === "" ? "" : `${normal}/`;
}

export function folderInside(child: string, parent: string): boolean {
  const inner = normalizeFolder(child);
  const outer = normalizeFolder(parent);
  if (outer === "") return true;
  return inner === outer || inner.startsWith(`${outer}/`);
}

/**
 * A chip is the folder the viewer wants, and the target's folders narrow it
 * rather than widen it: a folder inside the chip stays, a folder containing
 * the chip is replaced by it, and anything else is dropped.
 */
export function narrowFolders(folders: readonly string[], chip: string): string[] {
  const chosen = normalizeFolder(chip);
  if (folders.length === 0) return [chosen];

  const next: string[] = [];
  for (const folder of folders) {
    const held = normalizeFolder(folder);
    if (folderInside(held, chosen)) {
      if (!next.includes(held)) next.push(held);
    } else if (folderInside(chosen, held)) {
      if (!next.includes(chosen)) next.push(chosen);
    }
  }
  return next;
}

export interface FolderChip {
  key: string;
  label: string;
  count: number;
}

/** The base shelf is not a chip and does not count toward the cap. */
export function chipsFromShelves(
  shelves: readonly Shelf[],
  base: string,
  limit = 120,
): FolderChip[] {
  const direct = baseShelfKey(base);
  const chips: FolderChip[] = [];
  for (const shelf of shelves) {
    if (shelf.key === direct) continue;
    chips.push({ key: shelf.key, label: shelf.label, count: shelf.count });
    if (chips.length >= limit) break;
  }
  return chips;
}
