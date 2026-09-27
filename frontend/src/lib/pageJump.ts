import {
  AlertTriangle,
  FilePlus,
  Files,
  FolderTree,
  Gauge,
  History,
  Home,
  Star,
  ThumbsUp,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { driveHref } from "./driveViews";

export const JUMP_LIMIT = 3;

export interface FixedJump {
  key: string;
  /** A key under the root messages, e.g. `sidebar.home`. */
  labelKey: string;
  icon: LucideIcon;
  href: (drive: string) => string;
  visible?: (ctx: FixedJumpContext) => boolean;
}

export interface FixedJumpContext {
  missingCount: number;
  isAdmin: boolean;
}

const view = (name: string) => (drive: string) =>
  `/drive/${encodeURIComponent(drive)}?view=${name}`;

/** Sidebar order. Each row's visibility matches the sidebar's own condition. */
export const FIXED_JUMPS: readonly FixedJump[] = [
  { key: "home", labelKey: "sidebar.home", icon: Home, href: (d) => driveHref(d, "home") },
  { key: "library", labelKey: "sidebar.library", icon: FolderTree, href: (d) => driveHref(d, "library") },
  { key: "favorites", labelKey: "sidebar.favorites", icon: Star, href: view("favorites") },
  { key: "liked", labelKey: "sidebar.liked", icon: ThumbsUp, href: view("liked") },
  { key: "recent", labelKey: "sidebar.recentlyViewed", icon: History, href: view("recent") },
  { key: "recentAdded", labelKey: "sidebar.recentAdded", icon: FilePlus, href: view("recent-added") },
  { key: "allFiles", labelKey: "sidebar.allFiles", icon: Files, href: view("all") },
  { key: "trash", labelKey: "sidebar.trash", icon: Trash2, href: view("trash") },
  {
    key: "missing",
    labelKey: "missing.sidebar",
    icon: AlertTriangle,
    href: view("missing"),
    visible: ({ missingCount }) => missingCount > 0,
  },
  {
    key: "admin",
    labelKey: "admin.title",
    icon: Gauge,
    href: () => "/admin",
    visible: ({ isAdmin }) => isAdmin,
  },
];

export function visibleFixedJumps(ctx: FixedJumpContext): FixedJump[] {
  return FIXED_JUMPS.filter((jump) => jump.visible?.(ctx) ?? true);
}

function normalise(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

/**
 * Prefix matches first, then substring matches; within each, the order the
 * candidates were given in.
 */
export function matchJumps<T extends { names: readonly string[] }>(
  candidates: readonly T[],
  query: string,
): T[] {
  const needle = normalise(query.trim());
  if (!needle) return [];

  const prefix: T[] = [];
  const substring: T[] = [];
  for (const candidate of candidates) {
    const names = candidate.names.map(normalise);
    if (names.some((name) => name.startsWith(needle))) prefix.push(candidate);
    else if (names.some((name) => name.includes(needle))) substring.push(candidate);
  }
  return [...prefix, ...substring].slice(0, JUMP_LIMIT);
}

export const FOLDER_LIMIT = 5;

export interface IndexedFolder {
  key: string;
  name: string;
  path: string;
  depth: number;
  normalisedName: string;
}

/** Built once per load so a keystroke only compares strings. */
export function indexFolders(
  nodes: readonly { kind: string; name: string; path: string }[],
): IndexedFolder[] {
  return nodes
    .filter((node) => node.kind === "folder")
    .map((node) => ({
      key: folderJumpKey(node.path),
      name: node.name,
      path: node.path,
      depth: node.path.split("/").length,
      normalisedName: normalise(node.name),
    }));
}

/** A folder's identity in the modal, shared by pin rows and folder rows. */
export function folderJumpKey(path: string): string {
  return `folder:${path}`;
}

/**
 * Prefix matches first, then substring matches; within each, shallower
 * folders first, then by path. `exclude` holds keys already on screen.
 */
export function matchFolders(
  folders: readonly IndexedFolder[],
  query: string,
  exclude: ReadonlySet<string>,
): IndexedFolder[] {
  const needle = normalise(query.trim());
  if (!needle) return [];

  const ranked: { folder: IndexedFolder; rank: number }[] = [];
  for (const folder of folders) {
    if (exclude.has(folder.key)) continue;
    if (folder.normalisedName.startsWith(needle)) ranked.push({ folder, rank: 0 });
    else if (folder.normalisedName.includes(needle)) ranked.push({ folder, rank: 1 });
  }
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.folder.depth - b.folder.depth ||
      (a.folder.path < b.folder.path ? -1 : a.folder.path > b.folder.path ? 1 : 0),
  );
  return ranked.slice(0, FOLDER_LIMIT).map((r) => r.folder);
}
