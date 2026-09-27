import { pinHrefFor } from "@/components/sidebar/libraryRowActive";

import { driveHref } from "./driveViews";
import { normalise } from "./pageJump";

export const BROWSE_LIMIT = 100;

export interface BrowseNode {
  kind: "folder" | "file";
  name: string;
  path: string;
  file_id?: string | null;
  file_type?: string | null;
}

export function filterBrowseRows<T extends BrowseNode>(nodes: readonly T[], query: string): T[] {
  const needle = normalise(query.trim());
  const kept = needle ? nodes.filter((node) => normalise(node.name).includes(needle)) : nodes;
  return kept.slice(0, BROWSE_LIMIT);
}

/** The drive root opens the Library. */
export function browseFolderHref(drive: string, path: string): string {
  return path ? pinHrefFor(`/drive/${encodeURIComponent(drive)}`, path) : driveHref(drive, "library");
}

export function browseRowHref(drive: string, node: BrowseNode): string {
  return node.kind === "file" && node.file_id ? `/files/${node.file_id}` : browseFolderHref(drive, node.path);
}

/**
 * Outside browse mode: the folder → starts browsing, or null to let the key
 * do what it does today.
 */
export function launchKeyAction(
  key: string,
  selectedIndex: number,
  jumps: readonly { folderPath?: string }[],
  scoped: boolean,
): string | null {
  if (scoped || key !== "ArrowRight" || selectedIndex < 0) return null;
  return jumps[selectedIndex]?.folderPath ?? null;
}

/** An empty input that becomes a lone "/" starts browsing at the drive root. */
export function startsRootBrowse(previous: string, next: string): boolean {
  return previous === "" && next === "/";
}

export type BrowseAction =
  | { kind: "move"; index: number }
  | { kind: "enter"; path: string }
  | { kind: "up" }
  | { kind: "open"; row: BrowseNode | null }
  | { kind: "none" };

/** In browse mode. `none` leaves the key to the input. */
export function browseKeyAction(
  key: string,
  query: string,
  selectedIndex: number,
  rows: readonly BrowseNode[],
): BrowseAction {
  const selected = selectedIndex >= 0 ? rows[selectedIndex] : undefined;
  switch (key) {
    case "ArrowDown":
      return { kind: "move", index: Math.min(rows.length - 1, selectedIndex + 1) };
    case "ArrowUp":
      return { kind: "move", index: Math.max(-1, selectedIndex - 1) };
    case "ArrowRight":
      return selected?.kind === "folder" ? { kind: "enter", path: selected.path } : { kind: "none" };
    case "ArrowLeft":
    case "Backspace":
      return query === "" ? { kind: "up" } : { kind: "none" };
    case "Enter":
      return { kind: "open", row: selected ?? null };
    default:
      return { kind: "none" };
  }
}
